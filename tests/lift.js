/* Shared test harness plumbing.
   ===========================================================================
   WHAT THIS OWNS: pulling a named function OUT of index.html so a suite tests
   the SHIPPING code rather than a copy of it, plus a two-function assert API.

   WHY LIFTING instead of importing: index.html is a single file with no module
   boundary and no build step - there is nothing to require(). Re-typing the
   function into a test would let the test and the app drift apart silently,
   which is the one failure mode a regression suite must not have.

   The lifter has broken three times and each fix is load-bearing:
     - a lazy regex to the next "\n}" swallowed everything after a ONE-LINE
       body (emptyDecision), silently pulling in the next two functions;
     - brace-matching from the first "{" truncated any function that
       DESTRUCTURES its parameters (DecisionField({ value, onChange }));
     - a lifted body containing a second declaration means the anchor matched
       something unexpected, so that is now a hard error rather than a guess.
   Do not "simplify" this back into a regex. */
const fs = require("fs");
const path = require("path");

const SRC = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

// Both lifters take the source text as a parameter so a suite can lift from a
// deliberately BROKEN copy of the app, which is how a regression test proves it
// would actually have caught the bug it is named after.
function liftFrom(src, name) {
  const start = src.search(new RegExp("^(?:const |function )" + name + "\\b", "m"));
  if (start < 0) throw new Error("lift: could not find " + name + " in index.html");
  // A `const NAME = ...;` one-liner is taken to end of line.
  if (/^const /.test(src.slice(start))) return src.slice(start, src.indexOf("\n", start));

  // Skip the parameter list before brace-matching the body.
  let p = src.indexOf("(", start), pd = 0;
  for (; p < src.length; p++) {
    if (src[p] === "(") pd++;
    else if (src[p] === ")" && --pd === 0) { p++; break; }
  }
  let i = src.indexOf("{", p), depth = 0;
  if (i < 0) throw new Error("lift: no body for " + name);
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) { i++; break; }
  }
  const body = src.slice(start, i);
  const decls = (body.match(/^function /gm) || []).length;
  if (decls !== 1) throw new Error("lift(" + name + ") captured " + decls + " declarations");
  return body;
}
function lift(name) { return liftFrom(SRC, name); }

/* Evaluate a set of lifted functions in a sandbox.
   `prelude` supplies whatever the app provides globally (date helpers, storage
   shims). Pin the clock there when a suite depends on the day of the week. */
function build(names, prelude) {
  const code = (prelude || "") + "\n" + names.map(lift).join("\n") +
               "\nreturn {" + names.filter(n => /^[a-z]/i.test(n)).join(",") + "};";
  return new Function(code)();
}

// --- assertions -----------------------------------------------------------
let pass = 0, fail = 0;
function is(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log("  ok   " + label); }
  else { fail++; console.log("  FAIL " + label + "\n       got  " + g + "\n       want " + w); }
}
function section(name) { console.log("[" + name + "]"); }
function report() {
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}

/* Lift a top-level `const NAME = ...;` that may span several lines (seed lists,
   config objects). Scans to the terminating ";" at bracket depth zero, skipping
   string contents so a bracket inside a quoted colour or label cannot end the
   scan early. `lift` is left untouched on purpose: every existing suite depends
   on its one-line behaviour for constants. */
function liftConstFrom(src, name) {
  const start = src.search(new RegExp("^const " + name + "\\b", "m"));
  if (start < 0) throw new Error("liftConst: could not find const " + name);
  let depth = 0, quote = null;
  for (let i = src.indexOf("=", start) + 1; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === "\\") { i++; continue; } if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === ";" && depth === 0) return src.slice(start, i + 1);
  }
  throw new Error("liftConst: no terminating ; for " + name);
}
function liftConst(name) { return liftConstFrom(SRC, name); }

module.exports = { lift, liftConst, liftFrom, liftConstFrom, build, is, section, report, SRC };
