import type { NormalizedPR } from "../triage/types";
import { mapPR, type RawPR } from "./map";
import { CATALOG_QUERY, INVOLVED_QUERY } from "./queries";

const GRAPHQL_ENDPOINT = "https://api.github.com/graphql";
const TOKENS_KEY = "pr-triage:tokens";
const LEGACY_TOKEN_KEY = "pr-triage:token";
const MAX_PAGES = 10; // safety cap: up to 500 PRs per search

// ---------------------------------------------------------------------------
// Token handling — browser-only, localStorage. Never logged.
//
// Multiple labeled tokens are supported so the app can aggregate across GitHub
// accounts/orgs a single token can't span: a fine-grained PAT is locked to one
// resource owner, and some orgs forbid classic PATs entirely. One read-only
// token per owner, results merged, sidesteps both limits.
// ---------------------------------------------------------------------------

export interface TokenEntry {
  id: string;
  label: string;
  token: string;
}

function newId(): string {
  return crypto.randomUUID();
}

export function getTokens(): TokenEntry[] {
  try {
    const raw = localStorage.getItem(TOKENS_KEY);
    if (raw) return JSON.parse(raw) as TokenEntry[];
    // Migrate a single legacy token from the earlier single-token build.
    const legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
    if (legacy) {
      const migrated: TokenEntry[] = [
        { id: newId(), label: "default", token: legacy },
      ];
      localStorage.setItem(TOKENS_KEY, JSON.stringify(migrated));
      localStorage.removeItem(LEGACY_TOKEN_KEY);
      return migrated;
    }
  } catch {
    /* ignore malformed storage */
  }
  return [];
}

export function saveTokens(tokens: TokenEntry[]): void {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

/** Build a new token entry with a trimmed value and a fresh id. */
export function makeToken(label: string, token: string): TokenEntry {
  return { id: newId(), label: label.trim() || "token", token: token.trim() };
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

// ---------------------------------------------------------------------------
// Multi-token aggregation.
// ---------------------------------------------------------------------------

/** A per-token failure surfaced without failing the whole load. */
export interface TokenError {
  label: string;
  message: string;
}

/** Distinct repo owners a token can reach — the basis for its auto-label. */
export function ownersOf(catalog: Catalog): string[] {
  const owners = new Set<string>();
  for (const r of catalog.repos) owners.add(r.split("/")[0]);
  return [...owners].sort();
}

/**
 * A human label derived from what the token can actually reach: the single
 * owner it's scoped to (the common fine-grained case), else the account login.
 */
export function suggestLabel(catalog: Catalog): string {
  const owners = ownersOf(catalog);
  if (owners.length === 1) return owners[0];
  if (owners.length > 1) return `${catalog.login} · ${owners.length} owners`;
  return catalog.login;
}

/** Resolve the viewer login from the first token that answers. */
export async function resolveLogin(tokens: TokenEntry[]): Promise<string> {
  for (const t of tokens) {
    try {
      return await fetchViewerLogin(t.token);
    } catch {
      /* try the next token */
    }
  }
  throw new GitHubError("None of your saved tokens could reach GitHub.");
}

/**
 * Which tokens to query for a scope. When catalogs are known, route an org/repo
 * scope only to the tokens that can see that owner; otherwise (or if none match)
 * fall back to trying every token. "Everything" always uses all tokens.
 */
export function tokensForScope(
  scope: Scope,
  tokens: TokenEntry[],
  catalogs: Record<string, Catalog>,
): TokenEntry[] {
  if (scope.kind === "all") return tokens;
  const owner =
    scope.kind === "org" ? scope.value : scope.value.split("/")[0];
  const matched = tokens.filter((t) => {
    const c = catalogs[t.id];
    if (!c) return false;
    if (c.login === owner || c.orgs.includes(owner)) return true;
    return scope.kind === "repo" && c.repos.includes(scope.value);
  });
  return matched.length ? matched : tokens;
}

/**
 * Run the triage searches across several tokens and merge the deduped union by
 * `url`. A token that fails is recorded in `errors` rather than sinking the
 * whole load, so one broken/forbidden token can't blank the board.
 */
export async function fetchTriageForTokens(
  tokens: TokenEntry[],
  scope: Scope,
  viewerLogin: string,
): Promise<{ prs: NormalizedPR[]; errors: TokenError[] }> {
  const errors: TokenError[] = [];
  const lists = await Promise.all(
    tokens.map(async (t) => {
      try {
        return await fetchTriagePRs(t.token, scope, viewerLogin);
      } catch (e) {
        errors.push({
          label: t.label,
          message: e instanceof Error ? e.message : String(e),
        });
        return [] as NormalizedPR[];
      }
    }),
  );

  const byUrl = new Map<string, NormalizedPR>();
  for (const list of lists) {
    for (const pr of list) if (!byUrl.has(pr.url)) byUrl.set(pr.url, pr);
  }
  return { prs: [...byUrl.values()], errors };
}
