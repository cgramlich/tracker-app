/* Scratch pad preview harness.
   Renders the REAL ScratchCard and the whole real <style> block at phone width.
   Pick a state with the URL hash:
     #empty   the pad with nothing on it - the state it is in most of the time
     #few     three lines, all visible
     #many    more lines than fit, so "Show N more" appears
     #long    one very long line and one multi-line paste, for overflow
   Same two rules as build.js: lift the whole stylesheet, and parse-check the stub. */
const fs = require("fs");
const path = require("path");
const { liftFrom, liftConstFrom } = require("../lift");

const ROOT = path.join(__dirname, "..", "..");
const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const out = path.join(__dirname, "scratch.html");

const css = (src.match(/<style>([\s\S]*?)<\/style>/) || [])[1];
if (!css) throw new Error("no <style> block found in index.html");
for (const sel of [".card", ".input", ".btn", ".row", ".hint"]) {
  if (!new RegExp("\\" + sel + "[\\s{,.]").test(css)) throw new Error("assert failed: " + sel + " missing from the lifted CSS");
}

const consts = ["SCRATCH_MAX"].map(n => liftConstFrom(src, n)).join("\n");
const fns = ["cleanScratchLine", "scratchLines", "addScratchLine", "scratchSeedText", "ScratchCard"]
  .map(n => liftFrom(src, n)).join("\n\n");

const stub = `
const { useState, useRef, useEffect } = React;
function nowISO(){ return new Date().toISOString(); }
let _u = 0; function uid(){ return "u" + (++_u); }
function log(){}
function lsSet(k, v){ window.__seed = v; }
const Ic = { sparkle:"\\u2726" };

const at = (n) => { const d = new Date(); d.setHours(d.getHours() - n); return d.toISOString(); };
const few = [
  { id:"l1", text:"call re: the fee proposal", at:at(3) },
  { id:"l2", text:"domu schedule - who is on it?", at:at(2) },
  { id:"l3", text:"book flights", at:at(1) },
];
const many = Array.from({ length:9 }, (_, i) => ({ id:"m"+i, text:"thought number "+(i+1), at:at(9-i) }));
const long = [
  { id:"p1", text:"a single very long unbroken scribble that has no spaces in it whatsoever supercalifragilistic", at:at(2) },
  { id:"p2", text:"pasted from somewhere\\nwith a second line\\nand a third", at:at(1) },
];

function Harness(){
  const view = (location.hash || "#few").slice(1);
  const seed = view === "empty" ? [] : view === "many" ? many : view === "long" ? long : few;
  const [scratch, setScratch] = useState(seed);
  const store = { scratch, saveScratch:(next) => { setScratch(next); window.__saved = next; } };
  const toast = (m) => { window.__toast = m; };
  const openAI = () => { window.__openedAI = true; };
  return <div style={{padding:16,maxWidth:390,margin:"0 auto"}}>
    <ScratchCard store={store} toast={toast} openAI={openAI}/>
  </div>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<Harness/>);
window.addEventListener("hashchange", () => location.reload());
`;

fs.writeFileSync(out, `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Scratch harness</title>
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
