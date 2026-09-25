/* useStore: the sync engine and the sign-out contract.
   ===========================================================================
   This is the only code in the app that can LOSE or LEAK a user's data. It
   decides what gets pushed, what a pull may overwrite, what survives being
   offline, and what is wiped when one account signs out and another signs in on
   the same phone. Until 2026-09-12 nothing tested it.

   Runs the REAL hook out of index.html via tests/store-harness.js, against a
   fake backend holding separate accounts. See that file for why a tiny hooks
   runtime is used instead of installing React.

   Where a test is named after a real bug, it also runs against a copy of the app
   with that fix deliberately stripped back out, and asserts the bug REAPPEARS.
   A regression test that would pass on the broken code is not a regression test. */
const { is, section, report, SRC } = require("./lift");
const { createBackend, createDevice, settle } = require("./store-harness");

// Strip a named fix out of the source, and refuse to continue if the anchor has
// moved - otherwise the "proof" would silently run against unmodified code.
function without(fix, anchor, replacement) {
  const n = SRC.split(anchor).length - 1;
  if (n !== 1) throw new Error("strip '" + fix + "': anchor found " + n + " times, expected exactly 1. " +
    "The code under test changed; update this proof rather than deleting it.");
  return SRC.replace(anchor, replacement);
}

async function signedIn(dev, email) {
  const app = dev.launch();
  await settle();
  await app.store.signIn(email, "pw");
  await settle();
  return app;
}

/* Alice uses the phone, signs out, Bob signs in and does something ordinary that
   writes his meta. Returns what landed in Bob's SERVER account. */
async function aliceThenBob(source, aliceWrites) {
  const be = createBackend();
  const dev = createDevice(be, { source });
  const app = await signedIn(dev, "alice@example.test");
  aliceWrites(app.store);
  await settle();
  const aliceMeta = be.account("alice@example.test").meta;
  await app.store.signOut();
  await settle();
  const afterSignOut = { localKeys: dev.localStorage.keys(), store: app.store };
  await app.store.signIn("bob@example.test", "pw");
  await settle();
  app.store.saveCfg({ ...app.store.cfg, appName: "Bob's app" });
  await settle();
  return { be, dev, app, aliceMeta, bobMeta: be.account("bob@example.test").meta || {}, afterSignOut };
}
const mentions = (obj, needle) => JSON.stringify(obj === undefined ? null : obj).includes(needle);

(async () => {

  /* ------------------------------------------------------------------------
     REGRESSION v1.40.1 (2026-08-01): SIGN-OUT LEAKED THE RUNDOWN ACROSS ACCOUNTS.

     What happened: the Rundown was added as a meta slice but never added to
     signOut. Its localStorage key survived, and so did rundownRef. buildMeta
     pushes whatever that ref holds, so on the NEXT account's first meta write the
     previous account's board was written into the new account's server row -
     a cross-account write of confidential work material. It was found by reading
     the code, not by a test, because there was no test.

     The rule it produced: a meta slice has FOUR parts, and the fourth - clearing
     it in signOut (localStorage key, ref AND state) - is the one that gets
     forgotten. The tripwire section below enforces that for every future slice.
     ------------------------------------------------------------------------ */
  section("REGRESSION v1.40.1 - sign-out leaked the Rundown into the next account");
  const board = (s) => s.saveRundown({ workstreams: [{ id: "w1", name: "Deals" }],
    items: [{ id: "i1", workstreamId: "w1", name: "ALICE-CONFIDENTIAL-BOARD" }] });

  const fixed = await aliceThenBob(SRC, board);
  is("precondition: Alice's board really reached her own server row", mentions(fixed.aliceMeta, "ALICE-CONFIDENTIAL-BOARD"), true);
  is("Bob's server meta contains NOTHING of Alice's board", mentions(fixed.bobMeta, "ALICE-CONFIDENTIAL-BOARD"), false);
  is("Bob's store shows no board of Alice's", mentions(fixed.app.store.rundown, "ALICE-CONFIDENTIAL-BOARD"), false);
  is("the rundown localStorage key is gone after sign-out", fixed.afterSignOut.localKeys.includes("tracker:rundown"), false);

  const broken = await aliceThenBob(without("v1.40.1 rundown sign-out",
    '"templates","rundown",', '"templates",').replace("rundownRef.current = null; setRundown(null);", ""), board);
  is("PROOF: with the v1.40.1 fix stripped out, the leak REAPPEARS in Bob's server row",
    mentions(broken.bobMeta, "ALICE-CONFIDENTIAL-BOARD"), true);

  /* ------------------------------------------------------------------------ */
  section("every meta slice is cleared on sign-out, by behaviour");
  const slices = {
    templates:    (s) => s.saveTemplates([{ id: "t1", name: "ALICE-TEMPLATE", items: ["pack"] }]),
    habits:       (s) => s.saveHabits([{ id: "h1", name: "ALICE-HABIT", cadence: "daily", done: [] }]),
    affirmations: (s) => s.saveAffirmations([{ id: "a1", text: "ALICE-AFFIRMATION" }]),
    spaces:       (s) => s.saveSpaces([{ id: "personal", name: "ALICE-SPACE", color: "#000", order: 0, archived: false }]),
    cfg:          (s) => s.saveCfg({ ...s.cfg, appName: "ALICE-APPNAME" }),
    // Added 2026-09-13 with the orders feature; the tripwire below refused to pass without it.
    orders:       (s) => s.saveOrders([{ id: "o1", merchant: "ALICE-STORE", item: "ALICE-ORDER", orderedAt: "2026-09-01", status: "ordered" }]),
    /* Added 2026-09-25 with the scratch pad; the tripwire refused to pass without it.
       This is the worst slice to leak: a scratch pad holds unfiltered half-thoughts
       typed with no thought at all for who might read them later. */
    scratch:      (s) => s.saveScratch([{ id: "s1", text: "ALICE-SCRATCH", at: "2026-09-25T10:00:00.000Z" }]),
  };
  for (const [slice, write] of Object.entries(slices)) {
    const needle = { templates: "ALICE-TEMPLATE", habits: "ALICE-HABIT", affirmations: "ALICE-AFFIRMATION",
      spaces: "ALICE-SPACE", cfg: "ALICE-APPNAME", orders: "ALICE-ORDER", scratch: "ALICE-SCRATCH" }[slice];
    const r = await aliceThenBob(SRC, write);
    is(slice + ": reached Alice's own server row first", mentions(r.aliceMeta, needle), true);
    is(slice + ": never reaches Bob's server row", mentions(r.bobMeta, needle), false);
    is(slice + ": not visible in Bob's store", mentions({ c: r.app.store.cfg, s: r.app.store.spaces, t: r.app.store.templates,
      h: r.app.store.habits, a: r.app.store.affirmations, o: r.app.store.orders,
      sc: r.app.store.scratch }, needle), false);
  }

  /* ------------------------------------------------------------------------
     TRIPWIRE. The behavioural tests above only cover slices that exist today.
     These read the source so that ADDING a meta slice without also clearing it
     in signOut, and without adding it to the behavioural list above, fails the
     suite - the exact omission behind v1.40.1.
     ------------------------------------------------------------------------ */
  section("tripwire - every key buildMeta can write is cleared by signOut");
  const bm = SRC.slice(SRC.indexOf("const buildMeta = () => {"), SRC.indexOf("return m;", SRC.indexOf("const buildMeta = () => {")));
  const metaKeys = Array.from(new Set((bm.match(/\bm\.(\w+)\s*=/g) || []).map(x => x.match(/m\.(\w+)/)[1])));
  const so = SRC.slice(SRC.indexOf("const signOut = useCallback("), SRC.indexOf("const deleteAccount = useCallback("));
  const lsDelList = (so.match(/\[([^\]]*)\]\.forEach\(k => lsDel\(k\)\)/) || ["", ""])[1];
  is("buildMeta source was found and has keys", metaKeys.length >= 5, true);
  for (const k of metaKeys) {
    if (k === "cfg") {
      is("cfg is RESET to defaults on sign-out (it is overwritten, not deleted)", /lsSet\("cfg", DEFAULT_CFG\)/.test(so), true);
      continue;
    }
    is("'" + k + "' is removed from localStorage in signOut", lsDelList.includes('"' + k + '"'), true);
  }
  const ALLOW = ["cfg", "spaces", "defaultSpace", "spacesSeeded", "templates", "rundown",
                 "affirmations", "habits", "habitsMigrated", "habitsBackup", "orders", "scratch"];
  const unknown = metaKeys.filter(k => !ALLOW.includes(k));
  is("no NEW meta key has appeared without a sign-out test being added here" +
     (unknown.length ? " (new: " + unknown.join(", ") + ")" : ""), unknown, []);

  /* ------------------------------------------------------------------------ */
  section("sign-out wipes the device, not just the screen");
  {
    const be = createBackend();
    be.seed("alice@example.test", { todos: [{ id: "x1", title: "ALICE-TODO", status: "next", order: 0 }] });
    const dev = createDevice(be);
    const app = await signedIn(dev, "alice@example.test");
    is("precondition: Alice's todo is on the device", mentions(app.store.allData.todos, "ALICE-TODO"), true);
    await app.store.signOut(); await settle();
    is("in-memory todos are empty", app.store.allData.todos, []);
    is("no cached collection survives in localStorage",
      dev.localStorage.keys().filter(k => k.startsWith("tracker:cache:")).some(k => mentions(dev.ls(k.slice(8)), "ALICE-TODO")), false);
    is("dirty flags are cleared", dev.ls("dirty"), undefined);
    await app.store.signIn("bob@example.test", "pw"); await settle();
    is("Bob sees none of Alice's todos", mentions(app.store.allData.todos, "ALICE-TODO"), false);
    is("and nothing of Alice's was pushed to Bob", mentions(be.account("bob@example.test").todos, "ALICE-TODO"), false);
  }

  /* ------------------------------------------------------------------------ */
  section("sign-in pulls once; a background token refresh does not re-pull");
  {
    const be = createBackend();
    const dev = createDevice(be);
    const app = await signedIn(dev, "alice@example.test");
    const pullsBefore = be.calls.filter(c => c.op === "get").length;
    is("sign-in pulled every collection", pullsBefore, 4);
    be.emit("TOKEN_REFRESHED"); await settle();
    is("a token refresh caused no second pull", be.calls.filter(c => c.op === "get").length, pullsBefore);
    app.unmount();
  }

  /* ------------------------------------------------------------------------ */
  section("offline edits survive a relaunch and push when back online");
  {
    const be = createBackend();
    const dev = createDevice(be);
    const app = await signedIn(dev, "alice@example.test");
    dev.navigator.onLine = false;
    app.store.upsert("todos", { title: "WRITTEN-OFFLINE", status: "next" });
    await settle();
    is("nothing reached the server while offline", mentions(be.account("alice@example.test").todos, "WRITTEN-OFFLINE"), false);
    is("the todos file is flagged dirty on disk", (dev.ls("dirty") || {}).todos, true);
    is("the row is in the on-disk cache", mentions(dev.ls("cache:todos"), "WRITTEN-OFFLINE"), true);

    app.unmount();                                // the phone kills the app
    const relaunched = dev.launch(); await settle();
    is("after relaunch the row is still there", mentions(relaunched.store.allData.todos, "WRITTEN-OFFLINE"), true);
    is("and still flagged dirty", (relaunched.store.dirty || {}).todos, true);

    dev.navigator.onLine = true;
    await relaunched.store.pushDirty(); await settle();
    is("back online, it reaches the server", mentions(be.account("alice@example.test").todos, "WRITTEN-OFFLINE"), true);
    is("and the dirty flag clears only after the server accepted it", (dev.ls("dirty") || {}).todos, false);
    relaunched.unmount();
  }

  /* ------------------------------------------------------------------------ */
  section("a pull never overwrites a file with unpushed local changes");
  {
    const be = createBackend();
    const dev = createDevice(be);
    const app = await signedIn(dev, "alice@example.test");
    dev.navigator.onLine = false;
    app.store.upsert("todos", { title: "LOCAL-UNPUSHED", status: "next" });
    await settle();
    // Meanwhile another device wrote to the same collection on the server.
    be.account("alice@example.test").todos = [{ id: "srv", title: "FROM-OTHER-DEVICE", status: "next", order: 0 }];
    be.account("alice@example.test").ideas = [{ id: "idea1", title: "SERVER-IDEA", state: "raw", order: 0 }];
    dev.navigator.onLine = true;
    const getsBefore = be.calls.filter(c => c.op === "get" && c.f === "todos").length;
    await app.store.pull(); await settle();
    is("the dirty todos file was NOT fetched", be.calls.filter(c => c.op === "get" && c.f === "todos").length, getsBefore);
    is("the unpushed local row survived the pull", mentions(app.store.allData.todos, "LOCAL-UNPUSHED"), true);
    is("a CLEAN file was still refreshed from the server", mentions(app.store.allData.ideas, "SERVER-IDEA"), true);
  }

  /* ------------------------------------------------------------------------ */
  section("a failed push keeps the dirty flag - nothing is dropped");
  {
    const be = createBackend();
    const dev = createDevice(be);
    const app = await signedIn(dev, "alice@example.test");
    be.failNext("put");
    app.store.upsert("todos", { title: "PUSH-FAILS-ONCE", status: "next" });
    await settle();
    is("the push failed and sync reports an error", app.store.sync, "error");
    is("the dirty flag is still set after the failure", (dev.ls("dirty") || {}).todos, true);
    await app.store.pushDirty(); await settle();
    is("the retry lands it on the server", mentions(be.account("alice@example.test").todos, "PUSH-FAILS-ONCE"), true);
    is("and only now is the flag cleared", (dev.ls("dirty") || {}).todos, false);
  }

  /* ------------------------------------------------------------------------
     REGRESSION v1.34.1 (2026-07-28): STALE DIRTY FLAGS IN markDirty.

     What happened: markDirty spread dirtyRef.current into a new map but left the
     ref itself to be updated by the next render. Mutators that touch several
     files in one call (relabel, applyPlan, restoreLabel, ensureOrders,
     ensureSpaces) each spread the SAME stale map, so the last call dropped the
     earlier files' flags. A file with real local changes then read as clean and
     the next pull silently rolled it back to the server copy.
     ------------------------------------------------------------------------ */
  section("REGRESSION v1.34.1 - a multi-file edit must flag EVERY file it touched");
  async function relabelOffline(source) {
    const be = createBackend();
    const dev = createDevice(be, { source });
    be.seed("alice@example.test", {
      todos: [{ id: "t1", title: "a todo", type: "Admin", status: "next", order: 0 }],
      ideas: [{ id: "i1", title: "an idea", type: "Admin", state: "raw", order: 0 }],
    });
    const app = await signedIn(dev, "alice@example.test");
    dev.navigator.onLine = false;
    app.store.relabel("type", "Admin", "Paperwork");   // touches todos AND ideas in one call
    await settle();
    return dev.ls("dirty") || {};
  }
  const relabelFixed = await relabelOffline(SRC);
  is("todos flagged dirty", relabelFixed.todos, true);
  is("ideas ALSO flagged dirty - the flag the old bug dropped", relabelFixed.ideas, true);
  const relabelBroken = await relabelOffline(without("v1.34.1 markDirty",
    "[file]:true };\n    dirtyRef.current = nd;", "[file]:true };\n    "));
  is("PROOF: with the v1.34.1 fix stripped out, a flag is LOST again",
    relabelBroken.todos === true && relabelBroken.ideas === true, false);

  /* ------------------------------------------------------------------------ */
  section("a returning user's own Space list is never overwritten on sign-in");
  {
    const be = createBackend();
    const bobSpaces = [{ id: "personal", name: "BOB-HOME", color: "#123456", order: 0, archived: false },
                       { id: "garage", name: "BOB-GARAGE", color: "#654321", order: 1, archived: false }];
    be.seed("bob@example.test", { meta: { cfg: { appName: "Bob" }, spaces: bobSpaces, defaultSpace: "personal", spacesSeeded: true } });
    const dev = createDevice(be);
    const first = await signedIn(dev, "alice@example.test");
    await first.store.signOut(); await settle();
    await first.store.signIn("bob@example.test", "pw"); await settle();
    first.store.saveCfg({ ...first.store.cfg, appName: "Bob again" }); await settle();
    is("Bob's custom Spaces are still on the server after his next meta write",
      mentions(be.account("bob@example.test").meta.spaces, "BOB-GARAGE"), true);
    is("and they are what his store shows", mentions(first.store.spaces, "BOB-GARAGE"), true);
  }

  /* ------------------------------------------------------------------------
     REGRESSION 2026-09-12: A META CHANGE WAS MARKED CLEAN BY A PUSH ALREADY IN FLIGHT.

     Found by THIS suite, the first time it ran. The habit migration deletes rows,
     so it is exercised here end to end through a real sign-in pull.

     What happened: on a first pull, ensureSpaces started a background meta push.
     While it was in flight, ensureHabits converted the routine todos into habits
     and set the one meta-dirty flag. The earlier push then completed and cleared
     that flag, even though it had sent meta from BEFORE the migration. The pull's
     final push saw a clean flag and did nothing. The server lost the routine todos
     (they were deleted and pushed) but never received the habits, their backup,
     or the "migration done" marker. They survived only on the phone until some
     later settings save carried them; signing out first would have lost them.

     The fix: a meta change counter (metaSeqRef). A push may clear the flag only if
     nothing changed while it was sending; otherwise it pushes again.
     ------------------------------------------------------------------------ */
  section("REGRESSION 2026-09-12 - habit migration's meta was dropped by an in-flight push");
  const routines = { todos: [
    { id: "r1", title: "Complete daily exercise", routine: true, recur: "daily", status: "done", completedAt: "2026-09-01T08:00:00Z", order: 0 },
    { id: "r2", title: "Complete daily exercise", routine: true, recur: "daily", status: "next", due: "2026-09-12", order: 1 },
    { id: "p1", title: "An ordinary todo", status: "next", order: 2 },
  ] };
  async function migrateOnSignIn(source) {
    const be = createBackend();
    be.seed("alice@example.test", routines);
    const dev = createDevice(be, { source });
    const app = await signedIn(dev, "alice@example.test");
    return { be, dev, app, server: be.account("alice@example.test") };
  }
  {
    const { app, server } = await migrateOnSignIn(SRC);
    is("the routine became exactly one habit", (app.store.habits || []).map(h => h.name), ["Complete daily exercise"]);
    is("its completion history came across", (app.store.habits[0] || {}).done, ["2026-09-01"]);
    is("the routine rows were removed from the server", server.todos.map(t => t.id), ["p1"]);
    is("the ordinary todo was NOT touched", server.todos.some(t => t.title === "An ordinary todo"), true);
    is("the HABIT itself reached the server, not just the phone",
      (server.meta.habits || []).map(h => h.name), ["Complete daily exercise"]);
    is("the deleted rows are stashed in the server's habitsBackup", (server.meta.habitsBackup || []).map(t => t.id).sort(), ["r1", "r2"]);
    is("the migration is marked done on the server so it cannot run twice", server.meta.habitsMigrated, true);

    await app.store.pull(); await settle();
    is("a second pull does not duplicate the habit", (app.store.habits || []).length, 1);
  }
  {
    // Recreate the pre-fix pushCfg: clear the flag unconditionally after any push.
    const { server } = await migrateOnSignIn(without("2026-09-12 meta counter",
      "if(metaSeqRef.current === sentSeq){", "if(true){"));
    is("PROOF: with the fix stripped out, the habits again never reach the server",
      (server.meta.habits || []).length === 0 && server.meta.habitsMigrated !== true, true);
  }

  /* ------------------------------------------------------------------------ */
  section("a meta change made while a push is in flight is not lost");
  {
    const be = createBackend();
    const dev = createDevice(be);
    const app = await signedIn(dev, "alice@example.test");
    // Two saves back to back: the second lands while the first push is still awaiting.
    app.store.saveHabits([{ id: "h1", name: "FIRST-SAVE", cadence: "daily", done: [] }]);
    app.store.saveAffirmations([{ id: "a1", text: "SECOND-SAVE" }]);
    await settle();
    const meta = be.account("alice@example.test").meta;
    is("the first change is on the server", mentions(meta.habits, "FIRST-SAVE"), true);
    is("the second change is on the server too", mentions(meta.affirmations, "SECOND-SAVE"), true);
    is("and meta is only marked clean once both are sent", dev.ls("cfgDirty"), false);
  }

  report();
})().catch((e) => { console.error("store.test.js crashed:", e && e.stack || e); process.exit(1); });
