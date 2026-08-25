/* Habits: cadence, streaks, consistency, and the one-time routine migration.
   The migration DELETES todo rows and has already run against Chris's real
   data, so it is the highest-consequence logic in the app after the sync store.
   Clock is pinned to a known WEDNESDAY so weekday/weekend cadences are
   deterministic. */
const { build, is, section, report } = require("./lift");

const TODAY = "2026-08-12";                      // Wednesday
const H = build([
  "HABIT_CADENCES", "habitExpectedOn", "habitDoneSet", "habitDoneToday", "habitDueToday",
  "habitStreak", "habitRecent", "habitStrip", "habitToggle", "migrateRoutines",
], `
  const DEFAULT_SPACE = "personal";
  let _n = 0; function uid(){ return "h" + (++_n); }
  function todayKey(d){ const x=new Date(d); return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0"); }
  function TODAY(){ return "${TODAY}"; }
  const RealDate = Date;
  Date = class extends RealDate {
    constructor(...a){ if(!a.length) super("${TODAY}T09:00:00"); else super(...a); }
    static now(){ return new RealDate("${TODAY}T09:00:00").getTime(); }
  };
`);

// Aug 2026: 12 Wed, 11 Tue, 10 Mon, 9 Sun, 8 Sat, 7 Fri, 6 Thu, 5 Wed.
const D = (n) => "2026-08-" + String(n).padStart(2, "0");
const habit = (o) => Object.assign({ id: "x", name: "Exercise", cadence: "daily", startedAt: "2026-01-01", done: [] }, o);

section("cadence");
is("Wednesday is a weekday", H.habitExpectedOn("weekdays", new Date(D(12) + "T12:00:00")), true);
is("Saturday is not a weekday", H.habitExpectedOn("weekdays", new Date(D(8) + "T12:00:00")), false);
is("Saturday IS a weekend", H.habitExpectedOn("weekends", new Date(D(8) + "T12:00:00")), true);
is("daily expects every day", H.habitExpectedOn("daily", new Date(D(9) + "T12:00:00")), true);

section("due today");
is("daily, not done -> due", H.habitDueToday(habit({ done: [D(11)] })), true);
is("daily, done today -> not due", H.habitDueToday(habit({ done: [D(12)] })), false);
is("a weekend habit is not due midweek", H.habitDueToday(habit({ cadence: "weekends" })), false);

section("streak");
is("an unfinished TODAY does not break a streak - the day is not over",
  H.habitStreak(habit({ done: [D(9), D(10), D(11)] })), 3);
is("done today counts", H.habitStreak(habit({ done: [D(10), D(11), D(12)] })), 3);
is("a gap ends it", H.habitStreak(habit({ done: [D(7), D(9), D(10), D(11)] })), 3);
is("no history is zero, not a crash", H.habitStreak(habit({ done: [] })), 0);
is("weekday habit: a WEEKEND gap is not a miss",
  H.habitStreak(habit({ cadence: "weekdays", done: [D(7), D(10), D(11)] })), 3);
is("weekday habit: a missed FRIDAY does break it",
  H.habitStreak(habit({ cadence: "weekdays", done: [D(6), D(10), D(11)] })), 2);

section("consistency window");
is("a perfect week", H.habitRecent(habit({ done: [D(6), D(7), D(8), D(9), D(10), D(11), D(12)] }), 7), { hit: 7, expected: 7 });
is("an unfinished today is excluded from the DENOMINATOR, not counted as a miss",
  H.habitRecent(habit({ done: [D(6), D(7), D(8), D(9), D(10), D(11)] }), 7), { hit: 6, expected: 6 });
is("a real miss does show in the denominator",
  H.habitRecent(habit({ done: [D(6), D(8), D(9), D(10), D(11), D(12)] }), 7), { hit: 6, expected: 7 });
is("a weekday habit only counts weekdays",
  H.habitRecent(habit({ cadence: "weekdays", done: [D(6), D(7), D(10), D(11), D(12)] }), 7), { hit: 5, expected: 5 });
is("days before you started do not count against you",
  H.habitRecent(habit({ startedAt: D(11), done: [D(11), D(12)] }), 30), { hit: 2, expected: 2 });

section("strip");
const strip = H.habitStrip(habit({ done: [D(11)] }), 3);
is("oldest first", strip.map(s => s.date), [D(10), D(11), D(12)]);
is("marks the done day", strip.map(s => s.done), [false, true, false]);
is("a weekend is flagged unexpected for a weekday habit",
  H.habitStrip(habit({ cadence: "weekdays" }), 5).map(s => s.expected), [false, false, true, true, true]);

section("toggle is reversible");
is("adds today", H.habitToggle(habit({}), null).done, [TODAY]);
is("removes if already there", H.habitToggle(habit({ done: [TODAY] }), null).done, []);
is("stays sorted", H.habitToggle(habit({ done: [D(12)] }), D(10)).done, [D(10), D(12)]);

section("migration - the rows it deletes");
const todos = [
  { id: "t1", title: "Complete daily exercise", routine: true, recur: "daily", status: "done", completedAt: D(10) + "T08:00:00Z", space: "personal" },
  { id: "t2", title: "Complete daily exercise", routine: true, recur: "daily", status: "done", completedAt: D(11) + "T08:00:00Z", space: "personal" },
  { id: "t3", title: "Complete daily exercise", routine: true, recur: "daily", status: "next", space: "personal" },
  { id: "t4", title: "Make one personal or business connection call daily", routine: true, recur: "daily", status: "next", space: "personal" },
  { id: "t5", title: "Not a routine", status: "next" },
  { id: "t6", title: "Weekly review", routine: true, recur: "weekly", status: "next" },
];
const m = H.migrateRoutines(todos, []);
is("one habit per distinct title", m.habits.length, 2);
is("history is backfilled from completedAt", m.habits[0].done, [D(10), D(11)]);
is("startedAt is the first completion", m.habits[0].startedAt, D(10));
is("a habit with no history starts today", m.habits[1].startedAt, TODAY);
is("every routine row is marked for deletion", m.removeIds.sort(), ["t1", "t2", "t3", "t4"]);
is("a plain todo is NEVER deleted", m.removeIds.indexOf("t5"), -1);
is("a WEEKLY recurrence is not a habit and is left alone", m.removeIds.indexOf("t6"), -1);

section("migration is idempotent");
const again = H.migrateRoutines(todos, m.habits);
is("a second run creates no duplicate habits", again.habits.length, 0);
is("but still reports the rows to clean up", again.removeIds.sort(), ["t1", "t2", "t3", "t4"]);
is("empty input is safe", H.migrateRoutines([], []), { habits: [], removeIds: [] });
is("null input is safe", H.migrateRoutines(null, null), { habits: [], removeIds: [] });

report();
