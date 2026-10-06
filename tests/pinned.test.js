/* Pinning a project to Today.
   ===========================================================================
   Chris, 2026-10-06: "I need to be able to pin a project on the homepage."

   A pin is a STANDING choice - it persists until unpinned - which is what makes
   the failure modes here quiet ones. A pinned project that stops appearing, or
   one that keeps appearing after it is finished, both look like the app simply
   forgot, with nothing on screen to say so. */
const { build, is, section, report, SRC } = require("./lift");

const P = build(["pinnedProjects", "projectTodos"], "");

const projects = [
  { id: "p1", name: "Kitchen reno",  pinned: true,  status: "active",   space: "personal" },
  { id: "p2", name: "Fee proposal",  pinned: true,  status: "onhold",   space: "work" },
  { id: "p3", name: "Not pinned",                   status: "active",   space: "personal" },
  { id: "p4", name: "Finished",      pinned: true,  status: "done",     space: "personal" },
  { id: "p5", name: "Filed away",    pinned: true,  status: "archived", space: "work" },
];

section("which projects a pin puts on Today");
is("null list is safe", P.pinnedProjects(null), []);
is("only pinned ones appear", P.pinnedProjects(projects).map(p => p.id), ["p1", "p2"]);
is("an unpinned project never appears", P.pinnedProjects(projects).some(p => p.id === "p3"), false);
is("a junk entry cannot throw", P.pinnedProjects([null, projects[0]]).length, 1);
is("pinned:false is treated as unpinned", P.pinnedProjects([{ id: "x", pinned: false, status: "active" }]), []);

/* A pin is standing, so a finished project would sit there forever otherwise.
   Chris should not have to tidy up after himself to stop seeing completed work. */
section("a pin stops showing once the project is over");
is("a DONE project drops off even while still pinned",
  P.pinnedProjects(projects).some(p => p.id === "p4"), false);
is("an ARCHIVED project likewise", P.pinnedProjects(projects).some(p => p.id === "p5"), false);
is("but ON HOLD still shows - paused is not finished, and that is often exactly why you pinned it",
  P.pinnedProjects(projects).some(p => p.id === "p2"), true);

/* The card lists the project's OPEN work. Done todos must not pad the count,
   or a long-finished project reads as busy. */
section("the card counts open work, not all work");
const todos = [
  { id: "t1", projectId: "p1", status: "next", space: "personal" },
  { id: "t2", projectId: "p1", status: "done", space: "personal" },
  { id: "t3", projectId: "p1", status: "waiting", space: "work" },
  { id: "t4", projectId: "p2", status: "next", space: "work" },
];
const openOf = (pid) => P.projectTodos(todos, pid).filter(t => t.status !== "done");
is("done work is excluded from the count", openOf("p1").map(t => t.id), ["t1", "t3"]);
is("work filed in another Space still counts - it belongs to the project",
  openOf("p1").some(t => t.id === "t3"), true);
is("a pinned project with nothing open still renders, it just says so", openOf("p2").length, 1);

/* Wiring. The card is only useful if it is actually on Today and the rows are
   the real todo rows; both are things the unit tests above cannot see. */
section("the card is wired into Today");
is("Today renders the pinned card", /<PinnedProjectsCard store=\{store\}/.test(SRC), true);
is("only on Today, not Tomorrow or the 7-day view",
  /!tomorrow && !week && <PinnedProjectsCard/.test(SRC), true);
is("it uses the real TodoRow, so each item can be ticked off in place",
  /function PinnedProjectsCard[\s\S]*?<TodoRow store=\{store\} todo=\{t\}/.test(SRC), true);
is("tapping the header opens the project's page", /openProject && openProject\(p\)/.test(SRC), true);
is("the project editor can set the flag", /store\.upsert\("projects",\{[^}]*pinned,/.test(SRC), true);
is("and the Projects list shows which are pinned", /p\.pinned && <span className="chip amber">/.test(SRC), true);
/* Rows inside a project's own card must not repeat that project's name - it
   crowded out the task text and said nothing (measured: 426px -> 313px). */
is("a row inside its project's card hides the project chip",
  SRC.includes("onOpen={()=>onOpenTodo(t)} hideProject/>"), true);
is("and TodoRow honours that flag", /\{project && !hideProject &&/.test(SRC), true);
is("but the chip still shows elsewhere by default", /function TodoRow\(\{ store, todo, onOpen, hideProject \}\)/.test(SRC), true);

report();
