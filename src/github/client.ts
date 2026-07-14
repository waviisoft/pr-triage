import type { NormalizedPR } from "../triage/types";
import { mapPR, type RawPR } from "./map";
import { CATALOG_QUERY, INVOLVED_QUERY } from "./queries";

const GRAPHQL_ENDPOINT = "https://api.github.com/graphql";
const TOKEN_KEY = "pr-triage:token";
const MAX_PAGES = 10; // safety cap: up to 500 PRs per search

// ---------------------------------------------------------------------------
// Token handling — browser-only, localStorage. Never logged (brief §5).
// ---------------------------------------------------------------------------

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token.trim());
}

export function forgetToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ---------------------------------------------------------------------------
// Scope + search-string construction (brief §4).
// ---------------------------------------------------------------------------

export type Scope =
  | { kind: "all" }
  | { kind: "org"; value: string }
  | { kind: "repo"; value: string };

/** The org/repo qualifier for a scope; empty for "everything accessible to me". */
export function scopeQualifier(scope: Scope): string {
  if (scope.kind === "org") return `org:${scope.value}`;
  if (scope.kind === "repo") return `repo:${scope.value}`;
  return "";
}

/** Query A: the three "involved" searches (`involves` omits review roles). */
function involvedSearches(scope: Scope): string[] {
  const s = scopeQualifier(scope);
  return [
    `is:pr is:open involves:@me ${s}`,
    `is:pr is:open review-requested:@me ${s}`,
    `is:pr is:open reviewed-by:@me ${s}`,
  ].map((q) => q.trim());
}

/**
 * Query B: non-draft, no-review PRs; `reviewRequests` is filtered in code.
 * Returns `null` for the "all" scope — an unscoped `review:none` search would
 * sweep all of GitHub, which is neither useful nor bounded, so "reviews to pick
 * up" is only offered within an org or repo.
 */
function unclaimedSearch(scope: Scope): string | null {
  if (scope.kind === "all") return null;
  return `is:pr is:open draft:false review:none ${scopeQualifier(scope)}`;
}

// ---------------------------------------------------------------------------
// Low-level GraphQL request.
// ---------------------------------------------------------------------------

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface SearchData {
  search?: {
    pageInfo: PageInfo;
    nodes: (RawPR | Record<string, never>)[];
  };
}

interface ViewerData {
  viewer?: { login: string };
}

interface CatalogData {
  viewer?: {
    login: string;
    organizations: { nodes: ({ login: string } | null)[] };
    repositories: {
      pageInfo: PageInfo;
      nodes: ({ nameWithOwner: string } | null)[];
    };
  };
}

interface GqlResponse<D> {
  data?: D;
  errors?: { message: string }[];
}

async function graphql<D>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<GqlResponse<D>> {
  let res: Response;
  try {
    res = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new GitHubError(
      "Network error reaching api.github.com — check your connection.",
    );
  }

  if (res.status === 401)
    throw new GitHubError(
      "GitHub rejected the token (401). It may be invalid or expired.",
      401,
    );
  if (res.status === 403)
    throw new GitHubError(
      "Forbidden (403) — the token may lack the required permissions or you hit a rate limit.",
      403,
    );
  if (!res.ok)
    throw new GitHubError(`GitHub returned HTTP ${res.status}.`, res.status);

  const body = (await res.json()) as GqlResponse<D>;
  if (body.errors?.length)
    throw new GitHubError(body.errors.map((e) => e.message).join("; "));
  return body;
}

/** Resolve the authenticated user's login (needed for client-side classify). */
export async function fetchViewerLogin(token: string): Promise<string> {
  const body = await graphql<ViewerData>(token, `query { viewer { login } }`, {});
  const login = body.data?.viewer?.login;
  if (!login) throw new GitHubError("Could not resolve the viewer login.");
  return login;
}

/** The orgs and repositories a token can reach — powers the scope picker. */
export interface Catalog {
  login: string;
  orgs: string[];
  repos: string[];
}

/**
 * List the orgs and repos this token can actually see. A fine-grained PAT only
 * returns repos it is scoped to (and whose org approved it), so this is both the
 * scope picker's source and the diagnosis for "repo X shows nothing": if X is
 * absent here, the token cannot see it.
 */
export async function fetchCatalog(token: string): Promise<Catalog> {
  const orgs = new Set<string>();
  const repos: string[] = [];
  let login = "";
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const body: GqlResponse<CatalogData> = await graphql<CatalogData>(
      token,
      CATALOG_QUERY,
      { after },
    );
    const v = body.data?.viewer;
    if (!v) break;
    login = v.login;
    for (const o of v.organizations.nodes) if (o?.login) orgs.add(o.login);
    for (const r of v.repositories.nodes)
      if (r?.nameWithOwner) repos.push(r.nameWithOwner);

    if (!v.repositories.pageInfo.hasNextPage) break;
    after = v.repositories.pageInfo.endCursor;
  }

  return { login, orgs: [...orgs].sort(), repos };
}

/** Page through one search query, mapping every PR node as we go. */
async function runSearch(
  token: string,
  q: string,
  viewerLogin: string,
): Promise<NormalizedPR[]> {
  const out: NormalizedPR[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const body: GqlResponse<SearchData> = await graphql<SearchData>(
      token,
      INVOLVED_QUERY,
      { q, after },
    );
    const search = body.data?.search;
    if (!search) break;

    for (const node of search.nodes) {
      // Non-PR issue nodes come back as `{}` (no `number`); skip them.
      if (node && typeof (node as RawPR).number === "number") {
        out.push(mapPR(node as RawPR, viewerLogin));
      }
    }

    if (!search.pageInfo.hasNextPage || !search.pageInfo.endCursor) break;
    after = search.pageInfo.endCursor;
  }

  return out;
}

/**
 * Fetch the full deduped union of query A (three involved searches) and query B
 * (unclaimed). Dedupe by `url`, since a PR can surface in several searches.
 */
export async function fetchTriagePRs(
  token: string,
  scope: Scope,
  viewerLogin: string,
): Promise<NormalizedPR[]> {
  const unclaimed = unclaimedSearch(scope);
  const searches = [
    ...involvedSearches(scope),
    ...(unclaimed ? [unclaimed] : []),
  ];
  const results = await Promise.all(
    searches.map((q) => runSearch(token, q, viewerLogin)),
  );

  const byUrl = new Map<string, NormalizedPR>();
  for (const list of results) {
    for (const pr of list) {
      if (!byUrl.has(pr.url)) byUrl.set(pr.url, pr);
    }
  }
  return [...byUrl.values()];
}

/** Any visible PR whose mergeability GitHub hasn't computed yet (brief §4). */
export function hasPendingMergeable(prs: NormalizedPR[]): boolean {
  return prs.some((pr) => pr.mergeable === "UNKNOWN");
}
