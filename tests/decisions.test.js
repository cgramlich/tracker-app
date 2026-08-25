/* Decisions: a choice among enumerated alternatives, attached to a Rundown item
   or a note. Covers the normalizer and the "decide:" paste-import syntax. */
const { build, is, section, report } = require("./lift");

const D = build([
  "emptyDecision", "decisionHasContent", "decisionIsOpen", "cleanDecision", "decisionSummary",
  "parseDecisionLine", "_RD_STAT", "parseRundownPaste",
], `
  let _n = 0; function uid(){ return "id" + (++_n); }
  function nowISO(){ return "2026-08-07T00:00:00.000Z"; }
`);

section("cleanDecision");
is("null in, null out", D.cleanDecision(null), null);
is("all-blank is stored as nothing, not an empty shell", D.cleanDecision({ question: "  ", candidates: [] }), null);
is("a blank option is dropped",
  D.cleanDecision({ question: "q", candidates: [{ id: "a", label: "  ", value: "1" }] }).candidates, []);
is("the question is trimmed", D.cleanDecision({ question: "  what now  ", candidates: [] }).question, "what now");

section("the orphan guard");
// A chosenId pointing at a deleted option would render as "decided" with
// nothing actually picked - decided-looking but empty.
const orphan = D.cleanDecision({ question: "q", candidates: [{ id: "a", label: "A" }], chosenId: "gone", decidedAt: "x", why: "w" });
is("a chosenId pointing at a deleted option is cleared", orphan.chosenId, "");
is("and so is decidedAt", orphan.decidedAt, "");
is("and so is why", orphan.why, "");

section("a valid choice survives");
const chosen = D.cleanDecision({ question: "q", candidates: [{ id: "a", label: "A", value: " 0.325% " }], chosenId: "a", why: " because " });
is("chosenId kept", chosen.chosenId, "a");
is("value trimmed", chosen.candidates[0].value, "0.325%");
is("why trimmed", chosen.why, "because");
is("decidedAt stamped when missing", chosen.decidedAt, "2026-08-07T00:00:00.000Z");
is("an existing decidedAt is preserved",
  D.cleanDecision({ candidates: [{ id: "a", label: "A" }], chosenId: "a", decidedAt: "2026-01-01T00:00:00.000Z" }).decidedAt,
  "2026-01-01T00:00:00.000Z");
is("an option with no id gets one", D.cleanDecision({ candidates: [{ label: "A" }] }).candidates[0].id, "id1");

section("open vs decided");
is("null is not open", D.decisionIsOpen(null), false);
is("a bare question is a valid OPEN decision", D.decisionIsOpen({ question: "q", candidates: [] }), true);
is("options with no question are open too", D.decisionIsOpen({ question: "", candidates: [{ id: "a", label: "A" }] }), true);
is("a chosen option closes it", D.decisionIsOpen({ question: "q", candidates: [{ id: "a", label: "A" }], chosenId: "a" }), false);
is("an empty shell is not open", D.decisionIsOpen(D.emptyDecision()), false);

section("row summary");
is("prefers the question", D.decisionSummary({ question: "What do we counter with?", candidates: [{ label: "A" }] }), "What do we counter with?");
is("falls back to the option labels",
  D.decisionSummary({ question: "", candidates: [{ label: "0.325% flat" }, { label: "0.50/0.325 split" }] }),
  "0.325% flat / 0.50/0.325 split");
is("empty -> empty string", D.decisionSummary(null), "");

section("decide: import syntax");
is("empty -> null", D.parseDecisionLine("  "), null);
is("a bare question with no bar", D.parseDecisionLine("how bold is the ask?").question, "how bold is the ask?");
const three = D.parseDecisionLine("how bold is the ask? | pilot on one workflow ; AI-assist with review ; full autonomy");
is("question parsed", three.question, "how bold is the ask?");
is("three options", three.candidates.map(c => c.label), ["pilot on one workflow", "AI-assist with review", "full autonomy"]);
is("an import always starts OPEN - choosing is a deliberate tap", three.chosenId, "");

section("separator collisions the syntax exists to survive");
// ";" separates options, NOT "/", because real values contain slashes.
const slash = D.parseDecisionLine("what do we counter with? | flat = 0.325% ; split active/closed = 0.50/0.325");
is("a slash inside a VALUE survives", slash.candidates.map(c => c.value), ["0.325%", "0.50/0.325"]);
is("a slash inside a LABEL survives", slash.candidates[1].label, "split active/closed");
is("the LAST = splits label from value, so a label may contain one",
  D.parseDecisionLine("q | a = b = 42").candidates[0].label, "a = b");
is("options with no question", D.parseDecisionLine("| a ; b").candidates.map(c => c.label), ["a", "b"]);
is("blank options dropped", D.parseDecisionLine("q | a ; ; ; b").candidates.map(c => c.label), ["a", "b"]);
is("a trailing bar yields a question only", D.parseDecisionLine("q |").candidates, []);

section("decide: inside a pasted board");
const parsed = D.parseRundownPaste([
  "# Opportunities",
  "AI plan to BANA [live]",
  "  next: align the team on how bold the ask is",
  "  decide: how bold is the ask? | pilot ; AI-assist ; full autonomy",
  "  note: be bold as long as it is carefully designed",
  "Something else [waiting]",
].join("\n"));
is("one area", parsed.workstreams, ["Opportunities"]);
is("two items - the decide: line is NOT an item", parsed.items.map(i => i.name), ["AI plan to BANA", "Something else"]);
is("status tag stripped from the name", parsed.items[0].status, "live");
is("decision attached", parsed.items[0].decision.candidates.length, 3);
is("an item without a decide: line gets null, not an empty shell", parsed.items[1].decision, null);

report();
