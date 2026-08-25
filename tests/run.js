/* Test runner for Priority Captain.
   ===========================================================================
   WHAT THIS OWNS: running every *.test.js in this folder and failing loudly if
   any of them fail. It does NOT compile the app - that is check.js, and both
   gates should pass before a deploy.

   WHY THIS FOLDER EXISTS AT ALL: these suites originally lived in a session
   scratchpad under AppData\Local\Temp. Windows cleaned it twice and roughly 175
   tests were lost - tests covering the sync store, the habit migration that
   DELETES rows, and the decision/event-link shapes. Regression cover for an app
   that mutates a user's only copy of their data does not belong in a temp
   directory. Anything worth testing goes here, in the repo, versioned.

   The suites deliberately LIFT their subject out of index.html rather than
   restating it, so a test can never quietly drift from the shipping code.
   Run: npm test  (or: node tests/run.js) */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith(".test.js")).sort();

if (!files.length) {
  console.error("[TESTS] FAIL: no *.test.js files found in " + dir);
  process.exit(1);
}

let failed = 0, totalPass = 0;
for (const f of files) {
  const label = f.replace(/\.test\.js$/, "");
  try {
    const out = execFileSync(process.execPath, [path.join(dir, f)], { encoding: "utf8" });
    const m = out.match(/(\d+) passed, (\d+) failed/);
    totalPass += m ? Number(m[1]) : 0;
    console.log("  PASS  " + label.padEnd(18) + (m ? m[0] : "ok"));
  } catch (e) {
    failed++;
    console.log("  FAIL  " + label);
    // Print only the assertion lines, not the whole stack - the failing
    // expectation is what you need, and a stack buries it.
    const body = String((e.stdout || "") + (e.stderr || ""));
    body.split("\n").filter(l => /FAIL|Error|got |want /.test(l)).slice(0, 20)
        .forEach(l => console.log("        " + l.trim()));
  }
}

console.log("");
if (failed) {
  console.error("[TESTS] " + failed + " suite(s) FAILED of " + files.length);
  process.exit(1);
}
console.log("[TESTS] OK: " + files.length + " suite(s), " + totalPass + " assertions passed");
