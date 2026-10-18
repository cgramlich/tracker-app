/* Pursuit heat, waiting-since, and next-step dates.
   ===========================================================================
   Chris asked for three things on pursuits: how hot a deal is, how long it has
   been waiting and on whom, and a date on the next step - with anything stalled
   surfacing so he knows to chase.

   EVERY FAILURE HERE IS SILENT. A chase reminder that never fires looks exactly
   like a pipeline with nothing wrong in it; a waiting clock that resets on every
   edit looks exactly like a deal you only just started waiting on. Nothing
   errors in either case, so the tests are the only thing standing between a
   quiet bug and a deal going cold unnoticed. */
const { build, lift, liftConst, is, section, report, SRC } = require("./lift");

const P = build(["heatRank", "rundownStamp", "rundownWaitingDays", "pursuitsNeedingChase",
  "pursuitChaseLine", "daysBetweenISO", "isRealISODate"], `
  const DEFAULT_WAIT_DAYS = 7;
  ${liftConst("PURSUIT_HEAT")}
  ${liftConst("PURSUIT_HEAT_MAP")}
  ${liftConst("HEAT_RANK")}
  const ISO_DATE = /^\\d{4}-\\d{2}-\\d{2}$/;
  function todayKey(d){ const x = d ? new Date(d) : new Date();
    return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0"); }
  function TODAY(){ return "2026-10-18"; }
`);

const T = "2026-10-18";
const ago = (n) => { const d = new Date(T + "T00:00:00"); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0,10); };
const ahead = (n) => ago(-n);

section("heat ordering - hot first, unrated LAST");
is("hot sorts first", P.heatRank({ heat:"hot" }), 0);
is("warm next", P.heatRank({ heat:"warm" }), 1);
is("cold next", P.heatRank({ heat:"cold" }), 2);
// Not having judged a deal is not a claim that it is warm, so unrated goes last
// rather than into the middle.
is("UNRATED sorts last, not middle", P.heatRank({}), 3);
is("an unknown value is treated as unrated", P.heatRank({ heat:"lukewarm" }), 3);
is("a null item is safe", P.heatRank(null), 3);
is("sorting puts hot above unrated above nothing else",
  [{heat:""},{heat:"cold"},{heat:"hot"},{heat:"warm"}].sort((a,b)=>P.heatRank(a)-P.heatRank(b)).map(x=>x.heat||"-"),
  ["hot","warm","cold","-"]);

/* THE ONE THAT MATTERS MOST. If an ordinary edit re-stamped waitingSince, the
   clock would restart every time Chris opened the item, and the chase reminder
   would never fire - with nothing on screen to say so. */
section("the waiting clock starts on the TRANSITION, not on every save");
is("becoming waiting starts the clock today",
  P.rundownStamp({ status:"live" }, { status:"waiting" }).waitingSince, T);
is("editing an item that was ALREADY waiting keeps the original date",
  P.rundownStamp({ status:"waiting", waitingSince: ago(12) }, { status:"waiting" }).waitingSince, ago(12));
is("a waiting item with no stamp yet (pre-existing data) gets one now",
  P.rundownStamp({ status:"waiting" }, { status:"waiting" }).waitingSince, T);
is("leaving waiting clears the stamp", P.rundownStamp({ status:"waiting", waitingSince: ago(5) }, { status:"live" }).waitingSince, "");
is("so returning to waiting later starts FRESH rather than resurfacing a stale 40 days",
  P.rundownStamp({ status:"live", waitingSince:"" }, { status:"waiting" }).waitingSince, T);
is("a brand-new non-waiting item carries no stamp", P.rundownStamp(null, { status:"live" }).waitingSince, "");

section("days waiting");
is("not waiting means no number at all", P.rundownWaitingDays({ status:"live", waitingSince: ago(9) }, T), null);
is("waiting with no stamp means no number", P.rundownWaitingDays({ status:"waiting" }, T), null);
is("null item is safe", P.rundownWaitingDays(null, T), null);
is("stamped today reads zero, not one", P.rundownWaitingDays({ status:"waiting", waitingSince: T }, T), 0);
is("twelve days reads twelve", P.rundownWaitingDays({ status:"waiting", waitingSince: ago(12) }, T), 12);
// A clock skew or a hand-edited future date must not render as negative days.
is("a future stamp clamps at zero rather than going negative",
  P.rundownWaitingDays({ status:"waiting", waitingSince: ahead(3) }, T), 0);

const pursuits = [
  { id:"a", pursuit:true, status:"waiting", waitingSince: ago(9),  waitingOn:"Gabi" },
  { id:"b", pursuit:true, status:"waiting", waitingSince: ago(2) },
  { id:"c", pursuit:true, status:"live", nextStep:"send redline", nextStepDue: ago(1) },
  { id:"d", pursuit:true, status:"live", nextStep:"call", nextStepDue: ahead(4) },
  { id:"e", pursuit:true, status:"won",  waitingSince: ago(40) },
  { id:"f", pursuit:true, status:"dropped", nextStepDue: ago(30) },
  { id:"g", pursuit:false, status:"waiting", waitingSince: ago(30) },
  { id:"h", pursuit:true, status:"live" },
];

section("what needs chasing");
is("waiting past the threshold is chased", P.pursuitsNeedingChase(pursuits, 7, T).some(x=>x.id==="a"), true);
is("waiting under the threshold is NOT", P.pursuitsNeedingChase(pursuits, 7, T).some(x=>x.id==="b"), false);
is("a next step past its date is chased", P.pursuitsNeedingChase(pursuits, 7, T).some(x=>x.id==="c"), true);
is("a next step still in the future is not", P.pursuitsNeedingChase(pursuits, 7, T).some(x=>x.id==="d"), false);
// Closed deals are the loudest possible false alarm: chasing something already
// won teaches him to stop reading the line.
is("a WON deal is never chased, however long it sat", P.pursuitsNeedingChase(pursuits, 7, T).some(x=>x.id==="e"), false);
is("a DROPPED deal likewise", P.pursuitsNeedingChase(pursuits, 7, T).some(x=>x.id==="f"), false);
is("a non-pursuit item is not in the pipeline at all", P.pursuitsNeedingChase(pursuits, 7, T).some(x=>x.id==="g"), false);
is("an item with neither signal is quiet", P.pursuitsNeedingChase(pursuits, 7, T).some(x=>x.id==="h"), false);
is("exactly two need chasing", P.pursuitsNeedingChase(pursuits, 7, T).map(x=>x.id), ["a","c"]);
is("null list is safe", P.pursuitsNeedingChase(null, 7, T), []);

/* The threshold is Chris's Settings value, not a constant. Changing it must
   actually change what gets chased, or the setting is decorative. */
section("the threshold is the one he already set in Settings");
is("at a threshold of 14, the 9-day wait is no longer chased",
  P.pursuitsNeedingChase(pursuits, 14, T).some(x=>x.id==="a"), false);
is("at a threshold of 2, it is", P.pursuitsNeedingChase(pursuits, 2, T).some(x=>x.id==="a"), true);
is("a zero or missing threshold falls back to the default rather than chasing everything",
  P.pursuitsNeedingChase(pursuits, 0, T).map(x=>x.id), ["a","c"]);

section("the Dashboard line");
is("nothing stalled means NO line at all, not an empty one", P.pursuitChaseLine([pursuits[7]], 7, T), "");
is("an empty pipeline means no line", P.pursuitChaseLine([], 7, T), "");
is("it counts and explains", P.pursuitChaseLine(pursuits, 7, T),
  "2 pursuits need a chase - 1 past its next step, 1 waiting 7+ days");
is("one is singular", P.pursuitChaseLine([pursuits[2]], 7, T), "1 pursuit needs a chase - 1 past its next step");
is("the line names the threshold he set", P.pursuitChaseLine(pursuits, 3, T).includes("waiting 3+ days"), true);

/* The breakdown must ADD UP to the headline count. A deal can be both waiting
   too long and past its next step; counting it in both buckets produced
   "1 pursuit needs a chase - 1 past its next step, 1 waiting 7+ days", which
   reads as though the app cannot add up. Caught by looking at the rendered
   line, not by any assertion above it. */
section("a pursuit with BOTH problems is counted once");
const both = [{ id:"x", pursuit:true, status:"waiting", waitingSince: ago(12),
                nextStep:"send it", nextStepDue: ago(2) }];
is("it is one item needing a chase", P.pursuitsNeedingChase(both, 7, T).length, 1);
is("and the line says so without contradicting itself",
  P.pursuitChaseLine(both, 7, T), "1 pursuit needs a chase - 1 past its next step");
is("the overdue next step wins over the wait, being a commitment he made",
  P.pursuitChaseLine(both, 7, T).includes("waiting"), false);
{
  // The general rule: the numbers in the breakdown always sum to the headline.
  const line = P.pursuitChaseLine(pursuits.concat(both), 7, T);
  const head = parseInt(line, 10);
  const parts = (line.split(" - ")[1] || "").split(", ").map(b => parseInt(b, 10) || 0);
  is("breakdown sums to the headline count", parts.reduce((a,b)=>a+b,0), head);
}

/* Wiring: the fields have to reach the item, the card and the sort, and that is
   what the pure functions above cannot see. */
section("wiring");
is("the editor stamps through rundownStamp rather than setting the date itself",
  /onSave\(\{ \.\.\.base, \.\.\.rundownStamp\(item, base\) \}\)/.test(SRC), true);
is("heat and waitingOn are dropped when an item is not a pursuit",
  /heat: pursuit \? heat : "", waitingOn: pursuit \? waitingOn\.trim\(\) : ""/.test(SRC), true);
is("a next-step date is only kept when there IS a next step",
  /nextStepDue: \(nextStep\.trim\(\) && isRealISODate\(nextStepDue\)\)/.test(SRC), true);
is("the card shows the heat chip", /PURSUIT_HEAT_MAP\[it\.heat\]\.label/.test(SRC), true);
is("the card shows days waiting", /rundownWaitingDays\(it, TODAY\(\)\)/.test(SRC), true);
is("Pursuits sorts by heat within each status group", /const byHeat = \(a,b\) => \(heatRank\(a\) - heatRank\(b\)\)/.test(SRC), true);
is("the chase line is on the Dashboard", /<PursuitChaseLine store=\{store\} go=\{go\}\/>/.test(SRC), true);
is("and it reads the threshold from settings, not a constant",
  /pursuitChaseLine\(\(\(store\.rundown\|\|\{\}\)\.items\)\|\|\[\], waitThreshold\(store\)/.test(SRC), true);

section("import tags");
const parse = lift("parseRundownPaste");
is("the parser recognises heat tags", /PURSUIT_HEAT_MAP\[k\]\)\{ heat=k; pursuit=true;/.test(parse), true);
is("a heat tag implies it is a pursuit", parse.includes("heat=k; pursuit=true"), true);
is("a trailing @date on a next: line sets the due date", /@\(\\\\d\{4\}-\\\\d\{2\}-\\\\d\{2\}\)/.test(parse) || parse.includes("@(\\d{4}-\\d{2}-\\d{2})"), true);
is("blocked: also fills waiting-on when empty", parse.includes("if(!last.waitingOn) last.waitingOn=v;"), true);

report();
