/* Wins: recognition computed from existing history, never stored.
   The governing rule is REWARD WHAT IS HARD, NOT WHAT IS FREQUENT - so the
   assertions here are as much about what does NOT earn a badge as what does. */
const { build, is, section, report } = require("./lift");

const TODAY = "2026-08-12";
const W = build([
  "habitExpectedOn", "habitDoneSet", "WIN_STREAK_TIERS", "WIN_OVERDUE_DAYS", "WIN_PERFECT_DAYS",
  "daysBetweenISO", "habitRuns", "perfectRun", "computeWins", "computeRecords",
], `
  function todayKey(d){ const x=new Date(d); return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0"); }
  function TODAY(){ return "${TODAY}"; }
  const RealDate = Date;
  Date = class extends RealDate {
    constructor(...a){ if(!a.length) super("${TODAY}T09:00:00"); else super(...a); }
    static now(){ return new RealDate("${TODAY}T09:00:00").getTime(); }
    static parse(s){ return RealDate.parse(s); }
  };
`);

const day = (back) => { const d = new Date("2026-08-12T12:00:00"); d.setDate(d.getDate() - back); return d.toISOString().slice(0, 10); };
const runDays = (len, endBack) => Array.from({ length: len }, (_, i) => day(endBack + len - 1 - i));
const habit = (o) => Object.assign({ id: "h", name: "Exercise", cadence: "daily", startedAt: day(120), done: [] }, o);
const byKey = (ws, k) => ws.find(w => w.key === k);

section("date maths");
is("30 days", W.daysBetweenISO("2026-07-06", "2026-08-05"), 30);
is("same day is zero", W.daysBetweenISO("2026-08-05", "2026-08-05"), 0);
is("garbage is zero, not NaN", W.daysBetweenISO("nope", "also-nope"), 0);

section("runs");
is("one unbroken run", W.habitRuns(habit({ done: runDays(10, 5) }))[0].days.length, 10);
is("a gap splits it", W.habitRuns(habit({ done: runDays(4, 20).concat(runDays(6, 5)) })).map(r => r.days.length), [4, 6]);
is("an unfinished today leaves the run open", W.habitRuns(habit({ done: runDays(5, 1) }))[0].days.length, 5);
is("a weekend does not split a weekday run",
  W.habitRuns(habit({ cadence: "weekdays", startedAt: "2026-08-03", done: ["2026-08-06", "2026-08-07", "2026-08-10", "2026-08-11"] }))
    .map(r => r.days.length), [4]);

section("streak tiers");
let wins = W.computeWins({}, [habit({ done: runDays(8, 2) })], {});
is("7-day tier earned at 8 days", !!byKey(wins, "streak7"), true);
is("30-day tier not earned", !!byKey(wins, "streak30"), false);
is("dated to the day the tier was REACHED, not today", byKey(wins, "streak7").at, day(3));
is("detail names the habit", byKey(wins, "streak7").detail, "Exercise");
wins = W.computeWins({}, [habit({ id: "a", done: runDays(8, 2) }), habit({ id: "b", name: "Calls", done: runDays(9, 2) })], {});
is("two habits at one tier collapse into a single win", byKey(wins, "streak7").count, 2);
is("and the detail becomes a count", byKey(wins, "streak7").detail, "2 habits");

section("perfect week requires MORE than one habit");
const perfect = [habit({ id: "a", startedAt: day(12), done: runDays(10, 1) }),
                 habit({ id: "b", name: "Calls", startedAt: day(12), done: runDays(10, 1) })];
is("best run counts calendar days", W.perfectRun(perfect).best, 10);
is("earned with two habits", !!byKey(W.computeWins({}, perfect, {}), "perfect"), true);
is("one habit missing a day breaks the whole run",
  W.perfectRun([habit({ id: "a", startedAt: day(12), done: runDays(10, 1) }),
                habit({ id: "b", name: "Calls", startedAt: day(12), done: runDays(4, 1) })]).best, 4);
// With one habit "every habit every day" IS its streak - one achievement
// wearing two badges. A test expecting 2 wins got 3 and caught this.
is("a single habit earns NO perfect week", W.perfectRun([habit({ done: runDays(20, 1) })]).best, 0);
is("and no perfect badge", !!byKey(W.computeWins({}, [habit({ done: runDays(20, 1) })], {}), "perfect"), false);
is("no habits at all is safe", W.perfectRun([]), { best: 0, endedAt: "" });

section("unstuck - the only win for finishing something unpleasant");
wins = W.computeWins({ todos: [
  { status: "done", due: "2026-07-06", completedAt: "2026-08-09T10:00:00Z" },   // 34 days late
  { status: "done", due: "2026-08-01", completedAt: "2026-08-03T10:00:00Z" },   // 2 days late
  { status: "next", due: "2026-01-01" },
] }, [], {});
is("only the 30+ days late one counts", byKey(wins, "unstuck").count, 1);
is("dated to when it was cleared", byKey(wins, "unstuck").at, "2026-08-09");
is("a todo with no due date cannot be unstuck",
  !!byKey(W.computeWins({ todos: [{ status: "done", completedAt: "2026-08-09T10:00:00Z" }] }, [], {}), "unstuck"), false);

section("delivered and won");
wins = W.computeWins({ projects: [
  { status: "done", updatedAt: "2026-08-01T10:00:00Z" },
  { status: "done", updatedAt: "2026-08-06T10:00:00Z" },
  { status: "active", updatedAt: "2026-08-08T10:00:00Z" },
] }, [], { items: [{ status: "won", updatedAt: "2026-08-07T10:00:00Z" }, { status: "live", updatedAt: "2026-08-08T10:00:00Z" }] });
is("finished projects counted", byKey(wins, "delivered").count, 2);
is("dated to the most recent", byKey(wins, "delivered").at, "2026-08-06");
is("only WON pursuits count", byKey(wins, "won").count, 1);

section("nothing rewards task volume");
is("completing ordinary todos earns nothing",
  W.computeWins({ todos: Array.from({ length: 40 }, () => ({ status: "done", completedAt: "2026-08-11T10:00:00Z" })) }, [], {}), []);

section("ordering and empty state");
is("newest first", W.computeWins({ projects: [{ status: "done", updatedAt: "2026-08-01T00:00:00Z" }] },
  [habit({ done: runDays(8, 2) })], {}).map(w => w.key), ["streak7", "delivered"]);
is("nothing earned -> empty list, never locked placeholders", W.computeWins({}, [], {}), []);
is("totally empty input is safe", W.computeWins(null, null, null), []);

section("records survive a broken streak");
const rec = W.computeRecords([habit({ done: runDays(14, 30).concat(runDays(2, 1)) })]);
is("best is the HISTORICAL best, not the current run", rec.bestStreak, 14);
is("names which habit", rec.bestHabit, "Exercise");
is("total days counted", rec.totalDays, 16);
is("no habits -> zeroes, no crash", W.computeRecords([]), { bestStreak: 0, bestHabit: "", totalDays: 0, perfect: 0 });

report();
