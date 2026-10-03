/* Dashboard to-dos behave like to-dos everywhere else.
   ===========================================================================
   WHY THIS SUITE EXISTS: Chris, 2026-10-03, looking at a to-do under Recent
   activity: "How do I easily mark this ... as complete? Shouldn't there be
   something right there on that card without even having to open it, and
   shouldn't I also be able to slide and just delete it as well".

   Recent activity drew to-dos with the generic mixed-item Row (no tick, no
   swipe), and the Today/Overdue and Priorities lists had the tick but not the
   swipe. These are WIRING facts - the components themselves were fine - so they
   are pinned against the source. Wiring is what the unit tests elsewhere cannot
   see, and two of this project's recent bugs were wiring. */
const { is, section, report, SRC } = require("./lift");

const start = SRC.indexOf("function DashboardView(");
const end = SRC.indexOf("\nfunction ", start + 30);
const dash = SRC.slice(start, end);
is("the Dashboard source was found and is non-trivial, so these checks test something", dash.length > 2000, true);

section("every to-do row on the Dashboard can be completed and swiped away");
const todoRows = (dash.match(/<TodoRow\b/g) || []).length;
const swiped = (dash.match(/<SwipeRow[^>]*onDelete=\{\(\)=>del\("todos",[^)]*\)\}>\s*<TodoRow\b/g) || []).length;
is("the Dashboard renders to-do rows at all", todoRows >= 3, true);
is("EVERY TodoRow on the Dashboard sits inside a swipe-to-delete (" + swiped + " of " + todoRows + ")", swiped, todoRows);

section("Recent activity draws a to-do as a to-do");
const recentAt = dash.indexOf('title="Recent activity"');
const recent = dash.slice(recentAt, dash.indexOf("</Section>", recentAt) > 0 ? dash.indexOf("/>", dash.indexOf(":null}", recentAt)) + 2 : recentAt + 1200);
is("Recent activity was found", recentAt > 0, true);
is("a to-do entry renders the real TodoRow, with its tick", /r\.kind==="todo"[\s\S]*<TodoRow store=\{store\} todo=\{r\.x\}/.test(recent), true);
is("and it can be swiped to delete", /onDelete=\{\(\)=>del\("todos",r\.x\)\}/.test(recent), true);
is("goals, projects and ideas keep the generic row, which opens their editor",
  /: <Row key=\{r\.kind\+i\}[^>]*onClick=\{\(\)=>openEditor\(r\.kind, r\.x\)\}/.test(recent), true);

section("the delete is the undoable one");
is("the Dashboard is handed deleteWithUndo, not a raw remove",
  /<DashboardView [^>]*del=\{deleteWithUndo\}/.test(SRC), true);
is("and accepts it", /function DashboardView\(\{[^}]*\bdel\b[^}]*\}\)/.test(SRC), true);

report();
