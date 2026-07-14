<div align="center">
  <img src="public/icon-512.png" alt="PR Triage" width="96" height="96" />
  <h1>pr-triage</h1>
  <p><strong>Whose move is it?</strong> — a triage board for your open GitHub pull requests.</p>
</div>

[![CI](https://github.com/waviisoft/pr-triage/actions/workflows/ci.yml/badge.svg)](https://github.com/waviisoft/pr-triage/actions/workflows/ci.yml)
[![Deploy](https://github.com/waviisoft/pr-triage/actions/workflows/deploy.yml/badge.svg)](https://github.com/waviisoft/pr-triage/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A **"whose move is it?"** dashboard for GitHub pull requests. It shows every open
PR you're involved in — across everything you can access, or narrowed to one or
more orgs and repos — **grouped by whose court the ball is in**, rather than as
one flat list.

GitHub's own `/pulls` view and search qualifiers can filter these sets but can't
express this grouping in a single view. That grouping is the whole point.

It's a **fully static site** — no backend, no serverless functions, no proxy.
Every request goes straight from your browser to `https://api.github.com/graphql`
using a read-only token you paste in. Nothing is sent anywhere else.

## See it in action

<div align="center">
  <a href="public/demo-light.png">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="public/demo-hero-dark.png" />
      <img
        alt="The PR Triage board: open pull requests grouped into Needs my attention, Waiting on others, and Reviews to pick up."
        src="public/demo-hero-light.png"
        width="860"
      />
    </picture>
  </a>
  <br />
  <sub>
    A peek at the board — see the full thing:
    <a href="public/demo-light.png">light</a> ·
    <a href="public/demo-dark.png">dark</a>.
  </sub>
</div>

No token handy? **[Try the live demo](https://waviisoft.github.io/pr-triage/?demo)** —
it runs entirely on built-in sample data (no token, no network, nothing leaves
your browser). Or open the app and hit **View live demo** on the welcome screen;
**Exit demo** drops you back to the real thing.

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
  - your PR with a reviewer requested, awaiting their review (this also covers
    "pushed fixes and re-requested review" — see below)
  - someone else's PR where **you** requested changes (author's court)
  - someone else's PR you approved
- **Reviews to pick up** — non-draft PRs by other people with no reviewer and no
  reviews yet: unclaimed work you could grab. (Only shown when scoped to an org or
  repo.)

Within each group the most neglected PR (oldest `updatedAt`) surfaces first.

### The core insight

PRs are classified from GitHub's **computed `reviewDecision`** plus the current
requested-reviewers list — *not* by replaying individual review events.

The subtlety that drives the rules: when a reviewer requests changes, you push
fixes, and re-request their review, GitHub **keeps `reviewDecision` as
`CHANGES_REQUESTED`** and simply adds the reviewer back to the request list. So
the request list is what decides whose court it's in — a **pending reviewer**
(initial request *or* a re-request after changes) means you're **waiting on
them**; `CHANGES_REQUESTED` only means "your move" when *no* reviewer is currently
requested. The rules live in
[`src/triage/classify.ts`](src/triage/classify.ts) as a pure, exhaustively-tested
function.

## Setup — create a token

1. Create a **fine-grained personal access token**:
   <https://github.com/settings/personal-access-tokens/new>
2. Set the **Resource owner** to the account or org whose PRs you want to triage,
   and select the repositories (or all of them).
3. Grant these read permissions:
   - **Pull requests: Read**
   - **Metadata: Read** (required by GitHub for any repo access)
   - **Commit statuses: Read** — *optional*, for the CI pass/fail dots. **Important
     caveat:** the CI rollup is the union of two GitHub systems, and a fine-grained
     PAT can only read one of them. **GitHub Actions** (and most modern CI) reports
     as **check runs**, which need a *Checks* permission — and GitHub does **not
     currently offer a Checks permission for fine-grained PATs** ([they disabled
     it](https://github.com/orgs/community/discussions/129512); there's no such
     entry to grant). So with any fine-grained token, Actions-based PRs show *no*
     dot, and only PRs using the legacy **Status API** (covered by *Commit statuses:
     Read*) light up. That's the usual reason one PR shows a status and the rest
     don't. **Actions** and **Workflows** don't help either — *Actions* reads
     workflow runs/artifacts (a different API from check runs) and *Workflows* is
     write access to the workflow files themselves; neither populates the CI rollup.
   - To get **GitHub Actions** CI dots, use a **classic PAT** instead (scope `repo`,
     or `public_repo` for public repos only) — classic tokens can still read check
     runs. Trade-off: classic PATs are broader in scope and some orgs block them
     entirely. The app works fine without any CI permission; the rollup is
     best-effort.
4. Open the app and paste the token. The app checks it, auto-labels it by the
   owner it can reach, and you're in.

**Your tokens stay in your browser.** They're kept in `localStorage`, sent only
to `api.github.com`, and never logged. Manage or remove them anytime from the
**⚙ → Manage tokens** menu. See [SECURITY.md](SECURITY.md) for the full handling
model.

### Triaging across several accounts or orgs

A **fine-grained PAT is scoped to a single resource owner** — one token can't
span your personal account *and* an org, and some orgs disable classic PATs
entirely. So to cover multiple owners, **add one read-only token per owner** from
**⚙ → Manage tokens**; the dashboard queries them all and **aggregates the
results into one board**, deduped by PR URL. Each token is auto-labeled by the
owner it reaches, and a failing token is flagged without blanking the rest.
Expand a token in the manager to **see exactly which repos it grants** — click
one to triage it.

If an org requires it, an org owner must **approve** your fine-grained token
(Org → Settings → Personal access tokens → Pending requests) before it can see
that org's repos.

## Scope

Change what you're triaging with the control under the title — the scope label
links to the matching page on GitHub, and the pencil beside it opens a picker to
switch between:

- **everything** accessible to you (across all your tokens),
- a specific **org** (e.g. `waviisoft`),
- a single **repo** (e.g. `waviisoft/pr-triage`), or
- **several orgs and repos at once** — add as many as you like and the board
  aggregates them into one view (deduped by PR URL).

Org/repo fields offer a **picklist of what your tokens can reach**. Pick one and
it applies immediately — there's no "Go"; add another to watch it too, and the ×
on a chip drops it. The scope lives in the **URL** (`?scope=…`, a comma-joined
list when you're watching several), so each browser tab holds its **own** filter
(open two tabs on different repos without them fighting) and a filtered view is
bookmarkable. Theme (system / light / dark) is remembered too — "system" follows
your OS setting live.

## Local development

Requires **Node 20.19+ or 22.12+** (Vite 8).

```bash
npm install
npm run dev        # start the dev server
npm run lint       # ESLint (code-quality check)
npm test           # run the unit tests
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build locally
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow.

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

The triage rules are isolated from GitHub so they stay pure and testable:

```
src/
  triage/      pure classification — no imports from github/, no network
    types.ts       Bucket / Group enums + the normalized PR shape
    classify.ts    classify(pr, viewer) — the rules, first-match-wins
    group.ts       sort (oldest first) + group into the three buckets
    *.test.ts      exhaustive table tests for the rules
  github/      the data layer (the only code that knows the GitHub wire format)
    queries.ts     the GraphQL query strings (involved PRs + accessible catalog)
    client.ts      labeled tokens, fetch, pagination, multi-token aggregation
    map.ts         raw GraphQL node -> the normalized PR shape
    *.test.ts      client aggregation + query tests
  ui/          React components + theme.css design tokens (light/dark)
  demo/        sample fixtures behind `?demo` (no token, no network)
  main.tsx     mounts <App/> and the footer
```

Per token, several GitHub searches feed the view — everything you're **involved**
in (author, assignee, commenter, mentioned, review-requested, reviewed-by) plus
**unclaimed** PRs to pick up — and the results are merged and deduped by URL
across all your tokens. One query returns `reviewDecision`, the requested
reviewers, the reviews, and the CI rollup per PR in a single round-trip.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and
our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) © WAVIISoft, LLC
