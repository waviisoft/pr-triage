import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchTriageForTokens,
  ownersOf,
  scopeTargets,
  suggestLabel,
  tokensForScope,
  type Catalog,
  type TokenEntry,
} from "./client";

const cat = (login: string, orgs: string[], repos: string[]): Catalog => ({
  login,
  orgs,
  repos,
});

describe("ownersOf", () => {
  it("returns distinct repo owners, sorted", () => {
    expect(ownersOf(cat("me", [], ["b/x", "a/y", "b/z"]))).toEqual(["a", "b"]);
  });
  it("is empty when the token sees no repos", () => {
    expect(ownersOf(cat("me", ["someorg"], []))).toEqual([]);
  });
});

describe("suggestLabel (auto-label from the token's scoped owner)", () => {
  it("single owner → that owner", () => {
    expect(suggestLabel(cat("me", [], ["shuffletix/jotit", "shuffletix/web"]))).toBe(
      "shuffletix",
    );
  });
  it("multiple owners → login + count", () => {
    expect(suggestLabel(cat("andy", [], ["andy/a", "acme/b"]))).toBe(
      "andy · 2 owners",
    );
  });
  it("no visible repos → the account login", () => {
    expect(suggestLabel(cat("andy", ["acme"], []))).toBe("andy");
  });
});

describe("scopeTargets", () => {
  it("'everything' flattens to no targets", () => {
    expect(scopeTargets({ kind: "all" })).toEqual([]);
  });
  it("a single org/repo flattens to one target", () => {
    expect(scopeTargets({ kind: "org", value: "acme" })).toEqual([
      { kind: "org", value: "acme" },
    ]);
    expect(scopeTargets({ kind: "repo", value: "o/n" })).toEqual([
      { kind: "repo", value: "o/n" },
    ]);
  });
  it("a multi scope returns its targets", () => {
    const targets = [
      { kind: "org", value: "acme" } as const,
      { kind: "repo", value: "o/n" } as const,
    ];
    expect(scopeTargets({ kind: "multi", targets })).toEqual(targets);
  });
});

describe("tokensForScope (routing)", () => {
  const A: TokenEntry = { id: "A", label: "a", token: "ta" };
  const B: TokenEntry = { id: "B", label: "b", token: "tb" };
  const catalogs = {
    A: cat("me", ["waviisoft"], ["waviisoft/site", "me/a"]),
    B: cat("me", ["shuffletix"], ["shuffletix/jotit"]),
  };

  it("'everything' uses all tokens", () => {
    expect(tokensForScope({ kind: "all" }, [A, B], catalogs)).toEqual([A, B]);
  });
  it("org routes to the token that can see it", () => {
    expect(
      tokensForScope({ kind: "org", value: "shuffletix" }, [A, B], catalogs),
    ).toEqual([B]);
  });
  it("repo routes by exact repo or its owner", () => {
    expect(
      tokensForScope({ kind: "repo", value: "shuffletix/jotit" }, [A, B], catalogs),
    ).toEqual([B]);
    expect(
      tokensForScope({ kind: "repo", value: "me/a" }, [A, B], catalogs),
    ).toEqual([A]);
  });
  it("does NOT over-match on the shared account login", () => {
    // Both tokens share login "me"; a personal repo must not select both.
    const picked = tokensForScope({ kind: "repo", value: "me/a" }, [A, B], catalogs);
    expect(picked).toEqual([A]);
  });
  it("falls back to all tokens when nothing matches or catalogs are unknown", () => {
    expect(
      tokensForScope({ kind: "org", value: "nope" }, [A, B], catalogs),
    ).toEqual([A, B]);
    expect(tokensForScope({ kind: "repo", value: "x/y" }, [A, B], {})).toEqual([
      A,
      B,
    ]);
  });
  it("a multi scope routes to every token that reaches any target", () => {
    // waviisoft → A, shuffletix → B: a scope covering both needs both tokens.
    expect(
      tokensForScope(
        {
          kind: "multi",
          targets: [
            { kind: "org", value: "waviisoft" },
            { kind: "repo", value: "shuffletix/jotit" },
          ],
        },
        [A, B],
        catalogs,
      ),
    ).toEqual([A, B]);
    // A multi scope where only one target is reachable routes to just that token.
    expect(
      tokensForScope(
        {
          kind: "multi",
          targets: [
            { kind: "org", value: "waviisoft" },
            { kind: "org", value: "unreachable" },
          ],
        },
        [A, B],
        catalogs,
      ),
    ).toEqual([A]);
  });
});

describe("fetchTriageForTokens (aggregation)", () => {
  afterEach(() => vi.unstubAllGlobals());

  const node = (slug: string) => ({
    number: 1,
    title: "t",
    url: `https://github.com/o/r/pull/${slug}`,
    isDraft: false,
    updatedAt: "2026-01-01T00:00:00Z",
    author: { login: "x" },
    repository: { nameWithOwner: "o/r" },
    mergeable: "MERGEABLE",
    reviewDecision: null,
    reviewRequests: { nodes: [] },
    reviews: { nodes: [] },
    commits: { nodes: [{ commit: { statusCheckRollup: null } }] },
  });

  const tokens: TokenEntry[] = [
    { id: "A", label: "andy", token: "ta" },
    { id: "B", label: "shuffletix", token: "tb" },
    { id: "C", label: "broken", token: "tc" },
  ];

  it("merges deduped by URL and records a failing token without throwing", async () => {
    const sets: Record<string, unknown[]> = {
      ta: [node("shared"), node("a1")],
      tb: [node("shared"), node("b1")], // "shared" is the same PR in both
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { headers: Record<string, string> }) => {
        const tok = init.headers.Authorization.replace("Bearer ", "");
        if (tok === "tc") return new Response("forbidden", { status: 403 });
        return new Response(
          JSON.stringify({
            data: {
              search: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: sets[tok],
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const { prs, errors } = await fetchTriageForTokens(
      tokens,
      { kind: "all" },
      "me",
    );

    // "shared" collapses to one; a1 + b1 unique → 3 total across both tokens.
    expect(prs.map((p) => p.url).sort()).toEqual([
      "https://github.com/o/r/pull/a1",
      "https://github.com/o/r/pull/b1",
      "https://github.com/o/r/pull/shared",
    ]);
    // The forbidden token is reported, not fatal.
    expect(errors).toHaveLength(1);
    expect(errors[0].label).toBe("broken");
    expect(errors[0].message).toMatch(/403/);
  });

  it("uses partial data when a token hits a field-level permission error", async () => {
    // A read-only fine-grained token can't read statusCheckRollup; GitHub
    // returns that as a field error alongside the PRs. The PRs must still show.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: {
              search: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [node("p1")],
              },
            },
            errors: [
              { message: "Resource not accessible by personal access token" },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const { prs, errors } = await fetchTriageForTokens(
      [{ id: "A", label: "andy", token: "ta" }],
      { kind: "all" },
      "me",
    );
    expect(prs.map((p) => p.url)).toContain("https://github.com/o/r/pull/p1");
    expect(errors).toHaveLength(0);
  });

  it("fans a multi scope out into a per-target search and dedupes across targets", async () => {
    const queries: string[] = [];
    // Every search returns the same PR, so a correct dedupe collapses them to one.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const { variables } = JSON.parse(init.body) as {
          variables: { q: string };
        };
        queries.push(variables.q);
        return new Response(
          JSON.stringify({
            data: {
              search: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [node("only")],
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const { prs, errors } = await fetchTriageForTokens(
      [{ id: "A", label: "andy", token: "ta" }],
      {
        kind: "multi",
        targets: [
          { kind: "org", value: "acme" },
          { kind: "repo", value: "o/n" },
        ],
      },
      "me",
    );

    expect(errors).toHaveLength(0);
    // Collapsed to one PR despite surfacing in every search.
    expect(prs.map((p) => p.url)).toEqual(["https://github.com/o/r/pull/only"]);
    // Each target contributes its own qualifiers (3 involved + 1 unclaimed).
    expect(queries.some((q) => q.includes("org:acme"))).toBe(true);
    expect(queries.some((q) => q.includes("repo:o/n"))).toBe(true);
    expect(queries.some((q) => q.includes("review:none") && q.includes("org:acme"))).toBe(true);
    // Targets are searched independently — no query mixes both qualifiers.
    expect(
      queries.every((q) => !(q.includes("org:acme") && q.includes("repo:o/n"))),
    ).toBe(true);
  });

  it("excludes archived repositories from every search", async () => {
    // PRs in an archived repo are inert (can't merge/push/review), so no search
    // — involved, review-requested, reviewed-by, or unclaimed, at any scope —
    // should ever pull them in. GitHub includes archived repos unless the query
    // says otherwise, so every generated search must carry `archived:false`.
    const queries: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const { variables } = JSON.parse(init.body) as {
          variables: { q: string };
        };
        queries.push(variables.q);
        return new Response(
          JSON.stringify({
            data: {
              search: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [],
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    await fetchTriageForTokens(
      [{ id: "A", label: "andy", token: "ta" }],
      { kind: "repo", value: "o/n" },
      "me",
    );

    // Includes the unclaimed (`review:none`) search, which is only present for a
    // concrete target — proving that search carries the qualifier too.
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.every((q) => q.includes("archived:false"))).toBe(true);
    expect(queries.some((q) => q.includes("review:none"))).toBe(true);
  });

  it("treats a null-data response with errors as a real failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: null,
            errors: [{ message: "forbids access via a personal access token" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const { prs, errors } = await fetchTriageForTokens(
      [{ id: "A", label: "andy", token: "ta" }],
      { kind: "all" },
      "me",
    );
    expect(prs).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/forbids/);
  });
});
