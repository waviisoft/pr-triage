// Detects which PRs have *changed* between two loads of the board, so the UI can
// highlight "what moved since your last refresh". Pure and network-free, like the
// rest of `triage/` — it works off the built `TriageView`, which already carries
// every field we compare, so no extra GitHub calls are needed.
//
// The trigger is a *triage move*: a PR is flagged when it changes bucket or group
// (e.g. "Waiting on others" → "Needs your attention"). That's the signal that
// actually matters for triage — a PR whose status is unchanged is noise, however
// many times GitHub bumps its `updatedAt`. The field-level deltas (CI, mergeable,
// review) are used only to *explain* the move in a short human reason.
//
// A PR that wasn't shown at all last time is reported as "new". PRs that fell off
// the board (now excluded/merged/closed) are intentionally ignored: we only ever
// annotate PRs that are currently on screen.

import { BUCKET_TITLE } from "./group";
import type { TriageView } from "./group";
import type {
  Bucket,
  CheckRollup,
  ClassifiedPR,
  Group,
  Mergeable,
  NormalizedPR,
  ReviewDecision,
  ReviewRequest,
} from "./types";

/** Stable identity for a PR across loads: `owner/name#123`. */
export function prKey(pr: Pick<NormalizedPR, "repository" | "number">): string {
  return `${pr.repository}#${pr.number}`;
}

/** Order-independent serialization of the requested-reviewer set, for cheap ===. */
function serializeRequests(reqs: ReviewRequest[]): string {
  return reqs
    .map((r) => `${r.type}:${r.login}`)
    .sort()
    .join(",");
}

/**
 * The slice of a PR's state we compare across loads: its triage placement
 * (bucket/group) plus the fields that can explain a move.
 */
export interface PrSnapshot {
  bucket: Bucket;
  group: Group | null;
  isDraft: boolean;
  mergeable: Mergeable;
  reviewDecision: ReviewDecision;
  statusCheckRollup: CheckRollup;
  /** Serialized requested-reviewer set (see `serializeRequests`). */
  reviewRequests: string;
  myReviewState: NormalizedPR["myReviewState"];
  hasReviews: boolean;
}

/** Keyed by `prKey`, one snapshot per PR shown in the view it was taken from. */
export type SnapshotMap = Map<string, PrSnapshot>;

function toSnapshot(item: ClassifiedPR): PrSnapshot {
  const { pr } = item;
  return {
    bucket: item.bucket,
    group: item.group,
    isDraft: pr.isDraft,
    mergeable: pr.mergeable,
    reviewDecision: pr.reviewDecision,
    statusCheckRollup: pr.statusCheckRollup,
    reviewRequests: serializeRequests(pr.reviewRequests),
    myReviewState: pr.myReviewState,
    hasReviews: pr.hasReviews,
  };
}

/** Snapshot every PR currently shown in `view`, keyed by `prKey`. */
export function snapshotView(view: TriageView): SnapshotMap {
  const map: SnapshotMap = new Map();
  for (const bucket of view.buckets)
    for (const section of bucket.groups)
      for (const item of section.prs) map.set(prKey(item.pr), toSnapshot(item));
  return map;
}

/** Why a PR is flagged: a fresh appearance, or a triage move (with a reason). */
export interface ChangeInfo {
  kind: "new" | "changed";
  /** Short human explanation, e.g. "CI now failing" or "Moved to Needs your attention". */
  reason: string;
}

/**
 * Build the short reason for a triage move by diffing the salient fields. Falls
 * back to naming the destination bucket when no single field cleanly explains it.
 */
function describeChange(prev: PrSnapshot, cur: PrSnapshot): string {
  const parts: string[] = [];

  if (prev.statusCheckRollup !== cur.statusCheckRollup) {
    if (cur.statusCheckRollup === "FAILURE" || cur.statusCheckRollup === "ERROR")
      parts.push("CI now failing");
    else if (cur.statusCheckRollup === "SUCCESS") parts.push("CI now passing");
    else if (cur.statusCheckRollup === "PENDING") parts.push("CI running");
  }

  if (prev.mergeable !== cur.mergeable) {
    if (cur.mergeable === "CONFLICTING") parts.push("now has conflicts");
    else if (cur.mergeable === "MERGEABLE" && prev.mergeable === "CONFLICTING")
      parts.push("conflicts resolved");
  }

  if (prev.reviewDecision !== cur.reviewDecision) {
    if (cur.reviewDecision === "APPROVED") parts.push("now approved");
    else if (cur.reviewDecision === "CHANGES_REQUESTED")
      parts.push("changes requested");
  }

  if (prev.isDraft && !cur.isDraft) parts.push("marked ready for review");
  else if (!prev.isDraft && cur.isDraft) parts.push("moved back to draft");

  if (prev.myReviewState !== cur.myReviewState) {
    if (cur.myReviewState === "APPROVED") parts.push("you approved");
    else if (cur.myReviewState === "CHANGES_REQUESTED")
      parts.push("you requested changes");
  }

  // A reviewer set change rarely tells the whole story on its own, so only lean
  // on it when nothing more specific fired.
  if (parts.length === 0 && prev.reviewRequests !== cur.reviewRequests)
    parts.push("reviewers changed");

  if (parts.length) return parts.join(" · ");
  // `cur.bucket` is always a visible bucket here (it came out of the view).
  return `Moved to ${BUCKET_TITLE[cur.bucket as keyof typeof BUCKET_TITLE]}`;
}

/**
 * Compare the current `view` against the snapshot from a previous load and return
 * a map (keyed by `prKey`) of every PR that is new or has moved triage group.
 *
 * `prev` is `null` on the first load / after a context switch (new scope or
 * token set), where there's no meaningful baseline — the result is then empty, so
 * nothing is highlighted until something actually changes.
 */
export function diffView(
  prev: SnapshotMap | null,
  view: TriageView,
): Map<string, ChangeInfo> {
  const changes = new Map<string, ChangeInfo>();
  if (!prev) return changes;

  for (const bucket of view.buckets)
    for (const section of bucket.groups)
      for (const item of section.prs) {
        const key = prKey(item.pr);
        const before = prev.get(key);
        const cur = toSnapshot(item);
        if (!before) {
          changes.set(key, { kind: "new", reason: "New since last refresh" });
        } else if (
          before.bucket !== cur.bucket ||
          before.group !== cur.group
        ) {
          changes.set(key, {
            kind: "changed",
            reason: describeChange(before, cur),
          });
        }
      }

  return changes;
}
