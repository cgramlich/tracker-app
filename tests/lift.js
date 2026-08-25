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

function lift(name) {
  const start = SRC.search(new RegExp("^(?:const |function )" + name + "\\b", "m"));
  if (start < 0) throw new Error("lift: could not find " + name + " in index.html");
  // A `const NAME = ...;` one-liner is taken to end of line.
  if (/^const /.test(SRC.slice(start))) return SRC.slice(start, SRC.indexOf("\n", start));

  // Skip the parameter list before brace-matching the body.
  let p = SRC.indexOf("(", start), pd = 0;
  for (; p < SRC.length; p++) {
    if (SRC[p] === "(") pd++;
    else if (SRC[p] === ")" && --pd === 0) { p++; break; }
  }
  let i = SRC.indexOf("{", p), depth = 0;
  if (i < 0) throw new Error("lift: no body for " + name);
  for (; i < SRC.length; i++) {
    if (SRC[i] === "{") depth++;
    else if (SRC[i] === "}" && --depth === 0) { i++; break; }
  }
  const body = SRC.slice(start, i);
  const decls = (body.match(/^function /gm) || []).length;
  if (decls !== 1) throw new Error("lift(" + name + ") captured " + decls + " declarations");
  return body;
}

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

module.exports = { lift, build, is, section, report };
