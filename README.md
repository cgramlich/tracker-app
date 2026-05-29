# Tracker

A personal and professional task tracker built on **GTD** (Getting Things Done)
and the **Eisenhower matrix**. Captures todos, ideas, projects, and goals in one
place. Solo, mobile-first, works offline.

It is a single self-contained `index.html`. No build step, no server. The page
is served free from GitHub Pages; your data lives in your own private GitHub repo.

---

## What it does

- **Four entities:** Todos, Ideas, Projects, Goals - each with its own view
- **GTD workflow:** Inbox -> Next -> Waiting -> Someday -> Done
- **Eisenhower matrix:** prioritize by urgent x important
- **Today view:** due-today + deferred-arrived + manually starred
- **Now / Focus:** one next action at a time
- **Weekly Review:** a lightweight guided checklist (the GTD keystone habit)
- **Capture:** one-tap quick-add, full manual forms, AI brain-dump, and photo OCR
- **Offline-first:** edits are cached locally and pushed to GitHub when online
- **Your data, your repo:** plain JSON files you can read, back up, or export

## Two repos (by design)

| Repo            | Visibility | Holds              | Why                                  |
|-----------------|------------|--------------------|--------------------------------------|
| `tracker-app`   | Public     | `index.html` only  | GitHub Pages serves it free          |
| `tracker-data`  | Private    | `data/*.json`      | Your actual data, reached only by token |

Data file layout (created automatically on first save):

```
data/todos.json
data/ideas.json
data/projects.json
data/goals.json
```

## Get started

1. Follow **SETUP.md** for the step-by-step GitHub setup (repos, Pages, token).
2. Open the Pages URL on your phone, add it to the Home Screen, launch it.
3. Enter your repo details and connect.
4. Read **MANUAL.md** to learn the day-to-day flow.

## A note on the API key

The brain-dump and photo features call the Anthropic API directly from the
browser. Your Claude API key is stored only in this device's local storage.
That is fine for a personal app on your own phone. Do not install this instance
anywhere other people can reach it. The app works fully without a key - you just
lose the two AI capture shortcuts.

## Tech

Single HTML file. React 18 + Babel Standalone from a CDN. GitHub Contents API for
sync (fine-grained PAT, Contents read/write). All logging is ASCII with bracketed
tags and visible in-app under Settings -> Diagnostics.
