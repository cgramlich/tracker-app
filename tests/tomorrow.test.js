// The Tomorrow view. Small filter, one trap: due-tomorrow and
// deferred-past-tomorrow disagree, and defer has to win.
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
function lift(name) {
  const start = src.search(new RegExp("^(?:const |function )" + name + "\\b", "m"));
  if (start < 0) throw new Error("could not find " + name);
  if (/^const /.test(src.slice(start))) return src.slice(start, src.indexOf("\n", start));
  let p = src.indexOf("(", start), pd = 0;
  for (; p < src.length; p++) { if (src[p] === "(") pd++; else if (src[p] === ")" && --pd === 0) { p++; break; } }
  let i = src.indexOf("{", p), depth = 0;
  for (; i < src.length; i++) { if (src[i] === "{") depth++; else if (src[i] === "}" && --depth === 0) { i++; break; } }
  const body = src.slice(start, i);
  if ((body.match(/^function /gm) || []).length !== 1) throw new Error("bad lift " + name);
  return body;
}
const TODAY_STR = "2026-08-12", TOM = "2026-08-13";   // Wednesday -> Thursday
const prelude = `
function todayKey(d){ const x=new Date(d); return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0"); }
function TODAY(){ return "${TODAY_STR}"; }
function snzAddDays(n){ const d=new Date("${TODAY_STR}T12:00:00"); d.setDate(d.getDate()+n); return d; }
`;
const names = ["habitExpectedOn", "habitDoneSet", "TOMORROW", "tomorrowDate", "tomorrowItems", "headsUpTomorrow"];
const T = new Function(prelude + names.map(lift).join("\n") +
  "\nreturn {TOMORROW,tomorrowDate,tomorrowItems,headsUpTomorrow};")();

let pass = 0, fail = 0;
function is(l, g, w) {
  if (JSON.stringify(g) === JSON.stringify(w)) { pass++; console.log("  ok   " + l); }
  else { fail++; console.log("  FAIL " + l + "\n       got  " + JSON.stringify(g) + "\n       want " + JSON.stringify(w)); }
}
const t = (o) => Object.assign({ status: "next", title: "x" }, o);
const ids = (list) => T.tomorrowItems(list).map(x => x.title);

console.log("[TOMORROW]");
is("is the day after today", T.TOMORROW(), TOM);

console.log("[what tomorrow includes]");
is("due tomorrow", ids([t({ title: "a", due: TOM })]), ["a"]);
is("deferred to tomorrow", ids([t({ title: "b", defer: TOM })]), ["b"]);

console.log("[what tomorrow must NOT include - today-only concepts]");
is("due today is not tomorrow's problem", ids([t({ title: "c", due: TODAY_STR })]), []);
is("overdue is a today concept", ids([t({ title: "d", due: "2026-07-01" })]), []);
is("starred-for-today does not carry over", ids([t({ title: "e", starredToday: true })]), []);
is("due next week", ids([t({ title: "f", due: "2026-08-20" })]), []);
is("done items never appear", ids([t({ title: "g", due: TOM, status: "done" })]), []);
is("someday items never appear", ids([t({ title: "h", due: TOM, status: "someday" })]), []);

console.log("[the trap: due and defer disagree, defer wins]");
is("due tomorrow but deferred PAST it is hidden",
  ids([t({ title: "i", due: TOM, defer: "2026-08-20" })]), []);
is("due tomorrow and deferred to tomorrow still shows",
  ids([t({ title: "j", due: TOM, defer: TOM })]), ["j"]);
is("due tomorrow with a PAST defer still shows",
  ids([t({ title: "k", due: TOM, defer: "2026-08-01" })]), ["k"]);

console.log("[headsUpTomorrow]");
const hab = (o) => Object.assign({ cadence: "daily", done: [] }, o);
is("nothing at all", T.headsUpTomorrow([], []).line, "Tomorrow is clear.");
is("one task reads singular", T.headsUpTomorrow([t({ due: TOM })], []).line, "1 lands tomorrow.");
is("several tasks read plural", T.headsUpTomorrow([t({ due: TOM }), t({ due: TOM })], []).line, "2 land tomorrow.");
is("tasks and habits together",
  T.headsUpTomorrow([t({ due: TOM })], [hab({}), hab({})]).line, "1 lands tomorrow. 2 habits due.");
is("habits only", T.headsUpTomorrow([], [hab({})]).line, "1 habit due.");
// Cadence must be evaluated for TOMORROW, not today. Thursday is a weekday.
is("a weekend habit is not due on a Thursday",
  T.headsUpTomorrow([], [hab({ cadence: "weekends" })]).line, "Tomorrow is clear.");
is("a weekday habit IS due on a Thursday",
  T.headsUpTomorrow([], [hab({ cadence: "weekdays" })]).line, "1 habit due.");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
