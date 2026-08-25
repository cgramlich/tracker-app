// The 7-day horizon buckets.
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
const TODAY_STR = "2026-08-12";
const prelude = `
function todayKey(d){ const x=new Date(d); return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0"); }
function TODAY(){ return "${TODAY_STR}"; }
function snzAddDays(n){ const d=new Date("${TODAY_STR}T12:00:00"); d.setDate(d.getDate()+n); return d; }
`;
const names = ["WEEK_DAYS", "weekBuckets", "weekCount", "headsUpWeek"];
const W = new Function(prelude + names.map(lift).join("\n") +
  "\nreturn {WEEK_DAYS,weekBuckets,weekCount,headsUpWeek};")();

let pass = 0, fail = 0;
function is(l, g, w) {
  if (JSON.stringify(g) === JSON.stringify(w)) { pass++; console.log("  ok   " + l); }
  else { fail++; console.log("  FAIL " + l + "\n       got  " + JSON.stringify(g) + "\n       want " + JSON.stringify(w)); }
}
const t = (o) => Object.assign({ status: "next", title: "x" }, o);
const D = (n) => { const d = new Date("2026-08-12T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

console.log("[shape]");
const empty = W.weekBuckets([]);
is("always seven buckets, even when empty", empty.length, 7);
is("first bucket is TODAY - the week includes today by design", empty[0].key, TODAY_STR);
is("last bucket is today+6", empty[6].key, D(6));
is("empty days are kept so the week's shape is visible", empty.map(b => b.items.length), [0,0,0,0,0,0,0]);

console.log("[bucketing]");
const list = [
  t({ title: "today", due: TODAY_STR }),
  t({ title: "tomorrow", due: D(1) }),
  t({ title: "friday", due: D(3) }),
  t({ title: "day7", due: D(6) }),
  t({ title: "too far", due: D(7) }),
  t({ title: "deferred in", defer: D(2) }),
];
const b = W.weekBuckets(list);
is("each item lands on its own day", b.map(x => x.items.map(i => i.title)),
  [["today"], ["tomorrow"], ["deferred in"], ["friday"], [], [], ["day7"]]);
is("day 8 is outside the window", W.weekCount(list), 5);

console.log("[exclusions match the other day views]");
is("done never appears", W.weekCount([t({ due: D(2), status: "done" })]), 0);
is("someday never appears", W.weekCount([t({ due: D(2), status: "someday" })]), 0);
is("undated work never appears", W.weekCount([t({})]), 0);
// Overdue belongs to no day and is Today's business, not the horizon's.
is("overdue is NOT folded into today's bucket", W.weekCount([t({ due: "2026-07-01" })]), 0);
// Same defer-beats-due rule as the Tomorrow view.
is("due in-window but deferred past the window is hidden",
  W.weekCount([t({ due: D(2), defer: "2026-12-01" })]), 0);
is("due in-window with a past defer still shows",
  W.weekCount([t({ due: D(2), defer: "2026-08-01" })]), 1);

console.log("[headsUpWeek]");
is("nothing at all", W.headsUpWeek([]).line, "Nothing scheduled in the next 7 days.");
is("singular", W.headsUpWeek([t({ due: D(2) })]).line, "1 thing across the next 7 days.");
is("plural", W.headsUpWeek([t({ due: D(2) }), t({ due: D(3) })]).line, "2 things across the next 7 days.");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
