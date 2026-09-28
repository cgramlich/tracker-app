/* Edit project sheet preview harness.
   Renders the REAL ProjectEditor, Sheet and SpaceField with the whole real
   <style> block at phone width, to measure the todo-count line added 2026-09-28.
   EventLinkField is stubbed: it pulls the calendar layer, which this sheet's
   layout does not depend on. Pick a state with the URL hash:
     #some    a project with open and done todos
     #none    a project with no todos
     #new     a brand-new project (no count line at all)
   Same two rules as build.js: lift the whole stylesheet, and parse-check the stub. */
const fs = require("fs");
const path = require("path");
const { liftFrom } = require("../lift");

const ROOT = path.join(__dirname, "..", "..");
const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const out = path.join(__dirname, "project.html");

const css = (src.match(/<style>([\s\S]*?)<\/style>/) || [])[1];
if (!css) throw new Error("no <style> block found in index.html");
for (const sel of [".sheet", ".field", ".input", ".proj-count"]) {
  if (!new RegExp("\\" + sel + "[\\s{,.]").test(css)) throw new Error("assert failed: " + sel + " missing from the lifted CSS");
}

const fns = ["editorSpace", "projectTodos", "projectTodoCounts", "projectTodoCountLabel", "withLinked",
  "Sheet", "SpaceField", "ProjectEditor"].map(n => liftFrom(src, n)).join("\n\n");

const stub = `
const { useState, useRef, useEffect } = React;
const DEFAULT_SPACE = "personal";
let _u = 0; function uid(){ return "u" + (++_u); }
function log(){}
function nowISO(){ return new Date().toISOString(); }
const Ic = { close:"\\u00D7", back:"\\u2039" };
function knownCategories(){ return ["CG", "RTR", "Home"]; }
function cleanEventLink(e){ return e || null; }
function ConvertRow(){ return <div className="field"><span className="label">Convert to</span></div>; }
function EventLinkField(){ return <div className="field"><span className="label">On the calendar (optional)</span>
  <button className="btn btn-ghost btn-block">Attach to a calendar event</button></div>; }

const proj = { id:"p1", name:"Finalize the CEO agreement and the transition agreement", outcome:"Both agreements are finalized and signed.",
  type:"CG", status:"active", space:"work", goalId:"g-elsewhere" };
const todos = [
  { id:"t1", title:"Draft", projectId:"p1", space:"work", status:"next" },
  { id:"t2", title:"Review", projectId:"p1", space:"personal", status:"next" },
  { id:"t3", title:"Send", projectId:"p1", space:"work", status:"next" },
  { id:"t4", title:"Kickoff", projectId:"p1", space:"work", status:"done" },
];
const goals = [{ id:"g1", name:"Grow RTR", status:"active", space:"work" }];
const goalsAll = goals.concat([{ id:"g-elsewhere", name:"Linked goal in another Space", status:"active", space:"personal" }]);

function Harness(){
  const view = (location.hash || "#some").slice(1);
  const t = view === "none" ? [] : todos;
  const store = {
    activeSpace:"work", defaultSpace:"personal",
    spaces:[{ id:"personal", name:"Personal", order:0 }, { id:"work", name:"Work", order:1 }],
    data:{ goals, todos:t.filter(x => x.space === "work"), projects:[proj] },
    allData:{ goals:goalsAll, todos:t, projects:[proj] },
    upsert:(f, row) => { window.__saved = row; return row; },
  };
  const toast = (m) => { window.__toast = m; };
  return <ProjectEditor store={store} project={view === "new" ? null : proj} toast={toast} onClose={()=>{}}/>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
window.addEventListener("hashchange", () => location.reload());
`;

fs.writeFileSync(out, `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Project editor harness</title>
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
