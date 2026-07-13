# pr-triage

A **"whose move is it?"** dashboard for GitHub pull requests. It shows every open
PR you're involved in — across everything you can access, an org, or a single repo
— **grouped by whose court the ball is in**, rather than as one flat list.

GitHub's own `/pulls` view and search qualifiers can filter these sets but can't
express this grouping in a single view. That grouping is the whole point.

It's a **fully static site** — no backend, no serverless functions, no proxy.
Every request goes straight from your browser to `https://api.github.com/graphql`
using a read-only token you paste in. Nothing is sent anywhere else.

## The three buckets

- **Needs my attention** — the ball is in your court:
  - a merge conflict (blocks merge regardless of approvals — sorted to the top)
  - CI is failing on your PR
  - a reviewer requested changes on your PR (and hasn't been re-requested)
  - your PR is approved and ready to merge
  - your PR is ready but has **no reviewer assigned**
  - your drafts — finish and mark ready
  - someone else's PR where **your** review is requested
- **Waiting on others** — you've done your part:
  - your PR is green with a reviewer requested, awaiting their review (this also
    covers "pushed fixes and re-requested review" — see below)
  - someone else's PR where **you** requested changes (author's court)
  - someone else's PR you approved
- **Reviews to pick up** — non-draft PRs by other people with no reviewer and no
  reviews yet: unclaimed work you could grab. (Only shown when scoped to an org or
  repo.)

Within each group the most neglected PR (oldest `updatedAt`) surfaces first.

### The core insight

PRs are classified from GitHub's **computed `reviewDecision`** plus the current
requested-reviewers list — *not* by replaying individual review events. When you
push fixes and re-request review, GitHub flips `reviewDecision` from
`CHANGES_REQUESTED` back to `REVIEW_REQUIRED` and puts the reviewer back into the
request list, so such PRs correctly land in **Waiting → awaiting review** with no
special handling. The rules live in [`src/triage/classify.ts`](src/triage/classify.ts)
as a pure, exhaustively-tested function.

## Setup — create a token

1. Create a **fine-grained personal access token**:
   <https://github.com/settings/personal-access-tokens/new>
2. Scope it to the **org or repositories** you want to triage (or all your repos).
3. Grant only these read permissions — nothing more:
   - **Pull requests: Read**
   - **Metadata: Read** (required by GitHub for any repo access)
4. Open the app and paste the token. That's it.

**Your token stays in your browser.** It's kept in `localStorage`, sent only to
`api.github.com`, and never logged. Use **"Forget token"** in the header to clear
it at any time.

## Scope

Use the header switcher to point the dashboard at:

- **everything** accessible to you (all repos you're involved in),
- a specific **org** (e.g. `waviisoft`), or
- a single **repo** (e.g. `waviisoft/pr-triage`).

Your choice is remembered across refreshes. Theme (system / light / dark) is too —
"system" follows your OS setting live.

## Local development

```bash
npm install
npm run dev        # start the dev server
npm run lint       # ESLint (code-quality check)
npm test           # run the unit tests
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build locally
```

## Deploying to GitHub Pages

The included workflow ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml))
builds and deploys on every push to `main` using the official Pages actions.

1. In the repo settings, set **Settings → Pages → Build and deployment → Source**
   to **GitHub Actions**.
2. Push to `main`. The site publishes to
   `https://<org>.github.io/pr-triage/`.

The Vite `base` is set to `/pr-triage/` for project Pages. If you deploy to a
user/org root or a custom domain, build with `VITE_BASE=/ npm run build`. A
`.nojekyll` file ships at the site root so Pages serves everything as-is.

## Architecture

The rules are isolated from GitHub so they stay testable and reusable:

```
src/
  triage/      pure classification — no imports from github/, no network
    types.ts       Bucket / Group enums + the normalized PR shape
    classify.ts    classify(pr, viewer) — the rules, first-match-wins
    classify.test.ts
    group.ts       sort (oldest first) + group into the three buckets
  github/      the data layer (the only code that knows the GitHub wire format)
    queries.ts     the GraphQL query
    client.ts      token handling, fetch, pagination, merge + dedupe by url
    map.ts         raw GraphQL node -> normalized PR
  ui/          React components + theme.css design tokens (light/dark)
  main.tsx
```

Two searches feed the view: everything you're **involved** in (author, assignee,
commenter, mentioned, review-requested, reviewed-by — merged and deduped by URL),
plus **unclaimed** PRs to pick up. One GraphQL query returns `reviewDecision`, the
requested reviewers, the reviews, and the CI rollup in a single round-trip.

## License

MIT © WAVIISoft, LLC
