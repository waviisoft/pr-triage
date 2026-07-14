import { describe, expect, it } from "vitest";
import { CATALOG_QUERY } from "./queries";

describe("CATALOG_QUERY", () => {
  // Regression guard: viewer.repositories.ownerAffiliations defaults to
  // [OWNER, COLLABORATOR], which drops org repos the viewer only belongs to —
  // so they must be requested explicitly or the scope picker misses them.
  it("requests org-member repos via ownerAffiliations", () => {
    expect(CATALOG_QUERY).toMatch(
      /ownerAffiliations:\s*\[[^\]]*ORGANIZATION_MEMBER/,
    );
  });
});
