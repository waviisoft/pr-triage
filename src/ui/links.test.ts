import { describe, expect, it } from "vitest";
import { newBugReportUrl } from "./links";

describe("newBugReportUrl", () => {
  it("targets the bug-report form and seeds the environment field", () => {
    const url = new URL(newBugReportUrl("Mozilla/5.0 (Test) Chrome/1.0"));
    expect(url.pathname).toBe("/waviisoft/pr-triage/issues/new");
    expect(url.searchParams.get("template")).toBe("bug_report.yml");
    expect(url.searchParams.get("environment")).toBe(
      "Mozilla/5.0 (Test) Chrome/1.0",
    );
  });

  it("URL-encodes user-agent characters that would break the query", () => {
    // A UA with `&`/`;`/spaces must not leak into extra query params.
    const url = newBugReportUrl("Foo/1.0 (X; Y) A&B");
    expect(url).toContain("environment=Foo%2F1.0+%28X%3B+Y%29+A%26B");
    expect(new URL(url).searchParams.get("environment")).toBe(
      "Foo/1.0 (X; Y) A&B",
    );
  });

  it("never adds a scope param (GitHub can't pre-fill dropdown fields)", () => {
    expect(new URL(newBugReportUrl("UA")).searchParams.has("scope")).toBe(false);
  });
});
