/* The scratch pad: quick capture on the home screen.
   ===========================================================================
   WHY THIS SUITE EXISTS: the pad is the lowest-ceremony surface in the app, and
   low ceremony is exactly what makes silent data loss possible. There is no
   form, no confirm and no undo prompt, so a bug that drops a line drops it
   without a symptom - the user just never sees the thought again and has no
   reason to suspect the app rather than their own memory.

   The two properties worth defending are therefore: a line that was typed is
   still there, and handing the pad to the AI does not consume it. */
const { build, is, section, report } = require("./lift");

const S = build(["SCRATCH_MAX", "cleanScratchLine", "scratchLines", "addScratchLine", "scratchSeedText",
  "scratchAfterApply"], `
  let _n = 0; function uid(){ return "s" + (++_n); }
  function nowISO(){ return "2026-09-25T12:00:00.000Z"; }
`);

const at = (n) => "2026-09-25T" + String(n).padStart(2, "0") + ":00:00.000Z";
const pad = [
  { id: "l1", text: "call re: fee proposal", at: at(9) },
  { id: "l2", text: "domu schedule?", at: at(10) },
  { id: "l3", text: "book flights", at: at(11) },
];

section("cleanScratchLine - a fragment, not a document");
is("null in, null out", S.cleanScratchLine(null), null);
is("blank text is not a scribble", S.cleanScratchLine({ text: "   " }), null);
is("a tab-and-newline-only entry is not a scribble", S.cleanScratchLine({ text: "\t\n " }), null);
is("text is trimmed", S.cleanScratchLine({ text: "  think  " }).text, "think");
is("an id is assigned when missing", /^s\d+$/.test(S.cleanScratchLine({ text: "x" }).id), true);
is("an existing id is kept", S.cleanScratchLine({ id: "keep", text: "x" }).id, "keep");
is("at is stamped when missing", S.cleanScratchLine({ text: "x" }).at, "2026-09-25T12:00:00.000Z");
is("an existing at is kept", S.cleanScratchLine({ text: "x", at: at(8) }).at, at(8));
// A pad entry is whatever you typed. Multi-line paste must survive intact:
// truncating it here would lose text the user can still see on screen.
is("an internal newline is preserved", S.cleanScratchLine({ text: "a\nb" }).text, "a\nb");
is("a long line is NOT truncated", S.cleanScratchLine({ text: "z".repeat(500) }).text.length, 500);
is("a numeric text is coerced, not dropped", S.cleanScratchLine({ text: 42 }).text, "42");

section("scratchLines - newest first, because that is what you are still thinking about");
is("null list is safe", S.scratchLines(null), []);
is("empty list is safe", S.scratchLines([]), []);
is("newest is first", S.scratchLines(pad)[0].id, "l3");
is("oldest is last", S.scratchLines(pad)[2].id, "l1");
is("order does not depend on input order", S.scratchLines([pad[1], pad[0], pad[2]])[0].id, "l3");
is("junk entries are dropped, good ones survive",
  S.scratchLines([pad[0], { text: "  " }, null, pad[1]]).length, 2);

section("addScratchLine - the line you typed is on the pad");
is("empty input leaves the pad UNTOUCHED (null, not an empty write)", S.addScratchLine(pad, "   "), null);
is("null input leaves the pad untouched", S.addScratchLine(pad, null), null);
is("adding to a null pad works - first ever line", S.addScratchLine(null, "first").length, 1);
{
  const next = S.addScratchLine(pad, "new thought");
  is("the pad grew by exactly one", next.length, pad.length + 1);
  is("the new line is at the top", next[0].text, "new thought");
  is("nothing already on the pad was lost",
    pad.every(l => next.some(n => n.text === l.text)), true);
}

/* SCRATCH_MAX is a guard on the META BLOB, not a feature. Meta is pushed whole
   on every settings change, so an abandoned pad growing without limit would
   slow every unrelated write. It trims the OLDEST, never the newest, because
   the line just typed is the one the user is still looking at. */
section("SCRATCH_MAX - a forgotten pad cannot bloat the meta blob");
{
  const many = Array.from({ length: S.SCRATCH_MAX + 20 }, (_, i) =>
    ({ id: "x" + i, text: "line " + i, at: at(0).replace("00:00:00", String(i % 24).padStart(2, "0") + ":00:00") }));
  const next = S.addScratchLine(many, "newest of all");
  is("the pad is capped", next.length, S.SCRATCH_MAX);
  is("and the line just typed SURVIVED the trim", next[0].text, "newest of all");
}
is("a pad under the cap is never trimmed", S.addScratchLine(pad, "x").length, 4);

section("scratchSeedText - what the AI is handed");
is("an empty pad seeds nothing, so Organize can do nothing", S.scratchSeedText([]), "");
is("a null pad seeds nothing", S.scratchSeedText(null), "");
is("one line per line, so the model sees the seams",
  S.scratchSeedText(pad).split("\n").length, 3);
// Oldest first: the order things occurred to you is information the model can use.
is("oldest first in the seed", S.scratchSeedText(pad).split("\n")[0], "call re: fee proposal");
is("newest last in the seed", S.scratchSeedText(pad).split("\n")[2], "book flights");
is("every line reaches the model", S.scratchSeedText(pad).includes("domu schedule?"), true);

/* THE PROPERTY THAT MATTERS MOST. Organize hands the pad off to a screen the
   user can back out of. If building the seed also emptied the pad, backing out
   would destroy the capture - and the user would have no way to know what was
   lost. Seeding must be a pure read. */
section("handing the pad to the AI does not consume it");
{
  const before = JSON.parse(JSON.stringify(pad));
  S.scratchSeedText(pad);
  is("the pad is byte-identical after seeding", pad, before);
  is("and still has every line", S.scratchLines(pad).length, 3);
}

/* The other half of that decision (Chris, 2026-09-25): the pad empties on APPLY,
   not on hand-off and not never. Never clearing means Organising the same pile
   twice creates every todo twice; clearing at hand-off loses the capture if he
   backs out. Both failures are silent, which is why both are pinned here. */
section("the pad empties on APPLY, and only of what was actually sent");
is("no id list means the plan did not come from the pad - leave it alone",
  S.scratchAfterApply(pad, null).length, 3);
is("an empty id list likewise leaves the pad alone", S.scratchAfterApply(pad, []).length, 3);
is("applying every sent line empties the pad",
  S.scratchAfterApply(pad, ["l1", "l2", "l3"]).length, 0);
is("a partial list removes only its own lines",
  S.scratchAfterApply(pad, ["l2"]).map(l => l.id), ["l3", "l1"]);
is("an id that is no longer on the pad is harmless",
  S.scratchAfterApply(pad, ["l2", "gone"]).length, 2);
{
  // The race that makes this worth doing: a thought captured WHILE the proposed
  // plan sits on screen was never part of that plan and must survive the apply.
  const withNew = S.addScratchLine(pad, "typed while the plan was on screen");
  const after = S.scratchAfterApply(withNew, ["l1", "l2", "l3"]);
  is("a line captured after the hand-off SURVIVES the apply", after.length, 1);
  is("and it is the new one", after[0].text, "typed while the plan was on screen");
}
{
  const before = JSON.parse(JSON.stringify(pad));
  S.scratchAfterApply(pad, ["l1"]);
  is("scratchAfterApply does not mutate the pad it is given", pad, before);
}

/* Guards against the pad quietly becoming a to-do list. It has no status, no
   due date and no Space: the moment it grows fields it stops being a scratch
   pad and becomes a second, worse inbox. If this fails, that drift has begun. */
section("a pad line stays a fragment - no status, no due date, no Space");
{
  const keys = Object.keys(S.cleanScratchLine({ text: "x" })).sort();
  is("exactly three fields: id, text, at", keys, ["at", "id", "text"]);
  is("fields invented by a caller are dropped",
    S.cleanScratchLine({ text: "x", status: "next", due: "2026-09-30" }).status, undefined);
}

report();
