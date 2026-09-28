/* A project shows its own todos.
   ===========================================================================
   WHY THIS SUITE EXISTS: reported by Chris 2026-09-28 - "I opened a project with
   two or three todos associated and don't see them AND when i opened a todo
   associated with that project it indicated as much."

   The project screen filtered the SPACE-SCOPED todo list. A todo whose Space
   differs from its project's was dropped from the project's own list, silently:
   no message, no count, just an empty screen under a project that plainly had
   work in it - while the todo's own row still displayed that project's name.
   The app appeared to contradict itself.

   Space mismatches are easy to create and nothing prevents them: the AI plan
   stamps a new todo with the ACTIVE Space and never consults the project's, and
   the editor's project picker will happily attach across Spaces.

   Silent-failure shape: nothing errors, nothing logs. Work simply becomes
   invisible on the one screen whose entire job is to show it. */
const { build, lift, is, section, report } = require("./lift");

const P = build(["projectTodos", "projectTodosOutOfSpace", "projectSpace", "projectTodoCounts",
  "projectTodoCountLabel", "withLinked"], `
  const DEFAULT_SPACE = "personal";
`);

const proj = { id: "p1", name: "Kitchen reno", space: "personal" };
const workProj = { id: "p2", name: "RTR fee proposal", space: "work" };
const todos = [
  { id: "t1", title: "Measure the run", projectId: "p1", space: "personal", status: "next" },
  { id: "t2", title: "Call the fitter", projectId: "p1", space: "work",     status: "next" },
  { id: "t3", title: "Pick tiles",      projectId: "p1",                    status: "done" },
  { id: "t4", title: "Unrelated",       projectId: "p2", space: "work",     status: "next" },
  { id: "t5", title: "No project",                       space: "personal", status: "next" },
];

section("a project lists every todo attached to it");
is("null list is safe", P.projectTodos(null, "p1"), []);
is("no project id returns nothing rather than everything", P.projectTodos(todos, ""), []);
is("null project id likewise", P.projectTodos(todos, null), []);
is("todos of other projects are excluded", P.projectTodos(todos, "p2").map(t => t.id), ["t4"]);
is("unattached todos are excluded", P.projectTodos(todos, "p1").some(t => t.id === "t5"), false);
is("a junk entry in the list cannot throw", P.projectTodos([null, todos[0]], "p1").length, 1);

/* THE REGRESSION ITSELF. Each of these three is attached to p1 and each sits in
   a different Space state: same as the project, a different Space, and no Space
   field at all. All three must appear. */
section("REGRESSION 2026-09-28 - a todo in another Space still shows on its project");
is("all three of p1's todos are listed", P.projectTodos(todos, "p1").map(t => t.id), ["t1", "t2", "t3"]);
is("the one in a DIFFERENT Space is included", P.projectTodos(todos, "p1").some(t => t.id === "t2"), true);
is("the one with NO Space at all is included", P.projectTodos(todos, "p1").some(t => t.id === "t3"), true);

/* PROOF the test would have caught it: this is the old, Space-scoped filter.
   If it ever passes, the assertion below has stopped testing anything. */
const scoped = (list, pid, space) => (list || []).filter(t => (t.space || "personal") === space).filter(t => t.projectId === pid);
is("PROOF: the old Space-scoped filter LOSES the cross-Space todo",
  scoped(todos, "p1", "personal").map(t => t.id), ["t1", "t3"]);
is("PROOF: and viewed from the work Space it loses two of the three",
  scoped(todos, "p1", "work").map(t => t.id), ["t2"]);

/* The count on the project LIST row is computed separately from the detail
   screen. If the two ever use different rules, the list promises work the detail
   screen does not show - which is its own version of the same bug. */
section("the open count matches what the detail screen will list");
const openCount = (list, pid) => P.projectTodos(list, pid).filter(t => t.status !== "done").length;
is("p1 has two open, counting across Spaces", openCount(todos, "p1"), 2);
is("and the detail screen lists exactly those two",
  P.projectTodos(todos, "p1").filter(t => t.status !== "done").map(t => t.id), ["t1", "t2"]);

/* Listing a cross-Space todo is right, but doing it with no explanation would be
   its own small confusion, so the screen says so. The mismatch is Chris's filing
   and is NOT silently rewritten. */
section("cross-Space todos are named, not silently corrected");
is("null project is safe", P.projectTodosOutOfSpace(todos, null), []);
is("the stray is identified", P.projectTodosOutOfSpace(todos, proj).map(t => t.id), ["t2"]);
is("a missing Space counts as the default, not as a mismatch",
  P.projectTodosOutOfSpace(todos, proj).some(t => t.id === "t3"), false);
is("a project whose todos all match reports none", P.projectTodosOutOfSpace(todos, workProj), []);
is("a project with no Space field is treated as the default",
  P.projectTodosOutOfSpace(todos, { id: "p1" }).map(t => t.id), ["t2"]);
{
  const before = JSON.stringify(todos);
  P.projectTodos(todos, "p1"); P.projectTodosOutOfSpace(todos, proj);
  is("neither function mutates the todos it is given", JSON.stringify(todos), before);
}

/* The screen must read the UNSCOPED collection. Reading `store.data` here is
   exactly the bug, and it looks completely reasonable at the call site, so it is
   pinned in the source rather than left to review to catch again. */
section("the project screen reads allData, not the Space-scoped data");
const SRC = require("fs").readFileSync(require("path").join(__dirname, "..", "index.html"), "utf8");
const view = SRC.slice(SRC.indexOf("function ProjectsView("), SRC.indexOf("VIEW: IDEAS"));
is("the detail screen sources its todos from allData",
  /projectTodos\(store\.allData\.todos, p\.id\)/.test(view), true);
is("no Space-scoped todo filter is left anywhere in the project screen",
  /store\.data\.todos\.filter\(t=>t\.projectId/.test(view), false);

/* TRIPWIRE for the whole class, not just the one screen. Resolving a foreign key
   against `store.data` (the Space-scoped set) is the defect: the relationship
   exists but the lookup misses it whenever the two items sit in different
   Spaces, and nothing errors. Six such lookups were fixed on 2026-09-28. If a
   new one appears, this fails and names it.
   Allowed: `store.data.<file>.find(x => x.id === <same-file id>)`, which is a
   lookup WITHIN one collection driven by something already on screen. */
section("tripwire - no foreign-key lookup reads the Space-scoped collection");
// [^A-Za-z] instead of a word-boundary escape: this file has already been
// corrupted once by a shell eating the escape, which left the regex matching
// nothing while still reporting a pass.
const FK = /store[.]data[.](todos|projects|goals|ideas)[.](find|filter|some)\([^)]*(projectId|goalId|promotedProjectId)/g;
const offenders = (SRC.match(FK) || []).map(m => m.trim());
is("no lookup by projectId/goalId reads store.data" +
   (offenders.length ? " (" + offenders.join(" | ") + ")" : ""), offenders, []);
is("and the known link lookups read allData instead",
  (SRC.match(/store\.allData\.(projects|goals|todos)\.(find|filter)/g) || []).length >= 4, true);

/* Inheriting the project's Space (Chris, 2026-09-28: "yes make new todos inherit
   their project's area"). v1.52.1 made a cross-Space todo visible; this stops
   most of them arising. The planner stamping the ACTIVE Space, never the
   project's, was the main source. */
section("projectSpace - where a new todo should be filed");
is("no project means no opinion, so the caller keeps its own default", P.projectSpace([proj], ""), "");
is("a null project id likewise", P.projectSpace([proj], null), "");
is("an UNKNOWN project id gives no opinion rather than a guess", P.projectSpace([proj], "ghost"), "");
is("a null project list is safe", P.projectSpace(null, "p1"), "");
is("a junk entry cannot throw", P.projectSpace([null, proj], "p1"), "personal");
is("the project's Space is returned", P.projectSpace([proj, workProj], "p2"), "work");
is("a project with no Space field reads as the default", P.projectSpace([{ id: "p9" }], "p9"), "personal");

/* The empty string is load-bearing: `addTop` does `row.space || newItemSpace()`,
   so "" must fall through to the old behaviour and never be stored as a Space. */
section("no opinion falls through to the caller's default, it is never stored");
const addTopSpace = (row, active) => row.space || active;
is("an unattached todo still gets the active Space",
  addTopSpace({ space: P.projectSpace([proj], "") }, "work"), "work");
is("an attached todo takes the project's Space instead of the active one",
  addTopSpace({ space: P.projectSpace([proj], "p1") }, "work"), "personal");
is("a todo attached to a project that vanished falls back, it does not blank",
  addTopSpace({ space: P.projectSpace([proj], "ghost") }, "work"), "work");

/* The end-to-end point: a todo created this way is no longer a stray on its own
   project, which is the bug that started all of this. */
section("a todo created under a project is not a stray on that project");
{
  const made = { id: "t9", title: "Planned by AI", projectId: "p1",
                 space: P.projectSpace([proj], "p1") || "work" };
  is("it is filed in the project's Space, not the active one", made.space, "personal");
  is("and it does NOT show up as out-of-Space",
    P.projectTodosOutOfSpace(todos.concat([made]), proj).some(t => t.id === "t9"), false);
  is("while the pre-existing stray is still reported",
    P.projectTodosOutOfSpace(todos.concat([made]), proj).map(t => t.id), ["t2"]);
}

/* Pinned in the source: these are wiring, not logic, and wiring is exactly what
   the unit tests above cannot see. The Organize-all bug of v1.52.0 was wiring. */
section("the creation paths actually use it");
const plan = SRC.slice(SRC.indexOf('filter(o=>o.op==="create_todo")'), SRC.indexOf('op==="update_todo"'));
is("the AI plan stamps a created todo with its project's Space",
  /space: projectSpace\(d\.projects, pid\)/.test(plan), true);
const picker = SRC.slice(SRC.indexOf('<span className="label">Project (optional)</span>'), SRC.indexOf('Location / context'));
is("choosing a project in the editor moves the Space field",
  /projectSpace\(store\.allData\.projects/.test(picker) && /setSpace\(ps\)/.test(picker), true);
is("a project created from the todo sheet is born in the todo's Space",
  /status:"active", outcome:"", description:"", deadline:"", goalId:null, space \}/.test(SRC), true);

/* The count on the Edit project sheet (Chris, 2026-09-28). He opened that sheet
   twice looking for his todos; it is a form and never listed them. */
section("projectTodoCounts - counted across Spaces");
is("p1 has two open and one done, whatever Space they sit in", P.projectTodoCounts(todos, "p1"), { open: 2, done: 1 });
is("an unknown project counts nothing", P.projectTodoCounts(todos, "ghost"), { open: 0, done: 0 });
is("a null list counts nothing", P.projectTodoCounts(null, "p1"), { open: 0, done: 0 });

section("projectTodoCountLabel - what the sheet says");
is("none", P.projectTodoCountLabel({ open: 0, done: 0 }), "No todos yet");
is("a null count reads as none, it does not throw", P.projectTodoCountLabel(null), "No todos yet");
is("one open is singular", P.projectTodoCountLabel({ open: 1, done: 0 }), "1 open todo");
is("several open", P.projectTodoCountLabel({ open: 3, done: 0 }), "3 open todos");
is("both", P.projectTodoCountLabel({ open: 3, done: 2 }), "3 open todos, 2 done");
is("both, singular open", P.projectTodoCountLabel({ open: 1, done: 4 }), "1 open todo, 4 done");
is("only done, one", P.projectTodoCountLabel({ open: 0, done: 1 }), "1 todo, done");
is("only done, several", P.projectTodoCountLabel({ open: 0, done: 5 }), "All 5 todos done");

/* A <select> whose value matches no option DISPLAYS its first option - "None" -
   while the link is still stored. Saving it then changes nothing, which is worse
   than an error: it looks confirmed. */
section("withLinked - a picker never hides the item it is linked to");
const browse = [{ id: "a" }, { id: "b" }];
const everything = [{ id: "a" }, { id: "b" }, { id: "elsewhere" }];
is("no link leaves the list as it was", P.withLinked(browse, everything, "").map(x => x.id), ["a", "b"]);
is("a link already in the list is not duplicated", P.withLinked(browse, everything, "a").map(x => x.id), ["a", "b"]);
is("a link OUTSIDE the browse list is added", P.withLinked(browse, everything, "elsewhere").map(x => x.id), ["a", "b", "elsewhere"]);
is("a link to something deleted adds nothing, rather than a ghost", P.withLinked(browse, everything, "gone").length, 2);
is("null lists are safe", P.withLinked(null, null, "x"), []);
{
  const before = JSON.stringify(browse);
  P.withLinked(browse, everything, "elsewhere");
  is("the browse list passed in is not mutated", JSON.stringify(browse), before);
}

/* THE ROOT CAUSE of "I don't see any of my to-dos under here": the Dashboard's
   Active projects list opened the Edit FORM on tap, directly under a row reading
   "3 open". The Projects tab opened the page. Pinned, because it is wiring. */
section("the Dashboard opens a project's PAGE, not its edit form");
const dStart = SRC.indexOf("function DashboardView(");
const dash = SRC.slice(dStart, SRC.indexOf("<Section title=\"Goals\"", dStart));
is("the Dashboard slice is non-empty, so these checks test something", dash.length > 500, true);
is("tapping an active project calls openProject", /onClick=\{\(\)=>openProject\(p\)\}/.test(dash), true);
is("and no longer opens the editor", /openEditor\("project",p\)/.test(dash), false);
is("the app routes openProject to the Projects page with a focus",
  /openProject=\{\(p\)=>\{ setProjFocus\(p\); setSub\("projects"\);/.test(SRC), true);
is("and the Projects page opens straight onto that project",
  /useState\(\(\) => focus \|\| null\)/.test(SRC), true);

section("the Edit sheet and both pickers are wired");
const pe = SRC.slice(SRC.indexOf("function ProjectEditor("), SRC.indexOf("function GoalEditor("));
is("the Edit sheet renders the count", /projectTodoCountLabel\(counts\)/.test(pe), true);
is("its count reads the unscoped todos", /projectTodoCounts\(store\.allData\.todos, t\.id\)/.test(pe), true);
is("the goal picker keeps the linked goal", /withLinked\([^;]*store\.allData\.goals, t\.goalId\)/.test(pe), true);
is("the todo editor's project picker keeps the linked project",
  /withLinked\([^;]*store\.allData\.projects, t\.projectId\)/.test(SRC), true);

/* STRICTER TRIPWIRE. The first one searched for `store.data.todos...projectId`,
   and the Dashboard slipped past it by destructuring `todos` from store.data a
   few lines up. The rule is now structural: every "todos of this project" filter
   goes through projectTodos(), so there is exactly one place to get it right. */
section("tripwire - every todos-by-project filter goes through projectTodos()");
const rawFilters = (SRC.match(/\.filter\(\s*\(?\s*t\s*\)?\s*=>\s*t\.projectId\s*===/g) || []);
is("no hand-written todos-by-project filter remains" +
   (rawFilters.length ? " (" + rawFilters.length + " found)" : ""), rawFilters.length, 0);

report();
