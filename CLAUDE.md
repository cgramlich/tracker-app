# CLAUDE.md - Tracker App (Priority Captain frontend)

Auto-read by Claude Code at session start. Keep it current.

**Doc currency (see starter spec §5):** keep this file + the architecture doc in step
with the code in the SAME session you change code. Don't hardcode the version here
(point to `APP_VERSION`/`BUILD` + the backend `/health`); update the doc body when the
architecture changes; write a DATED entry in the app's Log folder for EVERY work session:
`C:\Users\cjgra\Dropbox\My AI\CG Apps\PriorityCaptain\ToDos Tasks App Log\`.
Rule: `CG Apps\Forever Apps\forever-apps-starter-spec.md` section 5.

## Code readability (Chris's directive 2026-08-10) - part of "done"
This code has to be readable by three people who were not in the room when it was
written: a human AUDITOR reconstructing what the system does, a REGULATOR asking
"show me where that rule is implemented", and a DEVELOPER JOINING COLD. If any of
them has to ask "why is this here?", the code has failed - whether or not it works.
Treat this as part of the definition of done, alongside "it compiles" and "it is
deployed". It is not polish to add later.

- **Comment the WHY and the RULE, never the WHAT.** The test: a good comment is still
  true after someone rewrites the implementation. If it only narrates the current
  lines, delete it.
- **Every business rule is stated in plain English beside the code enforcing it**, so a
  reviewer reads the rule and sees the code without inferring it from the logic. Say
  where the rule comes from (statute, contract, policy, a decision Chris made) and date it.
- **Non-obvious decisions record the road not taken** - what was rejected and why - so a
  later session doesn't "fix" a deliberate choice.
- **Anything surprising gets a WARNING comment** where someone would trip over it:
  load-bearing quirks, footguns, things that fail silently.
- **Files open with an orientation block** (what this file is, what it owns, what it
  deliberately does not do), and long files are split into labelled banner sections
  (`AUTH`, `SYNC ENGINE`, `AI RELAY`, `COST CONTROLS`). Matters most in `index.html`,
  which runs to thousands of lines by design.
- **Names are the documentation**; explicit over clever, always. Don't golf.
- **Dead code is deleted, not commented out.** Git remembers.

Guard the opposite failure just as hard: NOT a comment per line, NOT the code restated
in English, NOT ceremonial docblocks, NOT commit-message content in comments (who
changed what and when is git's job). Noise buries signal and teaches the reader to skip
comments, including the one that mattered. Restructure unclear code rather than
apologizing for it in a comment.

Full standard (the authority, read it):
`C:\Users\cjgra\Dropbox\My AI\CG Apps\Forever Apps\CODE-READABILITY-STANDARD.md`

## Pre-push audit gate (never bypass)
`git push` runs the shared checker `C:\Users\cjgra\portfolio-audit\portfolio_audit.py`
through `.git\hooks\pre-push`. Backend checks BLOCK the push; the frontend checks are
advisory (print-only) for now. Run it ad hoc any time with `--all`.

It exists because these specific failures actually happened:
- a model that was routed but had no price entry took PriorityCaptain's AI relay fully
  offline;
- a duplicate dict key made FitnessCaptain meter Sonnet 5 at Haiku's rate, so the budget
  breaker sailed past roughly 3x the real spend;
- a typo in a Railway numeric variable crash-loops a backend at import.

`--no-verify` is NOT an acceptable workaround - it is already against Chris's standing
rule. If the gate is wrong, fix the checker; don't push around it.

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
