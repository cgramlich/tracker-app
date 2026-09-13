/* Orders preview harness.
   Renders the REAL Orders components, the real Sheet, Empty and SpaceField, and
   the whole real <style> block, at phone width. Pick a screen with the URL hash:
     #list      the Orders screen with a spread of states
     #empty     the Orders screen with nothing in it
     #edit      the edit sheet for an existing order
     #capture   the screenshot sheet (the AI call and image resize are stubbed)
     #dash      the Dashboard "needs a look" line
   Same two rules as build.js: lift the whole stylesheet, and parse-check the stub. */
const fs = require("fs");
const path = require("path");
const { liftFrom, liftConstFrom } = require("../lift");

const ROOT = path.join(__dirname, "..", "..");
const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const out = path.join(__dirname, "orders.html");

const css = (src.match(/<style>([\s\S]*?)<\/style>/) || [])[1];
if (!css) throw new Error("no <style> block found in index.html");
for (const sel of [".ord-row", ".ord-arrived", ".sheet", ".item", ".chip"]) {
  if (!new RegExp("\\" + sel + "[\\s{,.]").test(css)) throw new Error("assert failed: " + sel + " missing from the lifted CSS");
}

const consts = ["ORDER_STATUSES", "ORDER_STALE_DAYS", "ORDER_SOON_DAYS", "ISO_DATE", "ORDER_BUCKET_RANK", "ORDER_EXTRACT_SYSTEM"]
  .map(n => liftConstFrom(src, n)).join("\n");
const fns = ["fmtDate", "daysBetweenISO", "isRealISODate", "cleanOrder", "normalizeExtractedOrders", "orderState",
  "ordersByUrgency", "ordersSummary", "orderWhenLabel", "ordersInSpace",
  "Sheet", "Empty", "SpaceField", "OrdersNeedsLookLine", "OrderRow", "OrdersView", "OrderSheet", "OrderCaptureSheet"]
  .map(n => liftFrom(src, n)).join("\n\n");

const stub = `
const { useState, useRef, useEffect } = React;
const DEFAULT_SPACE = "personal";
function todayKey(d){ const x = d ? new Date(d) : new Date(); return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0"); }
function TODAY(){ return todayKey(); }
function nowISO(){ return new Date().toISOString(); }
let _u = 0; function uid(){ return "u" + (++_u); }
function log(){}
const Ic = { back:"\\u2039", camera:"\\u25C9", plus:"+", close:"\\u00D7" };
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return todayKey(d); };
const ahead = (n) => ago(-n);

// Stubs for the two things a browser harness cannot do for real.
function resizeImage(){ return Promise.resolve("stub-base64"); }
async function claudeExtract(content, system){
  window.__extractSystem = system;
  return [
    { merchant:"Amazon", item:"Anker USB-C charging cable, 2 pack, braided, 6 ft, black", orderedAt:ago(1), expectedBy:ahead(2), cost:"$14.99", ref:"112-4471" },
    { merchant:"REI", item:"Trekking poles", orderedAt:ago(1), expectedBy:"", cost:"$89.00", ref:"" },
    { merchant:"", item:"" }
  ];
}

const baseOrders = [
  { id:"a", merchant:"Wayfair", item:"Standing desk frame with a very long product name that should not overflow the row", orderedAt:ago(20), expectedBy:ago(6), cost:"$389.00", status:"ordered" },
  { id:"b", merchant:"Etsy", item:"Custom mug", orderedAt:ago(30), expectedBy:"", cost:"$24.00", status:"ordered" },
  { id:"c", merchant:"Best Buy", item:"HDMI cable", orderedAt:ago(5), expectedBy:"", status:"problem", note:"Wrong length" },
  { id:"d", merchant:"Amazon", item:"Printer paper", orderedAt:ago(2), expectedBy:ahead(1), cost:"$12.49", status:"ordered" },
  { id:"e", merchant:"Target", item:"Lamp", orderedAt:ago(2), expectedBy:ahead(9), status:"ordered" },
  { id:"f", merchant:"Chewy", item:"Dog food", orderedAt:ago(12), expectedBy:ago(8), status:"arrived", arrivedAt:ago(8) },
];

function Harness(){
  const view = (location.hash || "#list").slice(1);
  const [orders, setOrders] = useState(view === "empty" ? [] : baseOrders);
  const store = {
    activeSpace:"all", defaultSpace:"personal",
    spaces:[{ id:"personal", name:"Personal", order:0 }, { id:"work", name:"Work", order:1 }],
    orders, saveOrders:(next) => { setOrders(next); window.__saved = next; },
  };
  const toast = (m) => { window.__toast = m; };
  const go = (k) => { window.__went = k; };
  const noop = () => {};
  if (view === "edit")    return <OrderSheet store={store} order={baseOrders[0]} toast={toast} onClose={noop}/>;
  if (view === "capture") return <OrderCaptureSheet store={store} toast={toast} onClose={noop}/>;
  if (view === "dash")    return <div style={{padding:16,maxWidth:390,margin:"0 auto"}}><OrdersNeedsLookLine store={store} go={go}/></div>;
  return <div style={{padding:16,maxWidth:390,margin:"0 auto"}}><OrdersView store={store} toast={toast} back={noop}/></div>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
window.addEventListener("hashchange", () => location.reload());
`;

fs.writeFileSync(out, `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Orders harness</title>
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
