# CLAUDE.md - Tracker App (Priority Captain frontend)

Auto-read by Claude Code at session start. Keep it current.

**Doc currency (see starter spec §5):** keep this file + the architecture doc in step
with the code in the SAME session you change code. Don't hardcode the version here
(point to `APP_VERSION`/`BUILD` + the backend `/health`); update the doc body when the
architecture changes; write a DATED entry in the app's Log folder for EVERY work session:
`C:\Users\cjgra\Dropbox\My AI\CG Apps\PriorityCaptain\ToDos Tasks App Log\`.
Rule: `CG Apps\Forever Apps\forever-apps-starter-spec.md` section 5.

## What this is
Priority Captain frontend (repo/working title: Tracker): a SINGLE-FILE HTML PWA
(React via CDN + Babel standalone, no build step) - a personal GTD + Eisenhower
task app with Spaces, Dashboard, Templates, read-only calendar overlay, notes
capture ("Jot a note"), and an AI organizer. Backend is a SEPARATE repo
(`tracker-backend`, FastAPI on Railway). The Forever Apps template's reference
implementation for the portfolio-standard updater.

**Brand:** the app is **Priority Captain** (appId `com.prioritycaptain`). The repo
and Pages URL stay `tracker-app` - renaming would change the live URL and break the
PWA's self-update - so "Tracker" in these docs = the codebase/working title.

## Coordinates
- Repo: `cgramlich/tracker-app` (public). GitHub username is `cgramlich`
  (no "j" - easy to mistype as the email handle cjgramlich).
- Live URL: https://cgramlich.github.io/tracker-app/ (GitHub Pages from `main`).
  `welcome.html` = public teaser page; `privacy.html` + `terms.html` both present and
  linked from the welcome footer, the sign-up screen, the More hub, and Settings.
- Deploy: push to `main` -> Pages redeploys.
- The app is one file: `index.html`. Deliverable file name is exactly `index.html`.
- Version: source of truth = `APP_VERSION` (friendly label) + `BUILD`
  ("YYYY-MM-DD.N" - what the in-app updater actually compares) in `index.html`,
  plus `VERSION` in `sw.js` in lockstep. Bump `BUILD` (+ `APP_VERSION` when
  user-facing) on EVERY deploy or installed users silently never update. Do NOT
  hardcode the current number in this doc - it drifts.
- Backend base URL: `API_BASE` in `index.html` =
  https://web-production-f0353.up.railway.app (verify via its `/health`).

## Verify before delivering
- `npm run check` (check.js, Babel-in-Node compile gate) BEFORE every deploy;
  then content-grep to confirm each intended change is present.
- For automated edits, assert each anchor string appears EXACTLY ONCE before
  replacing.
- One change set per deploy.

## How Chris works
- Plain-English feedback; you read the code and make edits directly. Iterate freely.
- Ask before building: feature work gets a SHORT proposal + sign-off first. One
  step at a time; wait for confirmation.
- Debug logs-first: ask for console output / network response / screenshot before
  theorizing. Do not guess.
- Direct, no hedging. Production-ready, not demos.
- Commands handed to Chris: ONE per code block, never grouped, wait for output.
- Environment: Windows 11. Keep console/log output ASCII-safe (no emoji).

## Reference docs (read for full context; keep in sync)
- Architecture: `CG Apps\PriorityCaptain\tracker-architecture.md`
- Scope docs (Spaces, calendar view, notes) + the cold-start HANDOFF and
  `DECISION-radar-visualization.md`: `CG Apps\PriorityCaptain\`
  (folder was `ToDos Tasks Projects Ideas\` until mid-2026; older docs cite the old name)
- Forever Apps starter spec: `CG Apps\Forever Apps\forever-apps-starter-spec.md`
- Backend CLAUDE.md: `C:\Users\cjgra\tracker-backend\CLAUDE.md`
