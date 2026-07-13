// The two GraphQL queries from brief §4. GraphQL returns everything in one
// round-trip — crucially `reviewDecision` and the CI rollup — which REST cannot.

/**
 * Query A — every PR I'm involved in. Runs against GitHub's issue search, then
 * we classify client-side. `$q` is built by `client.ts` (e.g.
 * `is:pr is:open involves:@me org:waviisoft`).
 */
export const INVOLVED_QUERY = /* GraphQL */ `
  query Involved($q: String!, $after: String) {
    search(query: $q, type: ISSUE, first: 50, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on PullRequest {
          number
          title
          url
          isDraft
          updatedAt
          author {
            login
          }
          repository {
            nameWithOwner
          }
          mergeable
          reviewDecision
          reviewRequests(first: 20) {
            nodes {
              requestedReviewer {
                __typename
                ... on User {
                  login
                }
                ... on Team {
                  name
                }
              }
            }
          }
          reviews(last: 30) {
            nodes {
              author {
                login
              }
              state
              submittedAt
            }
          }
          commits(last: 1) {
            nodes {
              commit {
                statusCheckRollup {
                  state
                }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Query B — unclaimed reviews I could pick up. Uses the same PullRequest
 * selection as query A (shared fragment inlined for a self-contained string).
 * `review:none` = no reviews submitted; there is no "no reviewer requested"
 * qualifier, so `client.ts` filters `reviewRequests` empty in code.
 */
export const UNCLAIMED_QUERY = INVOLVED_QUERY;
