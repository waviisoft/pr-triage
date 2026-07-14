// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readDemoFlag, useDemoMode } from "./useDemoMode";

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

describe("useDemoMode", () => {
  afterEach(() => {
    // Reset the address bar between tests so history state doesn't leak.
    window.history.replaceState(null, "", "/");
  });

  it("entering demo pushes a history entry so Back returns to the welcome page", () => {
    const before = window.history.length;
    const { result } = renderHook(() => useDemoMode());
    expect(result.current.demo).toBe(false);

    act(() => result.current.enterDemo());
    expect(result.current.demo).toBe(true);
    expect(readDemoFlag(window.location.search)).toBe(true);
    // A new entry was pushed (not a replace), so Back has somewhere to go.
    expect(window.history.length).toBe(before + 1);
  });

  it("syncs the flag back to false on a Back navigation (popstate)", () => {
    const { result } = renderHook(() => useDemoMode());
    act(() => result.current.enterDemo());
    expect(result.current.demo).toBe(true);

    // Simulate the browser Back button: the URL loses ?demo and popstate fires.
    act(() => {
      window.history.replaceState(null, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current.demo).toBe(false);
  });

  it("exiting demo clears the flag without pushing a new entry", () => {
    const { result } = renderHook(() => useDemoMode());
    act(() => result.current.enterDemo());
    const afterEnter = window.history.length;

    act(() => result.current.exitDemo());
    expect(result.current.demo).toBe(false);
    expect(readDemoFlag(window.location.search)).toBe(false);
    expect(window.history.length).toBe(afterEnter);
  });
});
