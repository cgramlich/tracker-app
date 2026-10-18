/* Pursuit card + chase line preview harness.
   Renders the REAL renderItemCard markup and PursuitChaseLine with the whole
   real <style> block at phone width. Pick a state with the URL hash:
     #cards   pursuit cards across every heat, waiting and overdue state
     #chase   the Dashboard chase line
     #quiet   nothing stalled (the line must render nothing at all)
   Same two rules as build.js: lift the whole stylesheet, and parse-check the stub. */
const fs = require("fs");
const path = require("path");
const { liftFrom, liftConstFrom } = require("../lift");

const ROOT = path.join(__dirname, "..", "..");
const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const out = path.join(__dirname, "pursuits.html");

const css = (src.match(/<style>([\s\S]*?)<\/style>/) || [])[1];
if (!css) throw new Error("no <style> block found in index.html");
for (const sel of [".rd-item", ".rd-chip", ".rd-line", ".rd-due", ".card"]) {
  if (!new RegExp("\\" + sel + "[\\s{,.]").test(css)) throw new Error("assert failed: " + sel + " missing from the lifted CSS");
}
for (const cls of ["heat-hot", "heat-warm", "heat-cold"]) {
  if (css.indexOf(cls) < 0) throw new Error("assert failed: ." + cls + " missing from the lifted CSS");
}

const consts = ["PURSUIT_HEAT", "PURSUIT_HEAT_MAP", "HEAT_RANK", "RUNDOWN_STATUSES", "RUNDOWN_STATUS_MAP", "ISO_DATE"]
  .map(n => liftConstFrom(src, n)).join("\n");
const fns = ["heatRank", "rundownWaitingDays", "pursuitsNeedingChase", "pursuitChaseLine",
  "daysBetweenISO", "isRealISODate", "PursuitChaseLine"].map(n => liftFrom(src, n)).join("\n\n");

const stub = `
const { useState, useRef, useEffect } = React;
const DEFAULT_WAIT_DAYS = 7;
function todayKey(d){ const x = d ? new Date(d) : new Date();
  return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0"); }
function TODAY(){ return todayKey(); }
function fmtDate(d){ if(!d) return ""; const x=new Date(d+"T00:00:00");
  return x.toLocaleDateString(undefined,{month:"short",day:"numeric"}); }
function waitThreshold(){ return 7; }
function decisionIsOpen(){ return false; } function decisionSummary(){ return ""; }
const Ic = { star:"\\u2605" };

const ago = (n) => { const d=new Date(); d.setDate(d.getDate()-n); return todayKey(d); };
const ahead = (n) => ago(-n);

const items = [
  { id:"a", pursuit:true, heat:"hot",  status:"waiting", waitingSince:ago(12), waitingOn:"Gabi at the client",
    name:"Aven servicing fee proposal", nextStep:"send the revised schedule", nextStepDue:ago(2) },
  { id:"b", pursuit:true, heat:"warm", status:"live",
    name:"Domu price appreciation - recipients and legal sign-off", nextStep:"get approval", nextStepDue:ahead(5) },
  { id:"c", pursuit:true, heat:"cold", status:"waiting", waitingSince:ago(3), waitingOn:"their counsel",
    name:"A smaller one" },
  { id:"d", pursuit:true, status:"live", name:"Unrated, nothing pending" },
  { id:"e", pursuit:true, heat:"hot", status:"won", name:"Already landed", waitingSince:ago(40) },
];

/* The card markup, copied from renderItemCard in index.html. It is a closure
   inside RundownView and cannot be lifted, so this mirrors it; the CHIPS and
   lines under test are the real classes from the real stylesheet. */
function Card({ it }){
  const st = RUNDOWN_STATUS_MAP[it.status];
  const w = rundownWaitingDays(it, TODAY());
  const over = w != null && w >= waitThreshold();
  return (
    <div className={"rd-item"+(it.pinned?" pinned":"")}>
      <div className="rd-head">
        {it.heat && PURSUIT_HEAT_MAP[it.heat] &&
          <span className={"rd-chip "+PURSUIT_HEAT_MAP[it.heat].cls}>{PURSUIT_HEAT_MAP[it.heat].label}</span>}
        {st && <span className={"rd-chip "+st.cls}>{st.label}</span>}
        <span className="rd-name">{it.name}</span>
      </div>
      {w != null &&
        <div className="rd-line"><b className={over?"rd-block":"rd-next"}>Waiting {w}d</b>
          {it.waitingOn ? " on " + it.waitingOn : ""}</div>}
      {it.nextStep &&
        <div className="rd-line"><b className="rd-next">Next</b> {it.nextStep}
          {it.nextStepDue && <span className={"rd-due"+(it.nextStepDue < TODAY() ? " late" : "")}>
            {(it.nextStepDue < TODAY() ? "overdue " : "by ") + fmtDate(it.nextStepDue)}</span>}</div>}
    </div>
  );
}

function Harness(){
  const view = (location.hash || "#cards").slice(1);
  const store = { rundown:{ items: view === "quiet" ? [items[3], items[4]] : items } };
  const go = (k) => { window.__wentTo = k; };
  if(view === "cards") return <div style={{padding:16,maxWidth:390,margin:"0 auto"}}>{items.map(it=><Card key={it.id} it={it}/>)}</div>;
  return <div style={{padding:16,maxWidth:390,margin:"0 auto"}}><PursuitChaseLine store={store} go={go}/></div>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
window.addEventListener("hashchange", () => location.reload());
`;

fs.writeFileSync(out, `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pursuits harness</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.26.2/babel.min.js"></script>
<style>${css}</style></head><body><div id="root"></div>
<script type="text/babel">${stub}

${consts}

${fns}
</script></body></html>`, "utf8");

const Babel = require(require.resolve("@babel/standalone", { paths: [ROOT] }));
Babel.transform(stub + "\n" + consts + "\n" + fns, { presets: ["react"], filename: "stub.jsx" });
console.log("[HARNESS] wrote " + out + " - stub parsed clean");
