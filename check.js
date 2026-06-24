// check.js - Babel-in-Node compile gate for the single-file PWA.
//
// WHY: index.html ships its whole app as one <script type="text/babel"> block
// that Babel compiles IN THE BROWSER at load time. There is no build step in
// production, so a single JSX syntax error white-screens the app with no clean
// error. This gate runs the SAME Babel + react preset the browser uses, in
// Node, so that class of error is caught before anything ships.
//
// Usage: node check.js [path-to-index.html]   (defaults to ./index.html)
// Exit 0 = compiled clean. Exit 1 = error (with a file-accurate line number).

const fs = require("fs");
const path = require("path");
const Babel = require("@babel/standalone");

const file = process.argv[2] || path.join(__dirname, "index.html");

let html;
try {
  html = fs.readFileSync(file, "utf8");
} catch (e) {
  console.error("[CHECK] FAIL: cannot read " + file + " (" + e.message + ")");
  process.exit(1);
}

// Grab the babel block. Non-greedy so it stops at the first </script> after the
// opening tag; the app's JSX contains no literal "</script>", so this is exact.
const m = html.match(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/);
if (!m) {
  console.error('[CHECK] FAIL: no <script type="text/babel"> block found in ' + file);
  process.exit(1);
}

const code = m[1];
// Absolute index where the block CONTENT begins, used to map Babel's
// block-relative line numbers back to real index.html line numbers.
const contentStart = m.index + m[0].indexOf(code);
const offset = html.slice(0, contentStart).split("\n").length;

try {
  Babel.transform(code, { presets: ["react"], filename: file });
  const lines = code.split("\n").length;
  console.log("[CHECK] OK: babel block compiled clean (" + lines + " lines, " + code.length + " chars)");
  process.exit(0);
} catch (e) {
  console.error("[CHECK] FAIL: JSX did not compile");
  if (e.loc) {
    const fileLine = offset + e.loc.line - 1;
    console.error("  at " + path.basename(file) + " line " + fileLine +
                  ", column " + e.loc.column + "  (babel-block line " + e.loc.line + ")");
  }
  console.error("  " + String(e.message).split("\n")[0]);
  process.exit(1);
}
