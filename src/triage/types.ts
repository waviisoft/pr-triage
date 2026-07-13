// The triage domain model. This module has ZERO imports from `github/` — it
// operates on a normalized PR shape (see `github/map.ts` for the adapter) so the
// rules stay testable without any network and could ship as a standalone package.

/** Top-level section a PR lands in. `EXCLUDED` means "do not show". */
export const Bucket = {
  NEEDS_ME: "needs-me",
  WAITING: "waiting",
  PICK_UP: "pick-up",
  EXCLUDED: "excluded",
} as const;
export type Bucket = (typeof Bucket)[keyof typeof Bucket];

/** Fine-grained sub-group within a bucket. `null` when excluded. */
export const Group = {
  // Needs my attention
  DRAFT: "draft",
  MERGE_CONFLICT: "merge-conflict",
  CI_FAILING: "ci-failing",
  CHANGES_REQUESTED: "changes-requested",
  READY_TO_MERGE: "ready-to-merge",
  NO_REVIEWER: "no-reviewer",
  REVIEW_REQUESTED: "review-requested",
  // Waiting on others
  AWAITING_REVIEW: "awaiting-review",
  I_REQUESTED_CHANGES: "i-requested-changes",
  I_APPROVED: "i-approved",
  // Reviews to pick up
  UNCLAIMED: "unclaimed",
} as const;
export type Group = (typeof Group)[keyof typeof Group];

/** GitHub's async-computed mergeability. `UNKNOWN` = not yet computed. */
export type Mergeable = "MERGEABLE" | "CONFLICTING" | "UNKNOWN";

/** GitHub's computed review decision. `null` when the repo requires no review. */
export type ReviewDecision =
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "REVIEW_REQUIRED"
  | null;

/** Combined status-check rollup state for the head commit. */
export type CheckRollup =
  | "SUCCESS"
  | "FAILURE"
  | "PENDING"
  | "ERROR"
  | "EXPECTED"
  | null;

/** A single review's state, as returned by GraphQL. */
export type ReviewState =
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "COMMENTED"
  | "DISMISSED"
  | "PENDING";

/** A currently-requested reviewer. `login` holds the team name when a team. */
export interface ReviewRequest {
  type: "User" | "Team";
  login: string;
}

/**
 * The normalized PR shape the rules operate on. `github/map.ts` derives every
 * field from raw GraphQL; in particular `myReviewState` and `hasReviews` are
 * reductions of the `reviews` list (see that module).
 */
export interface NormalizedPR {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  /** ISO-8601 timestamp; used for the staleness sort (oldest first). */
  updatedAt: string;
  authorLogin: string;
  /** `owner/name`. */
  repository: string;
  mergeable: Mergeable;
  reviewDecision: ReviewDecision;
  statusCheckRollup: CheckRollup;
  /** Reviewers currently requested (users and teams). */
  reviewRequests: ReviewRequest[];
  /**
   * The viewer's own latest *decisive* review state — the most recent
   * `APPROVED` or `CHANGES_REQUESTED` they left, ignoring `COMMENTED`/`PENDING`.
   * `null` if the viewer has left no decisive review.
   */
  myReviewState: "APPROVED" | "CHANGES_REQUESTED" | null;
  /** Whether anyone has submitted any review (drives the `unclaimed` rule). */
  hasReviews: boolean;
}

/** The result of classifying one PR. */
export interface Classification {
  bucket: Bucket;
  /** `null` only when `bucket === EXCLUDED`. */
  group: Group | null;
  /** Short human-readable explanation for the row's meta line. */
  reason: string;
}

/** A PR paired with its classification, ready for the view. */
export interface ClassifiedPR extends Classification {
  pr: NormalizedPR;
  /** True when the viewer authored the PR (surfaces the "you" tag). */
  mine: boolean;
}
