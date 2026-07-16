import { describe, expect, it } from "vitest";
import { buildView } from "./group";
import { diffView, prKey, snapshotView } from "./changes";
import type { NormalizedPR } from "./types";

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

/** Snapshot the view built from `prs` — the baseline a later load diffs against. */
const snap = (prs: NormalizedPR[]) => snapshotView(buildView(prs, ME));
const diff = (prev: NormalizedPR[] | null, next: NormalizedPR[]) =>
  diffView(prev ? snap(prev) : null, buildView(next, ME));

describe("diffView", () => {
  it("returns nothing on the first load (null baseline)", () => {
    const changes = diff(null, [pr()]);
    expect(changes.size).toBe(0);
  });

  it("returns nothing when nothing moved", () => {
    const before = [pr({ number: 1, reviewRequests: [{ type: "User", login: "x" }] })];
    const changes = diff(before, [
      pr({ number: 1, reviewRequests: [{ type: "User", login: "x" }] }),
    ]);
    expect(changes.size).toBe(0);
  });

  it("flags a PR that moved buckets, with a field-derived reason", () => {
    // Waiting (awaiting review) → Needs me (CI failing).
    const before = [
      pr({ number: 7, reviewRequests: [{ type: "User", login: "x" }] }),
    ];
    const after = [pr({ number: 7, statusCheckRollup: "FAILURE" })];
    const changes = diff(before, after);
    const info = changes.get("waviisoft/pr-triage#7");
    expect(info?.kind).toBe("changed");
    expect(info?.reason).toContain("CI now failing");
  });

  it("marks a PR absent from the baseline as new", () => {
    const before = [pr({ number: 1 })];
    const after = [pr({ number: 1 }), pr({ number: 2, statusCheckRollup: "FAILURE" })];
    const changes = diff(before, after);
    expect(changes.get("waviisoft/pr-triage#2")?.kind).toBe("new");
    // The unchanged #1 is not flagged.
    expect(changes.has("waviisoft/pr-triage#1")).toBe(false);
  });

  it("ignores PRs that fell off the board entirely", () => {
    const before = [pr({ number: 1 }), pr({ number: 2 })];
    // #2 is gone from the new load — no entry, no crash.
    const changes = diff(before, [pr({ number: 1, statusCheckRollup: "FAILURE" })]);
    expect(changes.has("waviisoft/pr-triage#2")).toBe(false);
    // #1 moved (SUCCESS → FAILURE moves it into CI failing).
    expect(changes.get("waviisoft/pr-triage#1")?.kind).toBe("changed");
  });

  it("does not flag a same-bucket field change (trigger is the triage move)", () => {
    // Both loads land in Needs me / no-reviewer; only reviewers differ, which
    // does not move the group, so it is not flagged.
    const before = [pr({ number: 3, reviewDecision: null })];
    const after = [pr({ number: 3, reviewDecision: null, hasReviews: true })];
    expect(diff(before, after).size).toBe(0);
  });

  it("describes a conflict appearing", () => {
    const before = [pr({ number: 4 })];
    const after = [pr({ number: 4, mergeable: "CONFLICTING" })];
    expect(diff(before, after).get("waviisoft/pr-triage#4")?.reason).toContain(
      "now has conflicts",
    );
  });

  it("falls back to naming the destination bucket when no field explains the move", () => {
    // Draft → ready is explained ("marked ready for review"); use a viewer-review
    // transition that changes bucket to exercise the reason wording.
    const other = "author";
    const before = snapshotView(
      buildView([pr({ number: 9, authorLogin: other, myReviewState: "APPROVED" })], ME),
    );
    const after = buildView(
      [
        pr({
          number: 9,
          authorLogin: other,
          reviewRequests: [{ type: "User", login: ME }],
        }),
      ],
      ME,
    );
    const info = diffView(before, after).get("waviisoft/pr-triage#9");
    expect(info?.kind).toBe("changed");
    expect(info?.reason.length).toBeGreaterThan(0);
  });
});

describe("prKey", () => {
  it("combines repository and number", () => {
    expect(prKey({ repository: "o/n", number: 42 })).toBe("o/n#42");
  });
});
