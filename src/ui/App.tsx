import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { buildView, type TriageView } from "../triage/group";
import {
  fetchCatalog,
  fetchTriageForTokens,
  getTokens,
  hasPendingMergeable,
  makeToken,
  resolveLogin,
  saveTokens,
  suggestLabel,
  tokensForScope,
  type Catalog,
  type Scope,
  type TokenEntry,
  type TokenError,
} from "../github/client";
import { Bucket } from "./Bucket";
import { IconRefresh, IconSettings } from "./icons";
import { Tile } from "./Tile";
import { TokenGate } from "./TokenGate";
import { TokenManager } from "./TokenManager";

const SCOPE_KEY = "pr-triage:scope";
const THEME_KEY = "pr-triage:theme";
/** "system" follows the OS live (no override); the others pin a theme. */
type Theme = "system" | "light" | "dark";

// Scope lives in the URL (`?scope=all|org:x|repo:owner/name`) so each browser
// tab holds its own filter independently and can be bookmarked/shared. The last
// choice is also mirrored to localStorage as the default for a fresh tab.
function scopeToParam(scope: Scope): string {
  return scope.kind === "all" ? "all" : `${scope.kind}:${scope.value}`;
}

function parseScopeParam(raw: string | null): Scope | null {
  if (!raw) return null;
  if (raw === "all") return { kind: "all" };
  const i = raw.indexOf(":");
  if (i < 0) return null;
  const kind = raw.slice(0, i);
  const value = raw.slice(i + 1);
  if ((kind === "org" || kind === "repo") && value) return { kind, value };
  return null;
}

function loadInitialScope(): Scope {
  const fromUrl = parseScopeParam(
    new URLSearchParams(window.location.search).get("scope"),
  );
  if (fromUrl) return fromUrl;
  try {
    const raw = localStorage.getItem(SCOPE_KEY);
    if (raw) return JSON.parse(raw) as Scope;
  } catch {
    /* ignore */
  }
  return { kind: "all" };
}

function persistScope(scope: Scope): void {
  const url = new URL(window.location.href);
  url.searchParams.set("scope", scopeToParam(scope));
  window.history.replaceState(null, "", url);
  try {
    localStorage.setItem(SCOPE_KEY, JSON.stringify(scope));
  } catch {
    /* ignore */
  }
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
  const [tokens, setTokens] = useState<TokenEntry[]>(getTokens);
  const [scope, setScope] = useState<Scope>(loadInitialScope);
  const [viewer, setViewer] = useState<string | null>(null);
  const [view, setView] = useState<TriageView | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [tokenErrors, setTokenErrors] = useState<TokenError[]>([]);
  const [pendingRecheck, setPendingRecheck] = useState(false);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [catalogs, setCatalogs] = useState<Record<string, Catalog>>({});
  // Repos observed in results — provably reachable even when the catalog query
  // can't enumerate them (org repos need org-membership visibility the token may
  // lack). Accumulates across loads so the picker only grows within a session.
  const [involvedRepos, setInvolvedRepos] = useState<string[]>([]);
  const [showManager, setShowManager] = useState(false);

  // Read the latest catalogs inside load() without making it a dependency
  // (which would refetch triage every time a catalog resolves).
  const catalogsRef = useRef(catalogs);
  useEffect(() => {
    catalogsRef.current = catalogs;
  }, [catalogs]);

  useEffect(() => {
    // "system" removes the override so `@media (prefers-color-scheme)` governs
    // and tracks OS changes live; light/dark pin the attribute and win over it.
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const load = useCallback(async () => {
    if (!tokens.length) return;
    setStatus("loading");
    setError("");
    try {
      const login = await resolveLogin(tokens);
      setViewer(login);
      const use = tokensForScope(scope, tokens, catalogsRef.current);
      const { prs, errors } = await fetchTriageForTokens(use, scope, login);
      setView(buildView(prs, login));
      setInvolvedRepos((prev) => {
        const seen = new Set(prev);
        for (const p of prs) seen.add(p.repository);
        return [...seen].sort();
      });
      setTokenErrors(errors);
      setPendingRecheck(hasPendingMergeable(prs));
      setStatus("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [tokens, scope]);

  useEffect(() => {
    // Fetch on mount and whenever the tokens/scope change. load() flips status
    // to "loading" synchronously — the standard fetch-on-mount transition.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Fetch each token's accessible orgs/repos to populate the scope picker and
  // label tokens. Best-effort: a token that fails just contributes nothing.
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      tokens.map(async (t) => {
        try {
          return { id: t.id, catalog: await fetchCatalog(t.token) };
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      const next: Record<string, Catalog> = {};
      for (const r of results) if (r) next[r.id] = r.catalog;
      setCatalogs(next);
    });
    return () => {
      cancelled = true;
    };
  }, [tokens]);

  // GitHub computes `mergeable` asynchronously; if anything is still UNKNOWN,
  // re-fetch once shortly after so conflicts settle into place.
  useEffect(() => {
    if (!pendingRecheck || status !== "idle") return;
    const id = setTimeout(() => {
      setPendingRecheck(false);
      void load();
    }, 4000);
    return () => clearTimeout(id);
  }, [pendingRecheck, status, load]);

  const addToken = useCallback(
    async (label: string, raw: string) => {
      const token = raw.trim();
      if (!token) throw new Error("Paste a token first.");
      if (tokens.some((t) => t.token === token))
        throw new Error("That token is already added.");
      // fetchCatalog both validates the token and reveals its scoped owner.
      const catalog = await fetchCatalog(token);
      const entry = makeToken(label.trim() || suggestLabel(catalog), token);
      const next = [...tokens, entry];
      setTokens(next);
      saveTokens(next);
      setCatalogs((prev) => ({ ...prev, [entry.id]: catalog }));
    },
    [tokens],
  );

  const removeToken = useCallback(
    (id: string) => {
      const next = tokens.filter((t) => t.id !== id);
      setTokens(next);
      saveTokens(next);
      setCatalogs((prev) => {
        const c = { ...prev };
        delete c[id];
        return c;
      });
      setInvolvedRepos([]);
      if (!next.length) {
        setView(null);
        setViewer(null);
        setShowManager(false);
      }
    },
    [tokens],
  );

  // Apply a new scope: update state and persist to the URL (per-tab) +
  // localStorage. The load effect re-runs off the new scope.
  const changeScope = useCallback((s: Scope) => {
    setScope(s);
    persistScope(s);
  }, []);

  // Scope picker + access hints draw from the union of every token's catalog
  // PLUS the repos seen in results. The catalog can't enumerate org repos when
  // the token lacks org-membership visibility, but those repos still show up in
  // the PRs we fetch — so fold them in to keep the picker complete. The viewer's
  // own login is excluded from the org list (you don't `org:` your own account).
  const mergedCatalog = useMemo<Catalog | null>(() => {
    const cs = Object.values(catalogs);
    if (!cs.length && !involvedRepos.length) return null;
    const orgs = new Set<string>();
    const repos = new Set<string>();
    for (const c of cs) {
      c.orgs.forEach((o) => orgs.add(o));
      c.repos.forEach((r) => repos.add(r));
    }
    for (const full of involvedRepos) {
      repos.add(full);
      const owner = full.split("/")[0];
      if (owner && owner !== viewer) orgs.add(owner);
    }
    return {
      login: viewer ?? cs[0]?.login ?? "",
      orgs: [...orgs].sort(),
      repos: [...repos].sort(),
    };
  }, [catalogs, involvedRepos, viewer]);

  if (!tokens.length) {
    return <TokenGate onAdd={addToken} />;
  }

  const scopeLabel =
    scope.kind === "all"
      ? "everything accessible to you"
      : scope.kind === "org"
        ? `org:${scope.value}`
        : scope.value;

  // When a scoped view comes back empty, explain why. If the target isn't in any
  // token's catalog, that's almost certainly the reason (no token is scoped to
  // it / the org hasn't approved one).
  const emptyScoped =
    status === "idle" &&
    view != null &&
    view.counts.openTotal === 0 &&
    scope.kind !== "all";
  const notInCatalog =
    mergedCatalog != null &&
    ((scope.kind === "org" && !mergedCatalog.orgs.includes(scope.value)) ||
      (scope.kind === "repo" && !mergedCatalog.repos.includes(scope.value)));
  const accessHint = !emptyScoped
    ? null
    : notInCatalog
      ? `“${scope.value}” isn’t reachable by any of your tokens. Fine-grained PATs only reach what they’re scoped to, and the org owner must approve them. Add a token scoped to this ${scope.kind} from the ⚙ menu.`
      : `No open PRs found for this ${scope.kind}. They may be closed/merged, or your token may lack “Pull requests: Read” here.`;

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
            {tokens.length > 1 ? ` · ${tokens.length} tokens` : null}
          </div>
        </div>
        <div className="header-actions">
          <ScopeSwitcher
            scope={scope}
            catalog={mergedCatalog}
            onApply={changeScope}
          />
          <button
            className="btn btn-icon"
            title="Refresh"
            aria-label="Refresh"
            onClick={() => void load()}
            disabled={status === "loading"}
          >
            <IconRefresh
              className={status === "loading" ? "icon-spin busy" : "icon-spin"}
            />
          </button>
          <SettingsMenu
            theme={theme}
            onTheme={setTheme}
            onManage={() => setShowManager(true)}
          />
        </div>
      </header>

      {status === "error" ? (
        <div className="banner banner-error">{error}</div>
      ) : null}

      {tokenErrors.length ? (
        <div className="banner banner-error">
          {tokenErrors.map((e) => (
            <div key={e.label}>
              Token “{e.label}”: {e.message}
            </div>
          ))}
        </div>
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
        <div className="center-note">Couldn’t load — check your tokens and try Refresh.</div>
      ) : null}

      {showManager ? (
        <TokenManager
          tokens={tokens}
          catalogs={catalogs}
          onAdd={addToken}
          onRemove={removeToken}
          onPickRepo={(repo) => {
            const s: Scope = { kind: "repo", value: repo };
            setScope(s);
            localStorage.setItem(SCOPE_KEY, JSON.stringify(s));
            setShowManager(false);
          }}
          onClose={() => setShowManager(false)}
        />
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

  // The tokens' accessible orgs/repos, offered as a picklist for the field.
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
  onManage,
}: {
  theme: Theme;
  onTheme: (t: Theme) => void;
  onManage: () => void;
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
        <IconSettings />
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
            className="menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onManage();
            }}
          >
            <span className="menu-check" />
            Manage tokens…
          </button>
        </div>
      ) : null}
    </div>
  );
}
