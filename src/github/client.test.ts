import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchTriageForTokens,
  ownersOf,
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
});
