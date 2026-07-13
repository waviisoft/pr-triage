import { useCallback, useEffect, useRef, useState } from "react";
import { buildView, type TriageView } from "../triage/group";
import {
  fetchTriagePRs,
  fetchViewerLogin,
  forgetToken,
  getToken,
  hasPendingMergeable,
  setToken,
  type Scope,
} from "../github/client";
import { Bucket } from "./Bucket";
import { Tile } from "./Tile";
import { TokenGate } from "./TokenGate";

const SCOPE_KEY = "pr-triage:scope";
const THEME_KEY = "pr-triage:theme";
/** "system" follows the OS live (no override); the others pin a theme. */
type Theme = "system" | "light" | "dark";

function loadScope(): Scope {
  try {
    const raw = localStorage.getItem(SCOPE_KEY);
    if (raw) return JSON.parse(raw) as Scope;
  } catch {
    /* ignore */
  }
  return { kind: "org", value: "waviisoft" };
}

function initialTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark" || saved === "system") return saved;
  // No explicit choice yet: follow the system theme live via the CSS media query.
  return "system";
}

/** Cycle order for the header toggle. */
const NEXT_THEME: Record<Theme, Theme> = {
  system: "light",
  light: "dark",
  dark: "system",
};
const THEME_ICON: Record<Theme, string> = {
  system: "◐",
  light: "☀",
  dark: "☾",
};

export function App() {
  const [token, setTokenState] = useState<string | null>(getToken());
  const [scope, setScope] = useState<Scope>(loadScope());
  const [viewer, setViewer] = useState<string | null>(null);
  const [view, setView] = useState<TriageView | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [pendingRecheck, setPendingRecheck] = useState(false);
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    // "system" removes the override so `@media (prefers-color-scheme)` governs
    // and tracks OS changes live; light/dark pin the attribute and win over it.
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const load = useCallback(async () => {
    if (!token) return;
    setStatus("loading");
    setError("");
    try {
      const login = await fetchViewerLogin(token);
      setViewer(login);
      const prs = await fetchTriagePRs(token, scope, login);
      setView(buildView(prs, login));
      setPendingRecheck(hasPendingMergeable(prs));
      setStatus("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [token, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  // GitHub computes `mergeable` asynchronously; if anything is still UNKNOWN,
  // re-fetch once shortly after so conflicts settle into place (brief §4).
  useEffect(() => {
    if (!pendingRecheck || status !== "idle") return;
    const id = setTimeout(() => {
      setPendingRecheck(false);
      void load();
    }, 4000);
    return () => clearTimeout(id);
  }, [pendingRecheck, status, load]);

  if (!token) {
    return (
      <TokenGate
        onSave={(t) => {
          setToken(t);
          setTokenState(t);
        }}
      />
    );
  }

  const scopeLabel =
    scope.kind === "all"
      ? "everything accessible to you"
      : scope.kind === "org"
        ? `org:${scope.value}`
        : scope.value;

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>PR Triage</h1>
          <div className="scope-line">
            {scopeLabel}
            {viewer ? (
              <>
                {" · viewed as "}
                <span className="viewer">@{viewer}</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="header-actions">
          <ScopeSwitcher
            scope={scope}
            onApply={(s) => {
              setScope(s);
              localStorage.setItem(SCOPE_KEY, JSON.stringify(s));
            }}
          />
          <button
            className="btn btn-ghost btn-icon"
            title={`Theme: ${theme} (click to change)`}
            aria-label={`Theme: ${theme}. Click to change.`}
            onClick={() => setTheme(NEXT_THEME[theme])}
          >
            {THEME_ICON[theme]}
          </button>
          <button
            className="btn btn-icon"
            title="Refresh"
            aria-label="Refresh"
            onClick={() => void load()}
            disabled={status === "loading"}
          >
            <span className={status === "loading" ? "icon-spin busy" : "icon-spin"}>
              ⟳
            </span>
          </button>
          <SettingsMenu
            onForget={() => {
              forgetToken();
              setTokenState(null);
              setView(null);
              setViewer(null);
            }}
          />
        </div>
      </header>

      {status === "error" ? (
        <div className="banner banner-error">{error}</div>
      ) : null}

      {view ? (
        <>
          <div className="tiles">
            <Tile count={view.counts.needsMe} label="Needs you" severity="indigo" />
            <Tile count={view.counts.waiting} label="Waiting on others" severity="green" />
            <Tile count={view.counts.pickUp} label="To pick up" severity="amber" />
            <Tile count={view.counts.openTotal} label="Open total" severity="slate" />
          </div>

          {status === "loading" ? (
            <div className="banner banner-info">
              <span className="spin" />
              Refreshing…
            </div>
          ) : null}

          {view.buckets.map((b) => (
            <Bucket
              key={b.bucket}
              view={b}
              emptyNote={
                b.bucket === "pick-up" && scope.kind === "all"
                  ? "Pick a specific org or repo to find unclaimed reviews to grab."
                  : undefined
              }
            />
          ))}
        </>
      ) : status === "loading" ? (
        <div className="center-note">
          <span className="spin" />
          Loading your pull requests…
        </div>
      ) : status === "error" ? (
        <div className="center-note">Couldn’t load — check the token and try Refresh.</div>
      ) : null}
    </div>
  );
}

function ScopeSwitcher({
  scope,
  onApply,
}: {
  scope: Scope;
  onApply: (s: Scope) => void;
}) {
  const [kind, setKind] = useState<Scope["kind"]>(scope.kind);
  const [value, setValue] = useState(scope.kind === "all" ? "" : scope.value);

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    if (kind === "all") {
      onApply({ kind: "all" });
      return;
    }
    const v = value.trim();
    if (v) onApply({ kind, value: v });
  };

  return (
    <form className="select-row" onSubmit={apply}>
      <select
        className="field"
        style={{ width: "auto" }}
        value={kind}
        onChange={(e) => setKind(e.target.value as Scope["kind"])}
        aria-label="Scope kind"
      >
        <option value="all">everything</option>
        <option value="org">org</option>
        <option value="repo">repo</option>
      </select>
      {kind !== "all" ? (
        <input
          className="field"
          style={{ width: 170 }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={kind === "org" ? "waviisoft" : "owner/name"}
          aria-label="Scope value"
        />
      ) : null}
      <button className="btn" type="submit">
        Go
      </button>
    </form>
  );
}

function SettingsMenu({ onForget }: { onForget: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button
        className="btn btn-ghost btn-icon"
        title="Settings"
        aria-label="Settings"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ⚙
      </button>
      {open ? (
        <div className="menu-panel" role="menu">
          <button
            className="menu-item danger"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onForget();
            }}
          >
            Forget token
          </button>
        </div>
      ) : null}
    </div>
  );
}
