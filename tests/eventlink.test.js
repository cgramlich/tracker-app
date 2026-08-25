/* Event links: attaching owned work to a read-only calendar event.
   The resolver decides whether a linked todo follows a RESCHEDULED trip, and
   whether a link survives being offline. Confusing "not in the window I am
   holding" with "deleted" would silently drop user data on every flight, which
   is why that case gets its own section. */
const { build, is, section, report } = require("./lift");

const E = build([
  "eventLinkFrom", "cleanEventLink", "resolveEventLink", "eventLinkKey", "eventUntilLabel",
], "");

const ev = (o) => Object.assign({
  uid: "u1", start: "2026-09-09T00:00:00Z", end: "2026-09-12T00:00:00Z",
  title: "Nashville", all_day: true,
}, o);

section("the snapshot is the point");
is("identity AND display are both captured", E.eventLinkFrom(ev()),
  { uid: "u1", start: "2026-09-09T00:00:00Z", title: "Nashville", end: "2026-09-12T00:00:00Z", allDay: true });
is("null in, null out", E.eventLinkFrom(null), null);
is("an empty link is dropped", E.cleanEventLink({ uid: "", start: "", title: "" }), null);
is("a uid-less link that still has title+start is kept - it can still display",
  E.cleanEventLink({ start: "2026-09-09", title: "Nashville" }).title, "Nashville");
is("values are trimmed", E.cleanEventLink({ uid: " u1 ", start: " s ", title: " T " }).uid, "u1");

section("happy path");
const link = E.eventLinkFrom(ev());
is("exact uid+start match", E.resolveEventLink(link, [ev()]).event.title, "Nashville");
is("an exact match is not 'moved'", E.resolveEventLink(link, [ev()]).moved, false);

section("the trip gets rescheduled - its todos must follow");
const moved = ev({ start: "2026-09-16T00:00:00Z", end: "2026-09-19T00:00:00Z" });
const r = E.resolveEventLink(link, [moved]);
is("still resolves, via uid alone", !!r, true);
is("resolves to the NEW date", r.event.start, "2026-09-16T00:00:00Z");
is("flagged moved so the snapshot can refresh", r.moved, true);

section("recurring: one uid, many occurrences");
const rec = [
  ev({ uid: "r1", start: "2026-09-02T00:00:00Z" }),
  ev({ uid: "r1", start: "2026-09-09T00:00:00Z" }),
  ev({ uid: "r1", start: "2026-09-16T00:00:00Z" }),
];
is("the exact occurrence wins",
  E.resolveEventLink({ uid: "r1", start: "2026-09-09T00:00:00Z", title: "Nashville", end: "", allDay: true }, rec).event.start,
  "2026-09-09T00:00:00Z");
is("otherwise the NEAREST occurrence",
  E.resolveEventLink({ uid: "r1", start: "2026-09-10T00:00:00Z", title: "Nashville", end: "", allDay: true }, rec).event.start,
  "2026-09-09T00:00:00Z");

section("title fallback - same meeting from a second feed, different uid");
is("matches on title+start", E.resolveEventLink(link, [ev({ uid: "DIFFERENT" })]).event.uid, "DIFFERENT");
is("title matching ignores case and spacing",
  !!E.resolveEventLink(link, [ev({ uid: "X", title: "  nashville  " })]), true);

section("NOT FOUND must never mean DELETED");
is("offline / empty list -> null, and the caller keeps the snapshot", E.resolveEventLink(link, []), null);
is("out of window -> null",
  E.resolveEventLink(link, [ev({ uid: "zzz", title: "Something else", start: "2026-10-01T00:00:00Z" })]), null);
is("a null link is safe", E.resolveEventLink(null, [ev()]), null);

section("grouping key");
is("same event, same key", E.eventLinkKey(link) === E.eventLinkKey(E.eventLinkFrom(ev())), true);
is("different start, different key", E.eventLinkKey(link) === E.eventLinkKey(E.eventLinkFrom(moved)), false);
is("null -> empty string, never a crash", E.eventLinkKey(null), "");

section("relative label is ordinal, never a timestamp");
const iso = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d.toISOString(); };
is("today", E.eventUntilLabel(iso(0)), "today");
is("tomorrow", E.eventUntilLabel(iso(1)), "tomorrow");
is("yesterday", E.eventUntilLabel(iso(-1)), "yesterday");
is("in 9 days", E.eventUntilLabel(iso(9)), "in 9 days");
is("past trips read as past", E.eventUntilLabel(iso(-4)), "4 days ago");
is("garbage in -> empty, no crash", E.eventUntilLabel("not-a-date"), "");

report();
