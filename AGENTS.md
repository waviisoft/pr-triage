# Agent guide

Context for AI agents (and humans) working in this repo. For the product itself,
see [README.md](README.md); for the token-handling model, [SECURITY.md](SECURITY.md).

## What this is

A fully static, zero-backend "whose move is it?" dashboard for GitHub pull
requests (React + Vite + TypeScript, deployed to GitHub Pages). Every request
goes straight from the browser to `api.github.com` with a token the user pastes;
nothing else leaves the browser. Keep that property — do not add a backend, a
proxy, analytics, or any third-party network call. The production CSP
(`vite.config.ts`) pins `connect-src` to GitHub's API on purpose.

## Layout

- `src/triage/` — the pure classifier (`classify.ts`) and view builder
  (`group.ts`). No imports from `github/`; exhaustively unit-tested.
- `src/github/` — the API client, GraphQL queries, and the raw→normalized adapter.
- `src/ui/` — React components and `theme.css`.
- `src/demo/` — demo-mode fixtures (see below).

## Checks

Run before committing UI or logic changes:

```
npm run typecheck && npm run lint && npm test
```

## Demo mode

`?demo` renders a sample board from local fixtures — no token, no network — so
the app can be tried and screenshotted. Entry point: the **View live demo**
button on the welcome page. The fixtures live in `src/demo/data.ts`
(`demoPRs()`), hand-authored to exercise every triage group, and run through the
real `classify`/`buildView` pipeline. `src/demo/data.test.ts` asserts every
group stays represented — keep it green when you touch the classifier or the
fixtures.

## Screenshots

`public/` holds screenshots used by the README and the welcome/no-token page
(`src/ui/WelcomePage.tsx`):

- `demo-light.png` / `demo-dark.png` — the full demo board (shown full-size in
  the welcome page's lightbox; linked from the README).
- `demo-hero-light.png` / `demo-hero-dark.png` — a cropped "peek" of the board
  top, embedded in the README (GitHub can't CSS-crop).
- `welcome-light.png` / `welcome-dark.png` — the full welcome page.

**If you make a substantial visual change to any UI that appears in these
screenshots — the board, rows, tiles, header, buckets, the welcome page, colors,
or theme tokens — regenerate them so the images match the shipped UI.** They're
part of the product's first impression; stale screenshots are a bug.

To regenerate:

```
npm run dev                         # serves http://localhost:5173/pr-triage/
npm i -D playwright-core            # once, if not already installed
node scripts/shoot-screenshots.mjs  # writes the four PNGs into public/
```

Chromium: the script uses Playwright's default browser, or set
`PW_CHROMIUM_PATH` to an existing Chromium binary. After regenerating, eyeball
the PNGs (light and dark) before committing.
