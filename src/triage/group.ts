import { classify } from "./classify";
import {
  Bucket,
  Group,
  type ClassifiedPR,
  type Group as GroupT,
  type NormalizedPR,
} from "./types";

/** Human titles for the three visible buckets. */
export const BUCKET_TITLE: Record<
  Exclude<Bucket, typeof Bucket.EXCLUDED>,
  string
> = {
  [Bucket.NEEDS_ME]: "Needs my attention",
  [Bucket.WAITING]: "Waiting on others",
  [Bucket.PICK_UP]: "Reviews to pick up",
};

/** Small uppercase sub-group labels. */
export const GROUP_LABEL: Record<GroupT, string> = {
  [Group.MERGE_CONFLICT]: "Merge conflicts",
  [Group.CI_FAILING]: "CI failing",
  [Group.CHANGES_REQUESTED]: "A reviewer requested changes",
  [Group.REVIEW_REQUESTED]: "Your review is requested",
  [Group.READY_TO_MERGE]: "Approved — ready to merge",
  [Group.NO_REVIEWER]: "Ready, but no reviewer assigned",
  [Group.DRAFT]: "Your drafts",
  [Group.AWAITING_REVIEW]: "Awaiting review",
  [Group.I_REQUESTED_CHANGES]: "You requested changes",
  [Group.I_APPROVED]: "You approved",
  [Group.UNCLAIMED]: "Unclaimed — up for grabs",
};

/**
 * Display order of groups within each bucket. A merge conflict blocks merge
 * regardless of approvals, so it outranks review state and sits at the top of
 * "Needs my attention".
 */
const GROUP_ORDER: Record<
  Exclude<Bucket, typeof Bucket.EXCLUDED>,
  GroupT[]
> = {
  [Bucket.NEEDS_ME]: [
    Group.MERGE_CONFLICT,
    Group.CI_FAILING,
    Group.CHANGES_REQUESTED,
    Group.REVIEW_REQUESTED,
    Group.READY_TO_MERGE,
    Group.NO_REVIEWER,
    Group.DRAFT,
  ],
  [Bucket.WAITING]: [
    Group.AWAITING_REVIEW,
    Group.I_REQUESTED_CHANGES,
    Group.I_APPROVED,
  ],
  [Bucket.PICK_UP]: [Group.UNCLAIMED],
};

const VISIBLE_BUCKETS = [
  Bucket.NEEDS_ME,
  Bucket.WAITING,
  Bucket.PICK_UP,
] as const;

export interface GroupSection {
  group: GroupT;
  label: string;
  prs: ClassifiedPR[];
}

export interface BucketView {
  bucket: (typeof VISIBLE_BUCKETS)[number];
  title: string;
  count: number;
  groups: GroupSection[];
}

export interface TriageView {
  buckets: BucketView[];
  counts: {
    needsMe: number;
    waiting: number;
    pickUp: number;
    /** Every open PR in the deduped universe (including ones not shown). */
    openTotal: number;
  };
}

/** Oldest `updatedAt` first, so the most neglected PR surfaces at the top. */
function byStaleness(a: ClassifiedPR, b: ClassifiedPR): number {
  return a.pr.updatedAt < b.pr.updatedAt
    ? -1
    : a.pr.updatedAt > b.pr.updatedAt
      ? 1
      : 0;
}

/**
 * Classify every PR and assemble the grouped, sorted view. `prs` should be the
 * fully deduped union of query A and query B.
 */
export function buildView(
  prs: NormalizedPR[],
  viewerLogin: string,
): TriageView {
  const classified: ClassifiedPR[] = prs.map((pr) => {
    const c = classify(pr, viewerLogin);
    return { ...c, pr, mine: pr.authorLogin === viewerLogin };
  });

  const buckets: BucketView[] = VISIBLE_BUCKETS.map((bucket) => {
    const inBucket = classified.filter((c) => c.bucket === bucket);
    const groups: GroupSection[] = GROUP_ORDER[bucket]
      .map((group) => ({
        group,
        label: GROUP_LABEL[group],
        prs: inBucket.filter((c) => c.group === group).sort(byStaleness),
      }))
      .filter((section) => section.prs.length > 0);

    return {
      bucket,
      title: BUCKET_TITLE[bucket],
      count: inBucket.length,
      groups,
    };
  });

  const countFor = (b: Bucket) =>
    classified.filter((c) => c.bucket === b).length;

  return {
    buckets,
    counts: {
      needsMe: countFor(Bucket.NEEDS_ME),
      waiting: countFor(Bucket.WAITING),
      pickUp: countFor(Bucket.PICK_UP),
      openTotal: classified.length,
    },
  };
}
