/* The self-update mechanism.
   ===========================================================================
   WHY THIS SUITE EXISTS: on 2026-08-30 a peer session reported that this app's
   update banner was dead from BUILD-stamp rot - BUILD frozen while index.html
   kept changing, so the comparison always concluded "no update" and installed
   users would silently never upgrade. That was true of a sibling app. It was
   NOT true here, but nothing in this repo could have proved it either way,
   because `buildIsNewer` had no test at all despite being the single function
   the entire update path hinges on.

   Silent-failure shape: if this comparator is wrong, nothing errors. Users just
   stop receiving updates and no one finds out until someone checks by hand. */
const { build, lift, is, section, report } = require("./lift");

const U = build(["buildIsNewer"], "");

section("ordering - the comparator is an ORDINAL compare, not a date parse");
is("a later day is newer", U.buildIsNewer("2026-08-27.1", "2026-08-14.2"), true);
is("an earlier day is not", U.buildIsNewer("2026-08-14.2", "2026-08-27.1"), false);
is("identical is NOT newer - this is what stops a permanent update prompt",
  U.buildIsNewer("2026-08-27.1", "2026-08-27.1"), false);
is("same day, higher counter wins", U.buildIsNewer("2026-08-14.2", "2026-08-14.1"), true);
is("same day, lower counter loses", U.buildIsNewer("2026-08-14.1", "2026-08-14.2"), false);
is("a month rollover compares correctly", U.buildIsNewer("2026-09-01.1", "2026-08-31.9"), true);
is("a year rollover compares correctly", U.buildIsNewer("2027-01-01.1", "2026-12-31.1"), true);
// Zero-padding must not be load-bearing: "08" and "8" parse to the same number.
is("padding does not change the answer", U.buildIsNewer("2026-8-27.1", "2026-08-14.1"), true);

section("degenerate input cannot produce a phantom update");
is("empty remote is never newer", U.buildIsNewer("", "2026-08-27.1"), false);
is("null remote is never newer", U.buildIsNewer(null, "2026-08-27.1"), false);
is("garbage remote is never newer", U.buildIsNewer("not-a-build", "2026-08-27.1"), false);
is("both empty is not newer", U.buildIsNewer("", ""), false);

section("this repo's REAL shipped sequence must be strictly increasing");
/* Taken from git history: every commit that touched index.html. If any adjacent
   pair fails to increase, every user installed on the earlier build stops
   receiving updates permanently. */
const shipped = [
  "2026-07-28.2", "2026-07-28.3", "2026-07-28.4", "2026-07-28.5", "2026-07-28.6",
  "2026-08-01.1", "2026-08-01.2", "2026-08-07.1", "2026-08-09.3",
  "2026-08-14.1", "2026-08-14.2", "2026-08-27.1", "2026-09-12.1", "2026-09-13.1",
  "2026-09-25.1",
];
let monotonic = true, offender = "";
for (let i = 1; i < shipped.length; i++) {
  if (!U.buildIsNewer(shipped[i], shipped[i - 1])) { monotonic = false; offender = shipped[i - 1] + " -> " + shipped[i]; }
}
is("every shipped build sorts after the one before it" + (offender ? " (" + offender + ")" : ""), monotonic, true);
is("no two shipped builds are identical", new Set(shipped).size, shipped.length);

section("BUILD stamps may LAG the calendar - that is legal");
/* v1.46.0 shipped 2026-08-20 carrying 2026-08-14.1, and v1.47.0 shipped
   2026-08-25 carrying 2026-08-14.2. A stamp behind its commit date is harmless
   because the comparator never looks at the real calendar. What is NOT legal is
   a stamp that sorts at or below what is already live. */
is("a lagging stamp still updates, as long as it sorts after the live one",
  U.buildIsNewer("2026-08-14.1", "2026-08-09.3"), true);
is("but a stamp that sorts BELOW the live one silently kills the banner",
  U.buildIsNewer("2026-08-09.9", "2026-08-14.1"), false);

section("the extraction regex the updater actually uses");
/* The updater regexes BUILD out of the fetched document. If index.html's
   declaration is ever reformatted, the regex silently matches nothing and the
   app goes permanently blind to updates - no error, no symptom. */
const SRC = require("fs").readFileSync(require("path").join(__dirname, "..", "index.html"), "utf8");
const m = SRC.match(/const BUILD = "([^"]+)";/);
is("BUILD is declared in the exact shape the updater greps for", !!m, true);
is("and it parses as a build stamp", /^\d{4}-\d{2}-\d{2}\.\d+$/.test(m ? m[1] : ""), true);
const mv = SRC.match(/const APP_VERSION = "([^"]+)";/);
is("APP_VERSION likewise", /^\d+\.\d+\.\d+$/.test(mv ? mv[1] : ""), true);

section("sw.js VERSION is in lockstep with APP_VERSION");
/* A stale sw.js VERSION serves stale cached assets, because cache names derive
   from it and `activate` deletes everything that does not match. */
const SW = require("fs").readFileSync(require("path").join(__dirname, "..", "sw.js"), "utf8");
const msw = SW.match(/const VERSION\s*=\s*"([^"]+)"/);
is("sw.js declares a VERSION", !!msw, true);
is("and it equals APP_VERSION", msw && mv ? msw[1] === mv[1] : false, true);

report();
