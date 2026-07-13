import {
  Bucket,
  Group,
  type Classification,
  type Group as GroupT,
  type NormalizedPR,
} from "./types";

/**
 * Short, human-readable reason per group. Kept beside the rules so the meta
 * line in the UI and the tests share exactly one source of truth.
 */
const REASONS: Record<GroupT, string> = {
  [Group.DRAFT]: "Draft — finish it and mark ready",
  [Group.MERGE_CONFLICT]: "Merge conflict — resolve before it can merge",
  [Group.CI_FAILING]: "CI failing — fix the build",
  [Group.CHANGES_REQUESTED]: "Changes requested — address the feedback",
  [Group.READY_TO_MERGE]: "Approved — ready to merge",
  [Group.NO_REVIEWER]: "Ready, but no reviewer assigned — request one",
  [Group.REVIEW_REQUESTED]: "Your review is requested",
  [Group.AWAITING_REVIEW]: "Waiting on the reviewer",
  [Group.I_REQUESTED_CHANGES]: "You requested changes — waiting on the author",
  [Group.I_APPROVED]: "You approved — off your plate",
  [Group.UNCLAIMED]: "Unclaimed — no reviewer yet",
};

const hit = (bucket: Bucket, group: GroupT): Classification => ({
  bucket,
  group,
  reason: REASONS[group],
});

const EXCLUDED: Classification = {
  bucket: Bucket.EXCLUDED,
  group: null,
  reason: "",
};

/** Does the normalized request list include the viewer as an individual user? */
function viewerIsRequested(pr: NormalizedPR, viewerLogin: string): boolean {
  return pr.reviewRequests.some(
    (r) => r.type === "User" && r.login === viewerLogin,
  );
}

/**
 * Classify a single PR from the viewer's perspective. Pure, no network.
 *
 * The load-bearing insight (brief §2): we classify from GitHub's *computed*
 * `reviewDecision` + the current `reviewRequests` list, NOT by replaying review
 * events. When an author pushes fixes and re-requests review, GitHub flips
 * `reviewDecision` back to `REVIEW_REQUIRED` and re-adds the reviewer to
 * `reviewRequests`, so the "fixes pushed, back in reviewer's court" case falls
 * out of the `awaiting-review` rule for free — no special handling needed.
 */
export function classify(
  pr: NormalizedPR,
  viewerLogin: string,
): Classification {
  const mine = pr.authorLogin === viewerLogin;

  if (mine) {
    // Order matters: first match wins (brief §3).
    if (pr.isDraft) return hit(Bucket.NEEDS_ME, Group.DRAFT);
    if (pr.mergeable === "CONFLICTING")
      return hit(Bucket.NEEDS_ME, Group.MERGE_CONFLICT);
    if (pr.statusCheckRollup === "FAILURE")
      return hit(Bucket.NEEDS_ME, Group.CI_FAILING);
    if (pr.reviewDecision === "CHANGES_REQUESTED")
      return hit(Bucket.NEEDS_ME, Group.CHANGES_REQUESTED);
    if (pr.reviewDecision === "APPROVED")
      return hit(Bucket.NEEDS_ME, Group.READY_TO_MERGE);

    // reviewDecision is REVIEW_REQUIRED or null from here.
    if (pr.reviewRequests.length > 0)
      return hit(Bucket.WAITING, Group.AWAITING_REVIEW);
    return hit(Bucket.NEEDS_ME, Group.NO_REVIEWER);
  }

  // Not mine — someone else's PR.
  if (viewerIsRequested(pr, viewerLogin))
    return hit(Bucket.NEEDS_ME, Group.REVIEW_REQUESTED);

  // The viewer is not (re-)requested past this point.
  if (pr.myReviewState === "CHANGES_REQUESTED")
    return hit(Bucket.WAITING, Group.I_REQUESTED_CHANGES);
  if (pr.myReviewState === "APPROVED")
    return hit(Bucket.WAITING, Group.I_APPROVED);

  if (pr.isDraft) return EXCLUDED;

  if (!pr.hasReviews && pr.reviewRequests.length === 0)
    return hit(Bucket.PICK_UP, Group.UNCLAIMED);

  // Reviewer requested but not me, and I haven't reviewed — not my move.
  return EXCLUDED;
}
