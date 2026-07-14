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
  try {
    localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  } catch {
    /* storage may be unavailable (private mode / quota) — keep in-memory state */
  }
}

/** Build a new token entry with a trimmed value and a fresh id. */
export function makeToken(label: string, token: string): TokenEntry {
  return { id: newId(), label: label.trim() || "token", token: token.trim() };
}

// ---------------------------------------------------------------------------
// Scope + search-string construction.
// ---------------------------------------------------------------------------

/** A single concrete thing to triage: one org, or one owner/name repo. */
export type ScopeTarget =
  | { kind: "org"; value: string }
  | { kind: "repo"; value: string };

// A scope is either "everything accessible to you" or an explicit set of
// org/repo targets. The single-target `org`/`repo` kinds are kept as their own
// shapes (they're the common case, and they give the scope line a clean label
// and a direct GitHub link); `multi` carries two or more targets so the board
// can watch several repos and orgs at once.
export type Scope =
  | { kind: "all" }
  | { kind: "org"; value: string }
  | { kind: "repo"; value: string }
  | { kind: "multi"; targets: ScopeTarget[] };

/** Flatten any scope to its list of concrete targets ([] means "everything"). */
export function scopeTargets(scope: Scope): ScopeTarget[] {
  if (scope.kind === "all") return [];
  if (scope.kind === "multi") return scope.targets;
  return [{ kind: scope.kind, value: scope.value }];
}

/** The GitHub search qualifier for one target (e.g. `org:acme`, `repo:o/n`). */
function targetQualifier(t: ScopeTarget): string {
  return `${t.kind}:${t.value}`;
}

// A PR in an archived repository is inert — you can't merge, push to, or review
// into it — so it never belongs on the board. GitHub's search *includes*
// archived repos unless told otherwise, so every search carries `archived:false`.
const NOT_ARCHIVED = "archived:false";

/** The three "involved" searches for one qualifier (`involves` omits review roles). */
function involvedSearches(qualifier: string): string[] {
  return [
    `is:pr is:open ${NOT_ARCHIVED} involves:@me ${qualifier}`,
    `is:pr is:open ${NOT_ARCHIVED} review-requested:@me ${qualifier}`,
    `is:pr is:open ${NOT_ARCHIVED} reviewed-by:@me ${qualifier}`,
  ].map((q) => q.trim());
}

/**
 * Every search string to run for a scope. Each target contributes its three
 * "involved" searches plus one "unclaimed" (`review:none`) search; the results
 * are deduped by URL upstream, so targets that overlap can't double-count a PR.
 *
 * "Everything" (no targets) runs only the involved searches — an unscoped
 * `review:none` would sweep all of GitHub, which is neither useful nor bounded,
 * so "reviews to pick up" is only offered within an org or repo.
 *
 * Targets are searched independently rather than folded into one query with
 * several `org:`/`repo:` qualifiers: independent searches reuse the exact,
 * well-tested single-scope query shape and sidestep GitHub's limits on how many
 * qualifiers one search may carry.
 */
function searchesForScope(scope: Scope): string[] {
  const targets = scopeTargets(scope);
  if (!targets.length) return involvedSearches("");
  const out: string[] = [];
  for (const t of targets) {
    const q = targetQualifier(t);
    out.push(...involvedSearches(q));
    out.push(`is:pr is:open ${NOT_ARCHIVED} draft:false review:none ${q}`);
  }
  return out;
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
    // Both may be null when the token lacks the relevant permission.
    organizations?: { nodes: ({ login: string } | null)[] } | null;
    repositories?: {
      pageInfo: PageInfo;
      nodes: ({ nameWithOwner: string } | null)[];
    } | null;
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
  // A read-only fine-grained token often lacks permission for a *field* we
  // request — `statusCheckRollup`'s check-run half needs a Checks permission that
  // GitHub no longer offers for fine-grained PATs (so Actions CI is unreadable
  // without a classic PAT), and `viewer.organizations` needs org permissions.
  // GitHub reports those as field-level errors while still returning the rest of
  // the data. Treat errors as fatal ONLY when no usable data came back (e.g. an org
  // that forbids the token outright); otherwise use the partial data so a
  // correctly-scoped token still works, just without CI dots.
  if (body.data == null) {
    const messages = body.errors?.length
      ? [...new Set(body.errors.map((e) => e.message))]
      : [`GitHub returned no data (HTTP ${res.status}).`];
    throw new GitHubError(messages.join("; "));
  }
  return body;
}

/** Resolve the authenticated user's login (needed for client-side classify). */
async function fetchViewerLogin(token: string): Promise<string> {
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
    if (v.login) login = v.login;
    // `organizations` may be null when the token has no org permissions.
    for (const o of v.organizations?.nodes ?? [])
      if (o?.login) orgs.add(o.login);
    const repoConn = v.repositories;
    for (const r of repoConn?.nodes ?? [])
      if (r?.nameWithOwner) repos.push(r.nameWithOwner);

    if (!repoConn?.pageInfo?.hasNextPage) break;
    after = repoConn.pageInfo.endCursor;
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
 * Fetch the full deduped union of every search a scope implies (the involved
 * searches, plus the unclaimed search per target). Dedupe by `url`, since a PR
 * can surface in several searches — and, for multi-target scopes, in several
 * targets.
 */
async function fetchTriagePRs(
  token: string,
  scope: Scope,
  viewerLogin: string,
): Promise<NormalizedPR[]> {
  const searches = searchesForScope(scope);
  const results = await Promise.all(
    searches.map((q) => runSearch(token, q, viewerLogin)),
  );

  const byUrl = new Map<string, NormalizedPR>();
  for (const list of results) {
    for (const pr of list) upsertPR(byUrl, pr);
  }
  return [...byUrl.values()];
}

/**
 * Fold one PR into the deduped map, keyed by `url`. A PR can surface in several
 * searches and — across tokens — several times over, and the copies are NOT
 * interchangeable: everything is viewer-relative to the same user (so the review
 * fields agree), but the permission-sensitive fields differ by token. A
 * fine-grained PAT can't read check runs (GitHub grants it no Checks permission),
 * so its `statusCheckRollup` comes back `null`, while a classic PAT on the same PR
 * returns the real rollup. Keeping whichever copy we saw first would let that
 * null shadow the real status — so on a collision we merge, preferring the
 * informative value per field rather than blindly keeping the first.
 */
function upsertPR(byUrl: Map<string, NormalizedPR>, pr: NormalizedPR): void {
  const prev = byUrl.get(pr.url);
  if (!prev) {
    byUrl.set(pr.url, pr);
    return;
  }
  byUrl.set(pr.url, {
    ...prev,
    // A known rollup beats a null one, whichever copy carried it.
    statusCheckRollup: prev.statusCheckRollup ?? pr.statusCheckRollup,
    // Likewise a computed mergeability beats one GitHub hasn't resolved yet.
    mergeable: prev.mergeable !== "UNKNOWN" ? prev.mergeable : pr.mergeable,
  });
}

/** Any visible PR whose mergeability GitHub hasn't computed yet. */
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

/** Whether a token's catalog demonstrably reaches a single target's owner. */
function catalogReaches(c: Catalog, t: ScopeTarget): boolean {
  const owner = t.kind === "org" ? t.value : t.value.split("/")[0];
  if (c.orgs.includes(owner)) return true;
  return c.repos.some((r) => r === t.value || r.startsWith(`${owner}/`));
}

/**
 * Which tokens to query for a scope. When catalogs are known, route to the
 * tokens that can see at least one of the scope's targets; otherwise (or if none
 * match) fall back to trying every token. "Everything" always uses all tokens.
 */
export function tokensForScope(
  scope: Scope,
  tokens: TokenEntry[],
  catalogs: Record<string, Catalog>,
): TokenEntry[] {
  const targets = scopeTargets(scope);
  if (!targets.length) return tokens;
  // Match on what a token demonstrably reaches — an owner appearing among its
  // orgs or repos. We deliberately don't match on `catalog.login`: every one of
  // a user's tokens shares that login, so it would select all of them. When
  // nothing matches (or catalogs haven't loaded), fall back to trying them all.
  const matched = tokens.filter((t) => {
    const c = catalogs[t.id];
    if (!c) return false;
    return targets.some((tg) => catalogReaches(c, tg));
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
    for (const pr of list) upsertPR(byUrl, pr);
  }
  return { prs: [...byUrl.values()], errors };
}
