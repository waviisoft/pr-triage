# Contributing to pr-triage

Thanks for your interest in improving pr-triage! This is a small, dependency-lean
open-source project — contributions of all sizes are welcome.

## Getting started

Requires **Node 20.19+ or 22.12+** (Vite 8).

```bash
git clone https://github.com/waviisoft/pr-triage.git
cd pr-triage
npm install
npm run dev        # http://localhost:5173/pr-triage/
```

## Before you open a pull request

Please make sure the full gate passes locally — CI runs exactly the same checks:

```bash
npm run lint       # ESLint (flat config: typescript-eslint + react-hooks)
npm test           # Vitest unit tests
npm run build      # tsc type-check + production build
```

Then:

1. Branch off `main`.
2. Keep the change focused; add or update tests for behavior changes.
3. Write a clear PR description of **what** changed and **why** (there's a
   template). Small, single-purpose PRs are easiest to review.

## Project conventions

- **`src/triage/` is pure.** It must not import from `src/github/` or touch the
  network — it operates on a normalized PR shape (`github/map.ts` adapts GraphQL
  to it) and is exhaustively unit-tested. Keep the triage rules there.
- **`src/github/`** is the only place that knows the GitHub wire format.
- **`src/ui/`** holds the React components and `theme.css` design tokens. Style
  through the CSS custom properties (tokens) so light/dark both work; new GitHub
  URLs go through `src/ui/links.ts`.
- Match the surrounding code's style; ESLint enforces the rest. No formatter is
  configured — keep diffs minimal and consistent with neighbors.

## Scope of the project

pr-triage is intentionally a **fully static, zero-service** app (see the README).
Changes that would require a backend, serverless function, or proxy are out of
scope. Auth is a browser-held read-only PAT; everything runs client-side.

## Reporting bugs & requesting features

Use the issue templates. For anything security-related, please follow
[SECURITY.md](SECURITY.md) instead of opening a public issue.

By contributing, you agree that your contributions are licensed under the
project's [MIT License](LICENSE).
