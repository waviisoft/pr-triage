import { useCallback, useEffect, useRef, useState } from "react";
import { buildView, type TriageView } from "../triage/group";
import {
  fetchCatalog,
  fetchTriagePRs,
  fetchViewerLogin,
  forgetToken,
  getToken,
  hasPendingMergeable,
  setToken,
  type Catalog,
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

const THEME_OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: "system", label: "System", icon: "◐" },
  { value: "light", label: "Light", icon: "☀" },
  { value: "dark", label: "Dark", icon: "☾" },
];

export function App() {
  const [token, setTokenState] = useState<string | null>(getToken());
  const [scope, setScope] = useState<Scope>(loadScope());
  const [viewer, setViewer] = useState<string | null>(null);
  const [view, setView] = useState<TriageView | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [pendingRecheck, setPendingRecheck] = useState(false);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [catalog, setCatalog] = useState<Catalog | null>(null);

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
    // Fetch on mount and whenever the token/scope changes. load() flips status
    // to "loading" synchronously — the standard fetch-on-mount transition, not
    // an accidental cascading render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Fetch the token's accessible orgs/repos once per token, to populate the
  // scope picker. Best-effort: a failure just falls back to free-text entry.
  // (catalog is cleared in the "Forget token" handler, not here.)
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchCatalog(token)
      .then((c) => {
        if (!cancelled) setCatalog(c);
      })
      .catch(() => {
        if (!cancelled) setCatalog(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

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

  // When a scoped view comes back empty, explain why. If the target isn't even
  // in the token's accessible catalog, that's almost certainly the reason (the
  // token isn't scoped to it / the org hasn't approved it).
  const emptyScoped =
    status === "idle" &&
    view != null &&
    view.counts.openTotal === 0 &&
    scope.kind !== "all";
  const notInCatalog =
    catalog != null &&
    ((scope.kind === "org" && !catalog.orgs.includes(scope.value)) ||
      (scope.kind === "repo" && !catalog.repos.includes(scope.value)));
  const accessHint = !emptyScoped
    ? null
    : notInCatalog
      ? `“${scope.value}” isn’t in your token’s accessible ${
          scope.kind === "org" ? "organizations" : "repositories"
        }. Fine-grained PATs only reach what they’re explicitly scoped to, and the org owner must approve the token — re-create it with this ${scope.kind} selected and approve it in the org’s settings.`
      : `No open PRs found for this ${scope.kind}. They may be closed/merged, or the token may lack “Pull requests: Read” here.`;

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
            catalog={catalog}
            onApply={(s) => {
              setScope(s);
              localStorage.setItem(SCOPE_KEY, JSON.stringify(s));
            }}
          />
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
            theme={theme}
            onTheme={setTheme}
            onForget={() => {
              forgetToken();
              setTokenState(null);
              setView(null);
              setViewer(null);
              setCatalog(null);
            }}
          />
        </div>
      </header>

      {status === "error" ? (
        <div className="banner banner-error">{error}</div>
      ) : null}

      {accessHint ? (
        <div className="banner banner-info">{accessHint}</div>
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
  catalog,
  onApply,
}: {
  scope: Scope;
  catalog: Catalog | null;
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

  // The token's accessible orgs/repos, offered as a picklist for the field.
  const options =
    kind === "org" ? catalog?.orgs : kind === "repo" ? catalog?.repos : undefined;
  const listId = kind === "org" ? "scope-orgs" : "scope-repos";

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
        <>
          <input
            className="field"
            style={{ width: 200 }}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            list={options?.length ? listId : undefined}
            placeholder={
              options?.length
                ? `pick or type — ${options.length} available`
                : kind === "org"
                  ? "waviisoft"
                  : "owner/name"
            }
            aria-label="Scope value"
          />
          {options?.length ? (
            <datalist id={listId}>
              {options.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          ) : null}
        </>
      ) : null}
      <button className="btn" type="submit">
        Go
      </button>
    </form>
  );
}

function SettingsMenu({
  theme,
  onTheme,
  onForget,
}: {
  theme: Theme;
  onTheme: (t: Theme) => void;
  onForget: () => void;
}) {
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
          <div className="menu-label">Theme</div>
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className="menu-item"
              role="menuitemradio"
              aria-checked={theme === opt.value}
              onClick={() => onTheme(opt.value)}
            >
              <span className="menu-check">{theme === opt.value ? "✓" : ""}</span>
              <span className="menu-icon">{opt.icon}</span>
              {opt.label}
            </button>
          ))}
          <div className="menu-sep" />
          <button
            className="menu-item danger"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onForget();
            }}
          >
            <span className="menu-check" />
            Forget token
          </button>
        </div>
      ) : null}
    </div>
  );
}
