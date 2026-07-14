import { describe, expect, it } from "vitest";
import { readDemoFlag } from "./useDemoMode";

describe("readDemoFlag", () => {
  it("reads the ?demo flag from a query string", () => {
    expect(readDemoFlag("?demo")).toBe(true);
    expect(readDemoFlag("?demo=1")).toBe(true);
    expect(readDemoFlag("?foo=bar&demo=1")).toBe(true);
    expect(readDemoFlag("")).toBe(false);
    expect(readDemoFlag("?demo=0")).toBe(false);
    expect(readDemoFlag("?demo=false")).toBe(false);
  });
});
