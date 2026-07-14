import { describe, expect, it } from "vitest";
import { buildView } from "../triage/group";
import { Group, type Group as GroupT } from "../triage/types";
import { DEMO_VIEWER, demoPRs } from "./data";

/** Collect every (non-null) group that appears anywhere in the built view. */
function groupsInView(prs = demoPRs()): Set<GroupT> {
  const view = buildView(prs, DEMO_VIEWER);
  const seen = new Set<GroupT>();
  for (const bucket of view.buckets)
    for (const section of bucket.groups) seen.add(section.group);
  return seen;
}

describe("demo data", () => {
  it("has no duplicate PR urls (dedupe key upstream)", () => {
    const urls = demoPRs().map((p) => p.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("classifies into every visible triage group", () => {
    const seen = groupsInView();
    for (const group of Object.values(Group)) {
      expect(seen, `expected the demo to include the "${group}" group`).toContain(
        group,
      );
    }
  });

  it("fills all three buckets", () => {
    const { counts } = buildView(demoPRs(), DEMO_VIEWER);
    expect(counts.needsMe).toBeGreaterThan(0);
    expect(counts.waiting).toBeGreaterThan(0);
    expect(counts.pickUp).toBeGreaterThan(0);
    expect(counts.openTotal).toBe(demoPRs().length);
  });

  it("keeps timestamps in the past relative to the given clock", () => {
    const now = 1_700_000_000_000;
    for (const p of demoPRs(now)) {
      expect(new Date(p.updatedAt).getTime()).toBeLessThanOrEqual(now);
    }
  });
});
