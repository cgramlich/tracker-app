/* Affirmations: a line you read, rotating daily.
   The whole design rests on the pick being DERIVED from the date rather than
   stored, so these tests care most about the rotation being stable within a
   day, advancing across days, and never producing a negative index. */
const { build, is, section, report } = require("./lift");

const A = build(["cleanAffirmation", "affirmationOfTheDay"], `
  let _n = 0; function uid(){ return "a" + (++_n); }
  function nowISO(){ return "2026-08-27T00:00:00.000Z"; }
  function TODAY(){ return "2026-08-27"; }
`);

const list = [
  { id: "a1", text: "I do hard things", addedAt: "2026-01-01T00:00:00Z" },
  { id: "a2", text: "Slow is smooth", addedAt: "2026-01-01T00:00:00Z" },
  { id: "a3", text: "Ask for the whole thing", addedAt: "2026-01-01T00:00:00Z" },
];

section("cleanAffirmation");
is("null in, null out", A.cleanAffirmation(null), null);
is("blank text is not an affirmation", A.cleanAffirmation({ text: "   " }), null);
is("text is trimmed", A.cleanAffirmation({ text: "  hello  " }).text, "hello");
is("an id is assigned when missing", /^a\d+$/.test(A.cleanAffirmation({ text: "x" }).id), true);
is("an existing id is kept", A.cleanAffirmation({ id: "keep", text: "x" }).id, "keep");
is("addedAt is stamped when missing", A.cleanAffirmation({ text: "x" }).addedAt, "2026-08-27T00:00:00.000Z");

section("rotation");
is("empty list shows nothing rather than a blank line", A.affirmationOfTheDay([], "2026-08-27"), null);
is("null list is safe", A.affirmationOfTheDay(null, "2026-08-27"), null);
is("a single entry always shows", A.affirmationOfTheDay([list[0]], "2026-08-27").id, "a1");

// Stability within a day is the point: the same date must always give the same
// pick, or the line would change on every re-render.
const twice = [A.affirmationOfTheDay(list, "2026-08-27"), A.affirmationOfTheDay(list, "2026-08-27")];
is("the same date always gives the same pick", twice[0].id === twice[1].id, true);

section("it advances one per calendar day");
const week = ["2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30"]
  .map(d => A.affirmationOfTheDay(list, d).id);
is("consecutive days differ", week[0] !== week[1] && week[1] !== week[2], true);
is("it cycles rather than running out - day 4 revisits day 1's pick", week[3], week[0]);
is("every entry is reachable across a full cycle", new Set(week.slice(0, 3)).size, 3);

section("degenerate dates");
is("a garbage date falls back to the first entry rather than crashing",
  A.affirmationOfTheDay(list, "not-a-date").id, "a1");
// JS % is signed, so a pre-epoch date would index negatively without the guard.
is("a pre-1970 date does not produce a negative index",
  !!A.affirmationOfTheDay(list, "1965-03-02"), true);

section("blank entries never surface");
is("a blank entry is filtered out of the rotation entirely",
  A.affirmationOfTheDay([{ id: "x", text: "  " }], "2026-08-27"), null);
is("blanks do not shift the rotation of the real ones",
  A.affirmationOfTheDay([{ id: "x", text: "" }].concat(list), "2026-08-27").id,
  A.affirmationOfTheDay(list, "2026-08-27").id);

report();
