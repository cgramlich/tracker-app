/* Preview harness builder.
   ===========================================================================
   WHAT THIS OWNS: rendering real components out of index.html in a browser so
   layout can be MEASURED at phone width. It does not test logic - that is
   tests/*.test.js.

   Two rules that are load-bearing, both learned the hard way:
   1. Lift the ENTIRE real <style> block, never a hand-picked subset. Copying a
      few CSS variables once hid a global svg{stroke:currentColor} rule that was
      drawing the radar's invisible tap targets as visible rings.
   2. PARSE-CHECK the generated stub. A silently broken stub renders a blank
      page with one console error, and the lifter has quietly mangled itself
      three separate times (a lazy regex swallowing the function after a
      one-liner; brace-matching from a destructured parameter list; forgetting
      to interpolate the lifted parts at all).

   Usage: node tests/harness/build.js [view]     default view: today
          then serve this folder and measure the DOM. */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const out = path.join(__dirname, "index.html");

const css = (src.match(/<style>([\s\S]*?)<\/style>/) || [])[1];
if (!css) throw new Error("no <style> block found in index.html");
for (const sel of [".seg", ".seg-b", ".rt-row", ".rt-box", ".sheet", ".affirm"]) {
  if (!new RegExp("\\" + sel + "[\\s{,.]").test(css)) {
    throw new Error("assert failed: " + sel + " missing from the lifted CSS");
  }
}

// Brace-match, skipping the parameter list. A regex to the next "\n}" breaks on
// one-line bodies, and counting from the first "{" breaks on destructured params.
function lift(name) {
  const start = src.search(new RegExp("^(?:const |function )" + name + "\\b", "m"));
  if (start < 0) throw new Error("could not find " + name);
  if (/^const /.test(src.slice(start))) return src.slice(start, src.indexOf("\n", start));
  let p = src.indexOf("(", start), pd = 0;
  for (; p < src.length; p++) { if (src[p] === "(") pd++; else if (src[p] === ")" && --pd === 0) { p++; break; } }
  let i = src.indexOf("{", p), depth = 0;
  for (; i < src.length; i++) { if (src[i] === "{") depth++; else if (src[i] === "}" && --depth === 0) { i++; break; } }
  const body = src.slice(start, i);
  const decls = (body.match(/^function /gm) || []).length;
  if (decls !== 1) throw new Error("lift(" + name + ") captured " + decls + " declarations");
  return body;
}

const parts = [
  "habitExpectedOn", "habitDoneSet", "habitDoneToday", "habitStreak", "habitToggle",
  "habitsInSpace", "habitsForToday",
  "TOMORROW", "tomorrowDate", "tomorrowItems", "todayItems", "headsUpTomorrow",
  "WEEK_DAYS", "weekBuckets", "weekCount", "headsUpWeek",
  "cleanAffirmation", "affirmationOfTheDay", "AffirmationLine",
  "RoutinesCard", "HabitsTomorrowCard", "TodayView",
].map(lift).join("\n\n");

const stub = `
const { useState } = React;
const DEFAULT_SPACE = "personal";
function todayKey(d){ const x=new Date(d); return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0"); }
function TODAY(){ return todayKey(new Date()); }
function snzAddDays(n){ const d=new Date(); d.setDate(d.getDate()+n); return d; }
function isToday(due){ return due === TODAY(); }
function isOverdue(due){ return !!due && due < TODAY(); }
function isDeferredAway(t){ return !!(t.defer && t.defer > TODAY()); }
function sortTodos(a,b){ return String(a.title||"").localeCompare(String(b.title||"")); }
function waitThreshold(){ return 7; }
function waitingDays(t){ return t.waitDays == null ? null : t.waitDays; }
let _ls = {};
function lsGet(k,d){ return k in _ls ? _ls[k] : d; }
function lsSet(k,v){ _ls[k]=v; }
function nowISO(){ return new Date().toISOString(); }
let _u=0; function uid(){ return "u"+(++_u); }
const Ic = { clock:"\\u25F7", now:"\\u25B6", check:"\\u2713", chevron:"\\u25BE" };

// Leaf stubs. None of these are what is under measurement.
function SwipeRow({ children }){ return <div>{children}</div>; }
function TodoRow({ todo }){ return <div className="item"><div className="item-body">
  <div className="item-title">{todo.title}</div>
  <div className="item-meta">{todo.due && <span className="chip">{todo.due}</span>}</div></div></div>; }
function Empty({ glyph, title, sub }){ return <div className="card" style={{marginTop:14,textAlign:"center",padding:"22px 16px"}}>
  <div style={{fontSize:26}}>{glyph}</div><b style={{fontFamily:"Fraunces",display:"block",marginTop:6}}>{title}</b>
  <p className="hint" style={{marginTop:6}}>{sub}</p></div>; }
function HeadsUpCard(){ return <div className="card" style={{marginTop:14}}>
  <div className="eyebrow" style={{marginBottom:6}}>Heads up</div>
  <p style={{fontFamily:"Fraunces",fontSize:16,lineHeight:1.45,margin:0,color:"var(--ink)"}}>2 overdue. 2 habits left.</p></div>; }
function HabitSheet(){ return null; }

const D = (n) => todayKey(snzAddDays(n));
const store = {
  activeSpace:"all", defaultSpace:"personal",
  affirmations: [
    { id:"af1", text:"Be bold in what you ask for, as long as it is carefully designed.", addedAt:"2026-01-01T00:00:00Z" },
    { id:"af2", text:"Slow is smooth and smooth is fast.", addedAt:"2026-01-01T00:00:00Z" },
  ],
  habits: [
    { id:"h1", name:"Complete daily exercise", cadence:"daily", space:"personal", startedAt:"2026-07-01", done:[] },
    { id:"h2", name:"Make one personal or business connection call daily", cadence:"daily", space:"personal", startedAt:"2026-07-01", done:[TODAY()] },
  ],
  data: {
    ideas: [],
    todos: [
      { id:"t1", title:"Research calling in a third-party like True Green", status:"next", due:"2026-07-06" },
      { id:"t2", title:"Send request for painting to RCC POA ACC", status:"next", due:"2026-07-11" },
      { id:"t3", title:"Call the title company back", status:"next", due:D(1) },
      { id:"t4", title:"Deferred to tomorrow", status:"next", defer:D(1) },
      { id:"t5", title:"Due tomorrow but deferred away - must NOT show", status:"next", due:D(1), defer:"2027-12-01" },
      { id:"t6", title:"Three days out", status:"next", due:D(3) },
      { id:"t7", title:"Six days out", status:"next", due:D(6) },
      { id:"t8", title:"Eight days out - outside the window", status:"next", due:D(8) },
    ],
  },
  saveHabits(){},
};
ReactDOM.createRoot(document.getElementById("root")).render(
  <div style={{padding:16,maxWidth:390,margin:"0 auto"}}>
    <TodayView store={store} onOpen={()=>{}} goNow={()=>{}} typeFilter="all" del={()=>{}} toast={()=>{}}/>
  </div>
);
`;

fs.writeFileSync(out, `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Priority Captain harness</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.26.2/babel.min.js"></script>
<style>${css}</style></head><body><div id="root"></div>
<script type="text/babel">${stub}

${parts}
</script></body></html>`, "utf8");

const Babel = require(require.resolve("@babel/standalone", { paths: [ROOT] }));
Babel.transform(stub + "\n" + parts, { presets: ["react"], filename: "stub.jsx" });
console.log("[HARNESS] wrote " + out);
console.log("[HARNESS] css " + css.length + " chars - stub parsed clean");
