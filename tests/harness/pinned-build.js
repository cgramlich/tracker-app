/* Pinned-project card preview harness.
   Renders the REAL PinnedProjectsCard and TodoRow with the whole real <style>
   block at phone width. Pick a state with the URL hash:
     #one     one pinned project with a few open todos
     #many    two pinned projects, one with more than the card shows inline
     #empty   a pinned project with nothing open
     #none    nothing pinned (the card must render nothing at all)
   Same two rules as build.js: lift the whole stylesheet, and parse-check the stub. */
const fs = require("fs");
const path = require("path");
const { liftFrom } = require("../lift");

const ROOT = path.join(__dirname, "..", "..");
const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const out = path.join(__dirname, "pinned.html");

const css = (src.match(/<style>([\s\S]*?)<\/style>/) || [])[1];
if (!css) throw new Error("no <style> block found in index.html");
for (const sel of [".card", ".list", ".item", ".hint", ".chip"]) {
  if (!new RegExp("\\" + sel + "[\\s{,.]").test(css)) throw new Error("assert failed: " + sel + " missing from the lifted CSS");
}

const fns = ["pinnedProjects", "projectTodos", "Check", "TypeChip", "TodoRow", "PinnedProjectsCard"]
  .map(n => liftFrom(src, n)).join("\n\n");

const stub = `
const { useState, useRef, useEffect } = React;
const DEFAULT_SPACE = "personal";
let _u = 0; function uid(){ return "u" + (++_u); }
function log(){}
function fmtDate(d){ return d ? "Oct 20" : ""; }
function sortTodos(a,b){ return 0; }
function isOverdue(){ return false; } function isToday(){ return false; }
function isDeferredAway(){ return false; } function fmtDefer(){ return ""; }
function waitingDays(){ return 3; } function waitThreshold(){ return 7; }
const QUADRANTS = { q1:{label:"Do first"} };
function snoozeTodo(){} function SnoozeSheet(){ return null; }
const Ic = { star:"\\u2605", clock:"\\u25F4" };

const projects = [
  { id:"p1", name:"Finalize the CEO and transition agreements", pinned:true, status:"active", space:"work", deadline:"2026-10-20" },
  { id:"p2", name:"Kitchen reno", pinned:true, status:"onhold", space:"personal" },
  { id:"p3", name:"Not pinned", status:"active", space:"personal" },
];
const mk = (id,pid,title,space,status) => ({ id, projectId:pid, title, space, status, type:"", tags:[], subtasks:[] });
const todos = [
  mk("t1","p1","Send the redline to counsel for a final read before Friday","work","next"),
  mk("t2","p1","Confirm the effective date","personal","next"),
  mk("t3","p1","Chase signatures","work","waiting"),
  mk("t4","p1","Already finished","work","done"),
  mk("t5","p1","Fifth item","work","next"),
  mk("t6","p1","Sixth item","work","next"),
  mk("t7","p1","Seventh item","work","next"),
];

function Harness(){
  const view = (location.hash || "#one").slice(1);
  const pins = view === "none" ? [projects[2]]
             : view === "many" ? projects
             : view === "empty" ? [projects[1]]
             : [projects[0]];
  const t = view === "one" ? todos.slice(0,4) : todos;
  const store = {
    activeSpace:"work",
    data:{ projects: pins },
    allData:{ projects: pins, todos: t },
    completeTodo:(x)=>{ window.__completed = x.id; },
    upsert:(f,row)=>{ window.__upsert = row; },
  };
  return <div style={{padding:16,maxWidth:390,margin:"0 auto"}}>
    <PinnedProjectsCard store={store} onOpenTodo={(x)=>{ window.__opened = x.id; }}
      openProject={(p)=>{ window.__wentTo = p.id; }}/>
  </div>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
window.addEventListener("hashchange", () => location.reload());
`;

fs.writeFileSync(out, `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pinned project harness</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.26.2/babel.min.js"></script>
<style>${css}</style></head><body><div id="root"></div>
<script type="text/babel">${stub}

${fns}
</script></body></html>`, "utf8");

const Babel = require(require.resolve("@babel/standalone", { paths: [ROOT] }));
Babel.transform(stub + "\n" + fns, { presets: ["react"], filename: "stub.jsx" });
console.log("[HARNESS] wrote " + out + " - stub parsed clean");
