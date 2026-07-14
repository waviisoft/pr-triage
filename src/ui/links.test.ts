import { describe, expect, it } from "vitest";
import { safeHref } from "./links";

describe("safeHref", () => {
  it("passes through https and http URLs unchanged", () => {
    const url = "https://github.com/waviisoft/pr-triage/pull/42";
    expect(safeHref(url)).toBe(url);
    expect(safeHref("http://example.com/x")).toBe("http://example.com/x");
  });

  it("neutralizes script-bearing schemes to '#'", () => {
    expect(safeHref("javascript:alert(1)")).toBe("#");
    expect(safeHref("JavaScript:alert(1)")).toBe("#");
    expect(safeHref("data:text/html,<script>alert(1)</script>")).toBe("#");
    expect(safeHref("vbscript:msgbox(1)")).toBe("#");
  });

  it("returns '#' for non-absolute or unparseable values", () => {
    expect(safeHref("/relative/path")).toBe("#");
    expect(safeHref("not a url")).toBe("#");
    expect(safeHref("")).toBe("#");
  });
});
