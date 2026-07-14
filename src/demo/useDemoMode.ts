import { useCallback, useEffect, useState } from "react";

// Demo activation — the single owner of the `?demo` flag. Splitting this from
// `data.ts` keeps the sample *dataset* separate from the *mechanism* that turns
// the demo on (SRP): <App/> just reads `demo` and calls enter/exit, instead of
// threading URL plumbing and a `setState` through free functions.

/** Query-string flag that turns the board into the sample view. */
const DEMO_PARAM = "demo";

/** Read the `?demo` flag from a query string. Pure, so it's trivial to test. */
export function readDemoFlag(search: string = window.location.search): boolean {
  const v = new URLSearchParams(search).get(DEMO_PARAM);
  return v !== null && v !== "0" && v !== "false";
}

/**
 * Add or remove `?demo` from the address bar without reloading the page. `push`
 * creates a *new* history entry (so the browser Back button returns to the page
 * we came from — the welcome page) instead of replacing the current one.
 */
function writeDemoFlag(on: boolean, push = false): void {
  const url = new URL(window.location.href);
  if (on) url.searchParams.set(DEMO_PARAM, "1");
  else url.searchParams.delete(DEMO_PARAM);
  if (push) window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

export interface DemoMode {
  /** Whether the sample board is showing. */
  demo: boolean;
  enterDemo: () => void;
  exitDemo: () => void;
}

/**
 * Owns demo activation: the `demo` flag (seeded from the URL on mount), its
 * mirror in the `?demo` param, and the enter/exit transitions.
 */
export function useDemoMode(): DemoMode {
  const [demo, setDemo] = useState(readDemoFlag);
  const enterDemo = useCallback(() => {
    // Push a history entry so pressing Back returns to the welcome page rather
    // than leaving the app entirely.
    writeDemoFlag(true, true);
    setDemo(true);
  }, []);
  const exitDemo = useCallback(() => {
    writeDemoFlag(false);
    setDemo(false);
  }, []);
  // Keep the flag in sync with browser Back/Forward: the URL is the source of
  // truth, so re-read it whenever the active history entry changes. This is what
  // makes Back out of the demo land on the welcome page instead of a stale board.
  useEffect(() => {
    const onPop = () => setDemo(readDemoFlag());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return { demo, enterDemo, exitDemo };
}
