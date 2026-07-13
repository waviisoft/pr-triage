import type {
  CheckRollup,
  Mergeable,
  NormalizedPR,
  ReviewDecision,
  ReviewRequest,
  ReviewState,
} from "../triage/types";

// Raw shapes returned by the GraphQL query in `queries.ts`. Loosely typed —
// this module is the single place that knows the wire format.

interface RawReviewer {
  __typename: "User" | "Team" | string;
  login?: string;
  name?: string;
}

export interface RawPR {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  updatedAt: string;
  author: { login: string } | null;
  repository: { nameWithOwner: string };
  mergeable: Mergeable;
  reviewDecision: ReviewDecision;
  reviewRequests: { nodes: { requestedReviewer: RawReviewer | null }[] };
  reviews: {
    nodes: {
      author: { login: string } | null;
      state: ReviewState;
      submittedAt: string | null;
    }[];
  };
  commits: {
    nodes: { commit: { statusCheckRollup: { state: CheckRollup } | null } }[];
  };
}

function mapReviewers(raw: RawPR): ReviewRequest[] {
  const out: ReviewRequest[] = [];
  for (const { requestedReviewer } of raw.reviewRequests.nodes) {
    if (!requestedReviewer) continue;
    if (requestedReviewer.__typename === "User" && requestedReviewer.login) {
      out.push({ type: "User", login: requestedReviewer.login });
    } else if (
      requestedReviewer.__typename === "Team" &&
      requestedReviewer.name
    ) {
      out.push({ type: "Team", login: requestedReviewer.name });
    }
  }
  return out;
}

/**
 * The viewer's own latest *decisive* review state. Per brief §2 we trust
 * GitHub's computed state for the blocking question, and use raw reviews only to
 * answer "did I review, and how?". Later `COMMENTED`/`PENDING` reviews do not
 * dismiss an earlier approval or change-request, so we ignore them here and take
 * the most recent `APPROVED`/`CHANGES_REQUESTED` the viewer left.
 */
function myLatestReviewState(
  raw: RawPR,
  viewerLogin: string,
): NormalizedPR["myReviewState"] {
  let latest: { state: "APPROVED" | "CHANGES_REQUESTED"; at: string } | null =
    null;
  for (const r of raw.reviews.nodes) {
    if (r.author?.login !== viewerLogin) continue;
    if (r.state !== "APPROVED" && r.state !== "CHANGES_REQUESTED") continue;
    const at = r.submittedAt ?? "";
    if (!latest || at >= latest.at) latest = { state: r.state, at };
  }
  return latest?.state ?? null;
}

/** Adapt one raw GraphQL PR node into the normalized shape `classify` expects. */
export function mapPR(raw: RawPR, viewerLogin: string): NormalizedPR {
  return {
    number: raw.number,
    title: raw.title,
    url: raw.url,
    isDraft: raw.isDraft,
    updatedAt: raw.updatedAt,
    authorLogin: raw.author?.login ?? "ghost",
    repository: raw.repository.nameWithOwner,
    mergeable: raw.mergeable,
    reviewDecision: raw.reviewDecision,
    statusCheckRollup:
      raw.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null,
    reviewRequests: mapReviewers(raw),
    myReviewState: myLatestReviewState(raw, viewerLogin),
    hasReviews: raw.reviews.nodes.length > 0,
  };
}
