/* The orientation comment at the top of index.html must stay inert.
   ===========================================================================
   Added with v1.58.2 (2026-11-08). That comment is the first thing in the file,
   and several pieces of code read index.html as TEXT and take the FIRST match:

     - check.js compiles the first `<script type="text/babel"` block it finds;
     - lift.js takes the first line starting `const NAME` or `function NAME`;
     - the in-app updater fetches the live index.html and reads the first
       `const BUILD = "..."` ANYWHERE in it, not just at a line start;
     - several suites slice the source between phrases, for example
       projects.test.js slices from the projects view up to the banner title
       "VIEW: IDEAS".

   A comment that repeats any of those wins the search. The updater case is the
   one that fails silently: it would read the comment's number instead of the
   real build, so installed copies either never offer an update again (an older
   number) or offer one on every launch (a newer one). Nothing errors.

   So this suite states each RULE, checks the shipping file against it, and then
   proves every rule on a deliberately broken copy. A guard that has never been
   seen to fail is not a guard (see the fail-open tripwire, HANDOFF 2026-09-28).

   It also guards against passing vacuously: if the scan of the other suites
   finds too few phrases, or the banner scan finds too few titles, it fails
   rather than reporting a clean result over an empty list. */
const fs = require("fs");
const path = require("path");
const { is, section, report, SRC } = require("./lift");

const ROOT = path.join(__dirname, "..");
const RAW = fs.readFileSync(path.join(ROOT, "index.html"));   // bytes, so the BOM is visible

/* The patterns the shipping code actually uses. They are restated here, so the
   first section asserts the shipping code still contains them verbatim: if
   check.js or the updater ever changes its pattern, this suite fails and says so
   instead of quietly testing an old one. */
const GATE_SOURCE    = 'html.match(/<script type="text\\/babel"[^>]*>([\\s\\S]*?)<\\/script>/)';
const UPDATER_SOURCE = 'html.match(/const BUILD = "([^"]+)";/)';
const GATE_RE    = /<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/;
const UPDATER_RE = /const BUILD = "([^"]+)";/;

/* Every literal phrase another suite searches index.html for. Taken from calls
   on the source text (indexOf, includes, split and friends), from the anchors
   store.test.js strips with without(), and from .replace() on the source. A
   phrase the comment repeats would be found there first. */
function testAnchors() {
  const files = [];
  for (const f of fs.readdirSync(__dirname)) {
    if (f.endsWith(".js") && f !== path.basename(__filename)) files.push(path.join(__dirname, f));
  }
  const harness = path.join(__dirname, "harness");
  if (fs.existsSync(harness)) {
    for (const f of fs.readdirSync(harness)) if (f.endsWith(".js")) files.push(path.join(harness, f));
  }
  const STR = "([\"'`])((?:[^\\\\]|\\\\[\\s\\S])*?)";
  const patterns = [
    { re: new RegExp("(?:SRC|src|html)\\.(?:indexOf|includes|lastIndexOf|split|startsWith)\\(\\s*" + STR + "\\1", "g"), group: 2, min: 3 },
    { re: new RegExp("without\\(\\s*([\"'`])(?:[^\\\\]|\\\\[\\s\\S])*?\\1\\s*,\\s*([\"'`])((?:[^\\\\]|\\\\[\\s\\S])*?)\\2", "g"), group: 3, min: 3 },
    { re: new RegExp("\\.replace\\(\\s*" + STR + "\\1", "g"), group: 2, min: 8 },
  ];
  const unescape = s => s.replace(/\\n/g, "\n").replace(/\\(["'`\\])/g, "$1");
  const found = new Set();
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    for (const p of patterns) {
      p.re.lastIndex = 0;
      let m;
      while ((m = p.re.exec(text))) {
        const lit = unescape(m[p.group]);
        if (lit.length >= p.min) found.add(lit);
      }
    }
  }
  return [...found];
}

/* The opening phrase of every banner title in the file below the comment, such
   as "VIEW: IDEAS" or "DATA STORE HOOK". This covers titles no suite slices on
   YET, so the rule holds for the next suite too. Phrases under 8 characters
   ("AI", "MOUNT") are skipped: no suite could anchor on a word that common. */
function bannerTitles(text) {
  const titles = new Set();
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    let title = null;
    if (/^\s*\/\* ={10,}/.test(lines[i]) && i + 1 < lines.length) title = lines[i + 1];
    const m = lines[i].match(/^\s*\/\* (?:─{2,}|-{3,}) (.+?) (?:─{2,}|-{3,})/);
    if (m) title = m[1];
    if (!title) continue;
    title = title.trim().split(/ {2,}| - | \(|\. /)[0].trim();
    if (title.length >= 8) titles.add(title);
  }
  return [...titles];
}

/* The orientation comment: the first HTML comment, which must close before
   <html and before any script tag. */
function orientationComment(text) {
  const open = text.indexOf("<!--");
  const close = open < 0 ? -1 : text.indexOf("-->", open);
  const htmlTag = text.indexOf("<html");
  const firstScript = text.indexOf("<script");
  if (open < 0 || close < 0 || close > htmlTag || (firstScript >= 0 && firstScript < open)) return null;
  return { body: text.slice(open + 4, close), end: close + 3 };
}

/* Every rule, as a list of short problem codes. An empty list means inert. */
function problems(buf, anchors) {
  const out = [];
  if (!(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf)) out.push("bom");
  const text = buf.toString("utf8");
  const c = orientationComment(text);
  if (!c) { out.push("no-comment"); return out; }
  const body = c.body;

  // Plain ASCII, so no editor or encoding round trip can turn it into mojibake.
  // Carriage returns are allowed: a Windows checkout may convert line endings.
  for (let i = 0; i < body.length; i++) {
    const code = body.charCodeAt(i);
    if (code > 126 || (code < 32 && code !== 10 && code !== 13)) { out.push("ascii"); break; }
  }
  if (body.includes("<script")) out.push("script");              // the compile gate's tag
  if (body.includes("const ")) out.push("const");                // the updater and the lifters
  if (/^function /m.test(body)) out.push("function-line");       // the lifters
  if (body.includes("--")) out.push("double-hyphen");            // not allowed inside an HTML comment
  for (const a of anchors) if (body.includes(a)) out.push("anchor:" + a);
  for (const t of bannerTitles(text.slice(c.end))) if (body.includes(t)) out.push("banner:" + t);

  // The outcomes the rules exist for: the gate and the updater must both find
  // their target AFTER the comment, in the real code.
  const gate = GATE_RE.exec(text);
  if (!gate || gate.index < c.end) out.push("gate-reads-comment");
  const upd = UPDATER_RE.exec(text);
  if (!upd || upd.index < c.end) out.push("updater-reads-comment");
  return out;
}

// --------------------------------------------------------------------------
section("the patterns this suite restates still match the shipping code");
is("check.js still finds the app with the pattern used here",
  fs.readFileSync(path.join(ROOT, "check.js"), "utf8").includes(GATE_SOURCE), true);
is("the in-app updater still reads BUILD with the pattern used here",
  SRC.includes(UPDATER_SOURCE), true);

const ANCHORS = testAnchors();
const TITLES = bannerTitles(RAW.toString("utf8"));

section("the scans found enough to mean something (no vacuous pass)");
is("at least 15 phrases harvested from the other suites", ANCHORS.length >= 15, true);
is("the harvest includes the banner title projects.test.js slices on", ANCHORS.includes("VIEW: IDEAS"), true);
is("the harvest includes a without() anchor from store.test.js", ANCHORS.includes("if(metaSeqRef.current === sentSeq){"), true);
is("at least 40 banner titles found in index.html", TITLES.length >= 40, true);

section("the shipping index.html");
is("the orientation comment exists, before <html and before any script", orientationComment(RAW.toString("utf8")) !== null, true);
is("it breaks none of the rules", problems(RAW, ANCHORS), []);
const live = UPDATER_RE.exec(RAW.toString("utf8"));
is("the updater's first match is the real build stamp in the app code",
  live !== null && live.index > RAW.toString("utf8").indexOf('<script type="text/babel"'), true);

// --------------------------------------------------------------------------
/* Each rule on a broken copy. The fault is planted just inside the comment;
   the copy keeps the BOM, because toString keeps it as U+FEFF and Buffer.from
   writes it back. */
const TEXT = RAW.toString("utf8");
function plant(insert) { return Buffer.from(TEXT.replace("<!--", "<!--\n  " + insert), "utf8"); }
function caught(buf, code) { return problems(buf, ANCHORS).includes(code); }

section("PROOF: each rule fails on a copy that breaks it");
is("a banner title a suite slices on is caught", caught(plant("see VIEW: IDEAS"), "anchor:VIEW: IDEAS"), true);
is("a banner title no suite uses yet is caught", caught(plant("the SPACE SWITCHER"), "banner:SPACE SWITCHER"), true);
is("a without() anchor is caught",
  caught(plant("if(metaSeqRef.current === sentSeq){"), "anchor:if(metaSeqRef.current === sentSeq){"), true);
is("a script tag is caught", caught(plant("the <script block"), "script"), true);
is("a full babel tag is caught as the gate compiling the comment",
  caught(plant('<script type="text/babel"> x </script>'), "gate-reads-comment"), true);
is("the word const is caught", caught(plant("the const declarations"), "const"), true);
is("a line starting with function is caught", caught(plant("x\nfunction helper"), "function-line"), true);
is("a double hyphen is caught", caught(plant("a -- b"), "double-hyphen"), true);
is("a non-ASCII character is caught", caught(plant("café"), "ascii"), true);
is("a missing BOM is caught", caught(RAW.subarray(3), "bom"), true);
is("a missing comment is caught", caught(Buffer.from(TEXT.replace("<!--", "<!- -"), "utf8"), "no-comment"), true);

/* The failure that matters most, shown end to end: a build stamp written into
   the comment is what the updater would read, and the suite catches it. */
const fakeStamp = plant('const BUILD = "9999-12-31.9";');
is("PROOF: the updater really would read a stamp planted in the comment",
  UPDATER_RE.exec(fakeStamp.toString("utf8"))[1], "9999-12-31.9");
is("and the suite catches it", caught(fakeStamp, "updater-reads-comment") && caught(fakeStamp, "const"), true);

report();
