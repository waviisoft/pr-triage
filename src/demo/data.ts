// Demo mode — a self-contained sample board so the app can be shown off (and
// screenshotted) without a token or any network. The data is a set of
// hand-authored `NormalizedPR`s chosen to exercise every triage group, run
// through the exact same `classify`/`buildView` pipeline as real data. It never
// touches `github/` beyond the shared `Scope` type.

import type { Scope } from "../github/client";
import type { NormalizedPR } from "../triage/types";

/** The login the demo board is "viewed as". Your PRs earn the "you" tag. */
export const DEMO_VIEWER = "you";

/**
 * The demo pretends to be scoped to one org. "Reviews to pick up" only makes
 * sense within an org/repo (an unscoped `review:none` would sweep all of
 * GitHub), so a scoped demo is what populates that third bucket.
 */
export const DEMO_SCOPE: Scope = { kind: "org", value: "acme" };

/** Query-string flag that turns the board into the sample view. */
const DEMO_PARAM = "demo";

/** Is the demo requested by the current URL (`?demo`)? */
export function demoRequested(search: string = window.location.search): boolean {
  const v = new URLSearchParams(search).get(DEMO_PARAM);
  return v !== null && v !== "0" && v !== "false";
}

/** Add or remove `?demo` from the address bar without reloading the page. */
export function setDemoParam(on: boolean): void {
  const url = new URL(window.location.href);
  if (on) url.searchParams.set(DEMO_PARAM, "1");
  else url.searchParams.delete(DEMO_PARAM);
  window.history.replaceState(null, "", url);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Fill the unremarkable fields so each sample below states only what matters. */
function pr(
  p: Pick<
    NormalizedPR,
    "number" | "title" | "authorLogin" | "repository" | "updatedAt"
  > &
    Partial<NormalizedPR>,
): NormalizedPR {
  return {
    isDraft: false,
    mergeable: "MERGEABLE",
    reviewDecision: null,
    statusCheckRollup: "SUCCESS",
    reviewRequests: [],
    myReviewState: null,
    hasReviews: false,
    url: `https://github.com/${p.repository}/pull/${p.number}`,
    ...p,
  };
}

/**
 * The sample PRs, timestamped relative to `now` so the "3h ago" labels stay
 * fresh whenever the demo is opened. Every group in the board is represented so
 * a screenshot shows the whole classifier at work.
 */
export function demoPRs(now: number = Date.now()): NormalizedPR[] {
  const ago = (ms: number) => new Date(now - ms).toISOString();
  const me = DEMO_VIEWER;

  return [
    // ---- Needs my attention ------------------------------------------------
    pr({
      number: 412,
      title: "Add rate limiting to the public search endpoint",
      authorLogin: me,
      repository: "acme/api",
      updatedAt: ago(2 * DAY),
      mergeable: "CONFLICTING",
      reviewDecision: "REVIEW_REQUIRED",
      reviewRequests: [{ type: "User", login: "priya" }],
    }),
    pr({
      number: 388,
      title: "Migrate the settings page to the new form primitives",
      authorLogin: me,
      repository: "acme/web",
      updatedAt: ago(5 * HOUR),
      statusCheckRollup: "FAILURE",
      reviewDecision: "REVIEW_REQUIRED",
      reviewRequests: [{ type: "User", login: "sam" }],
    }),
    pr({
      number: 401,
      title: "Debounce the org switcher search input",
      authorLogin: me,
      repository: "acme/web",
      updatedAt: ago(28 * HOUR),
      reviewDecision: "CHANGES_REQUESTED",
    }),
    pr({
      number: 77,
      title: "Introduce a Tooltip component",
      authorLogin: "leo",
      repository: "acme/design-system",
      updatedAt: ago(3 * HOUR),
      reviewDecision: "REVIEW_REQUIRED",
      reviewRequests: [{ type: "User", login: me }],
    }),
    pr({
      number: 420,
      title: "Cache persisted GraphQL queries at the edge",
      authorLogin: "wei",
      repository: "acme/api",
      updatedAt: ago(35 * MINUTE),
      statusCheckRollup: "PENDING",
      reviewDecision: "REVIEW_REQUIRED",
      reviewRequests: [
        { type: "User", login: me },
        { type: "Team", login: "backend" },
      ],
    }),
    pr({
      number: 256,
      title: "Fix crash when opening a deep link while logged out",
      authorLogin: me,
      repository: "acme/mobile",
      updatedAt: ago(6 * HOUR),
      reviewDecision: "APPROVED",
      hasReviews: true,
    }),
    pr({
      number: 145,
      title: "Pin the CI runner image to a digest",
      authorLogin: me,
      repository: "acme/infra",
      updatedAt: ago(4 * HOUR),
    }),
    pr({
      number: 405,
      title: "Dark-mode polish for the triage board",
      authorLogin: me,
      repository: "acme/web",
      updatedAt: ago(40 * MINUTE),
      isDraft: true,
      statusCheckRollup: "PENDING",
    }),

    // ---- Waiting on others -------------------------------------------------
    pr({
      number: 398,
      title: "Split the auth service into its own package",
      authorLogin: me,
      repository: "acme/api",
      updatedAt: ago(2 * DAY + 3 * HOUR),
      reviewDecision: "REVIEW_REQUIRED",
      reviewRequests: [{ type: "User", login: "priya" }],
    }),
    // Pushed fixes and re-requested: GitHub keeps reviewDecision at
    // CHANGES_REQUESTED but re-adds the reviewer, so the ball is back in their
    // court — this is the subtlety the whole classifier is built around.
    pr({
      number: 402,
      title: "Add keyboard shortcuts to the command palette",
      authorLogin: me,
      repository: "acme/web",
      updatedAt: ago(8 * HOUR),
      reviewDecision: "CHANGES_REQUESTED",
      reviewRequests: [{ type: "User", login: "dana" }],
      hasReviews: true,
    }),
    pr({
      number: 240,
      title: "Rework the onboarding carousel",
      authorLogin: "marcus",
      repository: "acme/mobile",
      updatedAt: ago(30 * HOUR),
      statusCheckRollup: "FAILURE",
      reviewDecision: "CHANGES_REQUESTED",
      myReviewState: "CHANGES_REQUESTED",
      hasReviews: true,
    }),
    pr({
      number: 395,
      title: "Add pagination to the audit log API",
      authorLogin: "priya",
      repository: "acme/api",
      updatedAt: ago(5 * HOUR),
      reviewDecision: "APPROVED",
      myReviewState: "APPROVED",
      hasReviews: true,
    }),

    // ---- Reviews to pick up ------------------------------------------------
    pr({
      number: 410,
      title: "Remove the legacy feature-flag shim",
      authorLogin: "sam",
      repository: "acme/web",
      updatedAt: ago(3 * DAY),
    }),
    pr({
      number: 80,
      title: "Document the spacing scale",
      authorLogin: "dana",
      repository: "acme/design-system",
      updatedAt: ago(7 * HOUR),
      statusCheckRollup: null,
    }),
  ];
}
