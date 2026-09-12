/* Store harness: runs the REAL useStore hook in Node.
   ===========================================================================
   WHAT THIS OWNS: executing `useStore` out of index.html against a fake device
   (localStorage, online flag) and a fake backend that holds SEPARATE accounts.
   It exists so the sync engine and the sign-out contract can be tested by
   behaviour, which is the only way the cross-account leak can be reproduced:
   it needs one device, two logins, and a meta write in between.

   WHAT IT DOES NOT DO: render UI, or talk to Supabase or Railway. Everything
   past `collGet / collPut / metaGet / metaPut / supa.auth` is the fake below.

   THE HOOKS RUNTIME. React is not installed and is deliberately not added as a
   dependency for this. The runtime below implements only the five hooks the
   store uses, and it MEMOIZES useCallback / useMemo / useEffect on their
   dependency arrays exactly as React does. That is load-bearing: the store's
   callbacks capture the closure of the render they were created in, and a
   runtime that handed back a fresh function every render would hide exactly the
   stale-closure bugs (the markDirty flag loss of 2026-07-28) a sync test exists
   to catch.

   Effects run after a render when their dependencies change, and their
   cleanups run on `unmount`. `setInterval` is inert so the 30s retry never fires
   mid-test; tests call pushDirty directly instead. */
const { liftFrom, liftConstFrom, SRC } = require("./lift");

// --------------------------------------------------------------------------
// Minimal hooks runtime
// --------------------------------------------------------------------------
function createRuntime() {
  const slots = [];
  let idx = 0, pendingEffects = [];
  const same = (a, b) => Array.isArray(a) && Array.isArray(b) &&
    a.length === b.length && a.every((x, i) => Object.is(x, b[i]));

  const R = {
    useState(init) {
      const i = idx++;
      if (!(i in slots)) {
        const s = { v: typeof init === "function" ? init() : init };
        s.set = (nv) => { s.v = typeof nv === "function" ? nv(s.v) : nv; };
        slots[i] = s;
      }
      return [slots[i].v, slots[i].set];
    },
    useRef(init) {
      const i = idx++;
      if (!(i in slots)) slots[i] = { current: init };
      return slots[i];
    },
    useCallback(fn, deps) {
      const i = idx++;
      if (slots[i] && same(slots[i].deps, deps)) return slots[i].v;
      slots[i] = { v: fn, deps };
      return fn;
    },
    useMemo(fn, deps) {
      const i = idx++;
      if (slots[i] && same(slots[i].deps, deps)) return slots[i].v;
      slots[i] = { v: fn(), deps };
      return slots[i].v;
    },
    useEffect(fn, deps) {
      const i = idx++;
      if (slots[i] && same(slots[i].deps, deps)) return;
      const prev = slots[i];
      slots[i] = { deps, cleanup: null };
      pendingEffects.push(() => {
        if (prev && prev.cleanup) prev.cleanup();
        const c = fn();
        slots[i].cleanup = typeof c === "function" ? c : null;
      });
    },
  };
  return {
    R,
    render(hook) {
      idx = 0;
      const out = hook();
      const run = pendingEffects; pendingEffects = [];
      run.forEach(e => e());
      return out;
    },
    unmount() {
      slots.forEach(s => { if (s && typeof s.cleanup === "function") s.cleanup(); });
    },
  };
}

// --------------------------------------------------------------------------
// Fake backend: separate accounts, one "current" session
// --------------------------------------------------------------------------
function createBackend() {
  const accounts = {};
  const calls = [];
  const listeners = [];
  let current = null;
  const failures = new Set();
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const acct = (email) => (accounts[email] = accounts[email] ||
    { todos: [], ideas: [], projects: [], goals: [], meta: null });
  const who = () => {
    if (!current) throw new Error("Session expired");
    return acct(current);
  };
  const maybeFail = (op) => {
    if (failures.has(op)) { failures.delete(op); throw new Error("Failed to fetch"); }
  };
  const fire = (evt, session) => listeners.slice().forEach(cb => cb(evt, session));

  return {
    accounts, calls,
    get current() { return current; },
    account: (email) => acct(email),
    seed(email, data) { Object.assign(acct(email), clone(data)); },
    failNext(op) { failures.add(op); },
    // Fire an auth event for the CURRENT session, e.g. a background token refresh.
    emit(evt) { fire(evt, current ? { user: { email: current } } : null); },

    collGet: async (f) => { calls.push({ op: "get", who: current, f }); maybeFail("get"); return clone(who()[f]); },
    collPut: async (f, rows) => { calls.push({ op: "put", who: current, f }); maybeFail("put"); who()[f] = clone(rows); },
    metaGet: async () => { calls.push({ op: "metaGet", who: current }); maybeFail("metaGet"); return clone(who().meta); },
    metaPut: async (m) => { calls.push({ op: "metaPut", who: current, keys: Object.keys(m) }); maybeFail("metaPut"); who().meta = clone(m); },

    supa: {
      auth: {
        getSession: async () => ({ data: { session: current ? { user: { email: current } } : null } }),
        onAuthStateChange: (cb) => {
          listeners.push(cb);
          return { data: { subscription: { unsubscribe() { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); } } } };
        },
        signInWithPassword: async ({ email }) => { current = email; acct(email); fire("SIGNED_IN", { user: { email } }); return { error: null }; },
        signOut: async () => { current = null; fire("SIGNED_OUT", null); return { error: null }; },
        signUp: async ({ email }) => ({ data: { user: { email }, session: null }, error: null }),
        resetPasswordForEmail: async () => ({ error: null }),
        updateUser: async () => ({ error: null }),
      },
    },
  };
}

// --------------------------------------------------------------------------
// Compile useStore out of a source text
// --------------------------------------------------------------------------
/* Everything useStore reaches for at module scope. Pure helpers are LIFTED from
   the source so they are the shipping code; only the network, auth and the
   browser globals are supplied by the harness. */
const LIFTED_CONSTS = [
  "uid", "nowISO", "todayKey", "TODAY", "NS", "lsGet", "lsSet", "lsDel", "FILES",
  "DEFAULT_LOCATIONS", "DEFAULT_CATEGORIES", "DEFAULT_ACCENT", "DEFAULT_THEME",
  "DEFAULT_CFG", "DEFAULT_SPACE", "SEED_SPACES_LEGACY", "SEED_SPACES_NEW",
  "HABIT_CADENCES", "PROJ_STATUS_ORDER", "QUADRANTS",
];
const LIFTED_FUNCTIONS = [
  "syncErrText", "spaceForType", "addInterval", "nextDue", "rollToToday",
  "defaultRoutineFor", "isRoutine", "migrateRoutines",
  "quadWeight", "isOverdue", "isToday", "sortTodos", "sortIdeas", "sortProjects", "sortGoals",
  "useStore",
];
const LIFTED_AFTER = ["NAT_CMP"];   // depends on the sort functions above

function compileStore(src) {
  const pieces = [];
  const tryConst = (n) => { try { pieces.push(liftConstFrom(src, n)); } catch (e) { /* not every build has every const */ } };
  LIFTED_CONSTS.forEach(tryConst);
  LIFTED_FUNCTIONS.forEach((n) => {
    try { pieces.push(liftFrom(src, n)); }
    catch (e) { if (n === "useStore") throw e; }
  });
  LIFTED_AFTER.forEach(tryConst);

  const code = `
    const { useState, useRef, useCallback, useMemo, useEffect } = env.R;
    const localStorage = env.localStorage;
    const navigator = env.navigator;
    const window = env.window;
    const document = env.document;
    const setInterval = () => 0;
    const clearInterval = () => {};
    const fetch = async () => { throw new Error("fetch is not available in the store harness"); };
    const supa = env.backend.supa;
    const collGet = (f) => env.backend.collGet(f);
    const collPut = (f, rows) => env.backend.collPut(f, rows);
    const metaGet = () => env.backend.metaGet();
    const metaPut = (m) => env.backend.metaPut(m);
    const authToken = async () => (env.backend.current ? "test-token" : null);
    const API_BASE = "http://store-harness.invalid";
    function log(tag, msg){ env.logs.push(tag + " " + msg); }
    ${pieces.join("\n\n")}
    return useStore;
  `;
  return new Function("env", code);
}

// --------------------------------------------------------------------------
// A device: persistent localStorage + online flag, launchable many times
// --------------------------------------------------------------------------
function createDevice(backend, opts) {
  const factory = compileStore((opts && opts.source) || SRC);
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    keys: () => Array.from(store.keys()),
  };
  const navigator = { onLine: true };
  const noopTarget = { addEventListener() {}, removeEventListener() {} };
  const document = Object.assign({ visibilityState: "visible" }, noopTarget);

  const device = {
    backend, localStorage, navigator, logs: [],
    /* Launch the app: a fresh hook instance over the SAME localStorage, which is
       what a relaunch of the installed PWA is. */
    launch() {
      const rt = createRuntime();
      const useStore = factory({ R: rt.R, backend, localStorage, navigator, window: noopTarget, document, logs: device.logs });
      let current = rt.render(useStore);
      return {
        get store() { current = rt.render(useStore); return current; },
        unmount: () => rt.unmount(),
      };
    },
    // Read a namespaced localStorage key the way the app does.
    ls(key) {
      const raw = localStorage.getItem("tracker:" + key);
      return raw === null ? undefined : JSON.parse(raw);
    },
  };
  return device;
}

// Let every queued promise continuation run. Sync is async all the way down.
async function settle(rounds) {
  for (let i = 0; i < (rounds || 25); i++) await new Promise((r) => setImmediate(r));
}

module.exports = { createBackend, createDevice, compileStore, settle };
