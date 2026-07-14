import { describe, expect, it } from "vitest";
import { classify } from "./classify";
import { Bucket, Group, type NormalizedPR } from "./types";

const ME = "me";

/** Build a NormalizedPR with sensible defaults; override per case. */
function pr(overrides: Partial<NormalizedPR> = {}): NormalizedPR {
  return {
    number: 1,
    title: "A PR",
    url: "https://github.com/waviisoft/pr-triage/pull/1",
    isDraft: false,
    updatedAt: "2026-01-01T00:00:00Z",
    authorLogin: ME,
    repository: "waviisoft/pr-triage",
    mergeable: "MERGEABLE",
    reviewDecision: "REVIEW_REQUIRED",
    statusCheckRollup: "SUCCESS",
    reviewRequests: [],
    myReviewState: null,
    hasReviews: false,
    ...overrides,
  };
}

const user = (login: string) => ({ type: "User" as const, login });
const team = (name: string) => ({ type: "Team" as const, login: name });

describe("classify — my PRs (I'm the author)", () => {
  it("draft → Needs me / draft (outranks everything)", () => {
    const c = classify(
      pr({
        isDraft: true,
        mergeable: "CONFLICTING",
        statusCheckRollup: "FAILURE",
        reviewDecision: "CHANGES_REQUESTED",
      }),
      ME,
    );
    expect(c.bucket).toBe(Bucket.NEEDS_ME);
    expect(c.group).toBe(Group.DRAFT);
  });

  it("conflicting → Needs me / merge-conflict (outranks CI + review state)", () => {
    const c = classify(
      pr({
        mergeable: "CONFLICTING",
        statusCheckRollup: "FAILURE",
        reviewDecision: "CHANGES_REQUESTED",
      }),
      ME,
    );
    expect(c.bucket).toBe(Bucket.NEEDS_ME);
    expect(c.group).toBe(Group.MERGE_CONFLICT);
  });

  it("CI failure → Needs me / ci-failing (outranks review state)", () => {
    const c = classify(
      pr({ statusCheckRollup: "FAILURE", reviewDecision: "CHANGES_REQUESTED" }),
      ME,
    );
    expect(c.bucket).toBe(Bucket.NEEDS_ME);
    expect(c.group).toBe(Group.CI_FAILING);
  });

  it("changes requested → Needs me / changes-requested", () => {
    const c = classify(pr({ reviewDecision: "CHANGES_REQUESTED" }), ME);
    expect(c.bucket).toBe(Bucket.NEEDS_ME);
    expect(c.group).toBe(Group.CHANGES_REQUESTED);
  });

  it("approved → Needs me / ready-to-merge", () => {
    const c = classify(pr({ reviewDecision: "APPROVED" }), ME);
    expect(c.bucket).toBe(Bucket.NEEDS_ME);
    expect(c.group).toBe(Group.READY_TO_MERGE);
  });

  it("review required + reviewer requested → Waiting / awaiting-review", () => {
    const c = classify(
      pr({ reviewDecision: "REVIEW_REQUIRED", reviewRequests: [user("alice")] }),
      ME,
    );
    expect(c.bucket).toBe(Bucket.WAITING);
    expect(c.group).toBe(Group.AWAITING_REVIEW);
  });

  it("null decision + reviewer requested → Waiting / awaiting-review", () => {
    const c = classify(
      pr({ reviewDecision: null, reviewRequests: [team("backend")] }),
      ME,
    );
    expect(c.bucket).toBe(Bucket.WAITING);
    expect(c.group).toBe(Group.AWAITING_REVIEW);
  });

  it("review required + no reviewer → Needs me / no-reviewer", () => {
    const c = classify(
      pr({ reviewDecision: "REVIEW_REQUIRED", reviewRequests: [] }),
      ME,
    );
    expect(c.bucket).toBe(Bucket.NEEDS_ME);
    expect(c.group).toBe(Group.NO_REVIEWER);
  });

  it("null decision + no reviewer → Needs me / no-reviewer", () => {
    const c = classify(pr({ reviewDecision: null, reviewRequests: [] }), ME);
    expect(c.bucket).toBe(Bucket.NEEDS_ME);
    expect(c.group).toBe(Group.NO_REVIEWER);
  });

  // Pushing fixes + re-requesting must NOT read as "changes requested". If
  // GitHub flips the decision back to REVIEW_REQUIRED, the re-added reviewer
  // lands it in Waiting/awaiting-review.
  it("re-requested after pushing fixes (decision REVIEW_REQUIRED) → Waiting / awaiting-review", () => {
    const c = classify(
      pr({ reviewDecision: "REVIEW_REQUIRED", reviewRequests: [user("alice")] }),
      ME,
    );
    expect(c.bucket).toBe(Bucket.WAITING);
    expect(c.group).toBe(Group.AWAITING_REVIEW);
    expect(c.group).not.toBe(Group.CHANGES_REQUESTED);
  });

  // The real-world case: GitHub does NOT flip the decision — it stays
  // CHANGES_REQUESTED after you push fixes and re-request. The re-request
  // (reviewer back in reviewRequests) is what moves it to the reviewer's court.
  it("changes-requested but reviewer re-requested → Waiting / awaiting-review", () => {
    const c = classify(
      pr({
        reviewDecision: "CHANGES_REQUESTED",
        reviewRequests: [user("alice")],
      }),
      ME,
    );
    expect(c.bucket).toBe(Bucket.WAITING);
    expect(c.group).toBe(Group.AWAITING_REVIEW);
    expect(c.group).not.toBe(Group.CHANGES_REQUESTED);
  });

  it("changes-requested with NO pending reviewer → Needs me / changes-requested", () => {
    const c = classify(
      pr({ reviewDecision: "CHANGES_REQUESTED", reviewRequests: [] }),
      ME,
    );
    expect(c.bucket).toBe(Bucket.NEEDS_ME);
    expect(c.group).toBe(Group.CHANGES_REQUESTED);
  });
});

describe("classify — others' PRs (I'm a reviewer)", () => {
  const theirs = (overrides: Partial<NormalizedPR> = {}) =>
    pr({ authorLogin: "alice", ...overrides });

  it("my review requested → Needs me / review-requested", () => {
    const c = classify(theirs({ reviewRequests: [user(ME)] }), ME);
    expect(c.bucket).toBe(Bucket.NEEDS_ME);
    expect(c.group).toBe(Group.REVIEW_REQUESTED);
  });

  it("my review re-requested outranks my prior approval", () => {
    const c = classify(
      theirs({ reviewRequests: [user(ME)], myReviewState: "APPROVED" }),
      ME,
    );
    expect(c.group).toBe(Group.REVIEW_REQUESTED);
  });

  it("I requested changes, not re-requested → Waiting / i-requested-changes", () => {
    const c = classify(
      theirs({ myReviewState: "CHANGES_REQUESTED", hasReviews: true }),
      ME,
    );
    expect(c.bucket).toBe(Bucket.WAITING);
    expect(c.group).toBe(Group.I_REQUESTED_CHANGES);
  });

  it("I approved → Waiting / i-approved", () => {
    const c = classify(
      theirs({ myReviewState: "APPROVED", hasReviews: true }),
      ME,
    );
    expect(c.bucket).toBe(Bucket.WAITING);
    expect(c.group).toBe(Group.I_APPROVED);
  });

  it("draft I haven't touched → excluded (drafts excluded until ready)", () => {
    const c = classify(
      theirs({ isDraft: true, hasReviews: false, reviewRequests: [] }),
      ME,
    );
    expect(c.bucket).toBe(Bucket.EXCLUDED);
    expect(c.group).toBeNull();
  });

  it("no reviews + no reviewer → Pick up / unclaimed", () => {
    const c = classify(theirs({ hasReviews: false, reviewRequests: [] }), ME);
    expect(c.bucket).toBe(Bucket.PICK_UP);
    expect(c.group).toBe(Group.UNCLAIMED);
  });

  it("reviewer requested but not me, I haven't reviewed → excluded", () => {
    const c = classify(
      theirs({ reviewRequests: [user("bob")], hasReviews: false }),
      ME,
    );
    expect(c.bucket).toBe(Bucket.EXCLUDED);
  });

  it("someone else already reviewed, no request, not me → excluded (not unclaimed)", () => {
    const c = classify(
      theirs({ hasReviews: true, reviewRequests: [], myReviewState: null }),
      ME,
    );
    expect(c.bucket).toBe(Bucket.EXCLUDED);
  });

  it("a team is requested (not me individually) → not unclaimed", () => {
    const c = classify(
      theirs({ reviewRequests: [team("backend")], hasReviews: false }),
      ME,
    );
    expect(c.bucket).toBe(Bucket.EXCLUDED);
  });
});

describe("classify — reason strings", () => {
  it("attaches a non-empty reason for shown PRs and empty for excluded", () => {
    expect(classify(pr({ isDraft: true }), ME).reason).not.toBe("");
    expect(
      classify(pr({ authorLogin: "alice", isDraft: true }), ME).reason,
    ).toBe("");
  });
});
