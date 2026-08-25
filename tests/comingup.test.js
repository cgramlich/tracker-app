/* The Dashboard "Coming up" card: upcoming events that have open work attached.
   Aggregates from stored snapshots only - no network call - so it works offline
   and a calendar outage cannot blank it. */
const { build, is, section, report } = require("./lift");

const C = build(["eventLinkKey", "eventUntilLabel", "comingUp"], "");

const dayOff = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d.toISOString(); };
const nash = { uid: "u1", start: dayOff(9), end: dayOff(12), title: "Nashville", allDay: true };
const austin = { uid: "u2", start: dayOff(24), end: dayOff(26), title: "Austin", allDay: true };

section("grouping");
let r = C.comingUp({
  todos: [
    { id: "a", status: "next", event: nash },
    { id: "b", status: "next", event: nash },
    { id: "c", status: "next", event: austin },
    { id: "d", status: "next" },
  ], projects: [],
});
is("one row per event", r.length, 2);
is("counts the work attached to it", r[0].open, 2);
is("sorted by date, soonest first", r.map(x => x.link.title), ["Nashville", "Austin"]);

section("only OPEN work counts");
is("a done todo does not count",
  C.comingUp({ todos: [{ id: "a", status: "done", event: nash }, { id: "b", status: "next", event: nash }], projects: [] })[0].open, 1);
is("an event with nothing open disappears entirely - the card never nags about finished work",
  C.comingUp({ todos: [{ id: "a", status: "done", event: nash }], projects: [] }).length, 0);

section("a linked project carries its open todos");
is("project contributes its open children",
  C.comingUp({
    todos: [{ id: "a", status: "next", projectId: "p1" }, { id: "b", status: "next", projectId: "p1" },
            { id: "c", status: "done", projectId: "p1" }],
    projects: [{ id: "p1", status: "active", event: nash }],
  })[0].open, 2);
is("an archived project contributes nothing",
  C.comingUp({ todos: [{ id: "a", status: "next", projectId: "p1" }],
               projects: [{ id: "p1", status: "archived", event: nash }] }).length, 0);

section("the double-count trap");
// A todo inside a linked project that ALSO carries its own link to the same event.
is("counted once, not twice",
  C.comingUp({
    todos: [{ id: "a", status: "next", projectId: "p1", event: nash },
            { id: "b", status: "next", projectId: "p1" }],
    projects: [{ id: "p1", status: "active", event: nash }],
  })[0].open, 2);

section("time window");
is("a past trip drops off",
  C.comingUp({ todos: [{ id: "t", status: "next", event: { uid: "p", start: dayOff(-30), end: dayOff(-28), title: "Old" } }], projects: [] }).length, 0);
// end||start is what keeps a trip on the card WHILE you are on it.
is("a trip you are CURRENTLY on stays visible",
  C.comingUp({ todos: [{ id: "t", status: "next", event: { uid: "n", start: dayOff(-1), end: dayOff(2), title: "Now" } }], projects: [] }).length, 1);
is("today's event is visible",
  C.comingUp({ todos: [{ id: "t", status: "next", event: { uid: "n", start: dayOff(0), end: "", title: "Today" } }], projects: [] }).length, 1);

section("degenerate input");
is("no data, no crash", C.comingUp({}), []);
is("items with no links produce nothing",
  C.comingUp({ todos: [{ id: "x", status: "next" }], projects: [{ id: "p", status: "active" }] }), []);

report();
