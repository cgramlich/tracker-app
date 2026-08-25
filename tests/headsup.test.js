/* Heads up: the one-sentence glance line on Today and the Dashboard.
   REGRESSION ORIGIN: on 2026-08-09 it read "2 overdue and 2 on you today" above
   a list of exactly 2 items. Routines were todos, so headsUp counted them while
   TodayView listed them in a separate card. The sentence must always describe
   what the screen below it actually shows. */
const { build, is, section, report } = require("./lift");

const TODAY = "2026-08-12";      // Wednesday
const H = build([
  "habitExpectedOn", "habitDoneSet", "habitDoneToday", "habitDueToday",
  "todayItems", "HEADS_UP_DAYS", "headsUpWhen", "headsUp",
], `
  function TODAY(){ return "${TODAY}"; }
  function todayKey(d){ const x=new Date(d); return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0"); }
  function snzAddDays(n){ const d=new Date("${TODAY}T00:00:00"); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
  function isToday(due){ return due === TODAY(); }
  function isOverdue(due){ return !!due && due < TODAY(); }
  function isDeferredAway(t){ return !!(t.defer && t.defer > TODAY()); }
  const RealDate = Date;
  Date = class extends RealDate {
    constructor(...a){ if(!a.length) super("${TODAY}T09:00:00"); else super(...a); }
    static now(){ return new RealDate("${TODAY}T09:00:00").getTime(); }
  };
`);

const task = (o) => Object.assign({ status: "next", title: "t" }, o);
const habit = (o) => Object.assign({ id: "h", name: "h", cadence: "daily", startedAt: "2026-01-01", done: [] }, o);
const line = (todos, habits) => H.headsUp(todos, [], "personal", habits || []).line;

section("the 2026-08-09 screen, in the current model");
const todos = [
  task({ title: "Research calling in a third-party like True Green", due: "2026-07-06" }),
  task({ title: "Send request for painting to RCC POA ACC", due: "2026-07-11" }),
];
const habits = [habit({ id: "h1" }), habit({ id: "h2" })];
is("the Today list holds exactly the 2 overdue tasks", H.todayItems(todos).length, 2);
is("the sentence says 2 overdue", /\b2 overdue\b/.test(line(todos, habits)), true);
is("habits get their own clause", /2 habits left/.test(line(todos, habits)), true);
is("it never claims 4 things are on you", /\b4\b/.test(line(todos, habits)), false);
is("the number in the sentence equals the list length",
  Number((line(todos, habits).match(/(\d+) overdue/) || [])[1]), H.todayItems(todos).length);

section("habits do not pollute task counts");
is("habits alone produce no task clause", line([], habits), "2 habits left.");
is("a habit already done today is not 'left'", line([], [habit({ done: [TODAY] })]),
  "Nothing due today or in the next week. You're clear.");
is("singular reads right", line([], [habit({})]), "1 habit left.");
is("a weekend habit is silent midweek", line([], [habit({ cadence: "weekends" })]),
  "Nothing due today or in the next week. You're clear.");

section("task shapes");
is("one due today", line([task({ due: TODAY })], []), "1 for today.");
is("overdue plus today", line([task({ due: "2026-08-01" }), task({ due: TODAY })], []),
  "1 overdue and 1 for today.");
is("genuinely clear", line([], []), "Nothing due today or in the next week. You're clear.");

section("the 7-day look-ahead");
// Habits carry no due dates, so they cannot flood the horizon with one daily item.
const l2 = line([task({ due: TODAY }), task({ due: "2026-08-14" })], habits);
is("a future task is counted once", /1 more lands in the next week/.test(l2), true);
is("habits appear as their own clause, not as incoming", /2 habits left/.test(l2), true);

report();
