// GraphQL returns everything in one round-trip — crucially `reviewDecision` and
// the CI rollup — which REST cannot.

/**
 * Every PR I'm involved in. Runs against GitHub's issue search, then we classify
 * client-side. `$q` is built by `client.ts` (e.g.
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
 * Catalog — the orgs and repositories this token can actually reach. Used to
 * populate the scope picker so the user picks from a list instead of typing.
 * A fine-grained PAT only sees repos it is explicitly scoped to (and whose org
 * has approved it), so this list is also the honest answer to "why is repo X
 * showing nothing?" — if X isn't here, the token can't see it.
 */
export const CATALOG_QUERY = /* GraphQL */ `
  query Catalog($after: String) {
    viewer {
      login
      organizations(first: 100) {
        nodes { login }
      }
      repositories(
        first: 100
        after: $after
        affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]
        # ownerAffiliations defaults to [OWNER, COLLABORATOR], which silently
        # drops org-owned repos where the viewer is only a member. Include
        # ORGANIZATION_MEMBER so those appear in the scope picker.
        ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]
        orderBy: { field: PUSHED_AT, direction: DESC }
      ) {
        pageInfo { hasNextPage endCursor }
        nodes { nameWithOwner }
      }
    }
  }
`;
