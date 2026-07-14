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
import { IconLogo, IconPencil, IconRefresh, IconSettings } from "./icons";
import { GITHUB_BASE } from "./links";
import { Tile } from "./Tile";
import { TokenGate } from "./TokenGate";
import { TokenManager } from "./TokenManager";

const SCOPE_KEY = "pr-triage:scope";
const THEME_KEY = "pr-triage:theme";
/** How many times to re-poll for a still-UNKNOWN `mergeable` before giving up. */
const MAX_MERGE_RECHECKS = 3;
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

/** The GitHub page that best mirrors a scope, for the scope-line link. */
function githubUrlForScope(scope: Scope): string {
  if (scope.kind === "repo") return `${GITHUB_BASE}/${scope.value}/pulls`;
  if (scope.kind === "org")
    return `${GITHUB_BASE}/pulls?q=${encodeURIComponent(
      `is:open is:pr archived:false involves:@me org:${scope.value}`,
    )}`;
  return `${GITHUB_BASE}/pulls`;
}

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch {
    /* ignore */
  }
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
  const [scopePickerOpen, setScopePickerOpen] = useState(false);
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

  // Bound the mergeable re-poll so a PR stuck at UNKNOWN can't loop forever.
  // Reset on every user-initiated load (token/scope change or Refresh).
  const mergeRechecks = useRef(0);

  useEffect(() => {
    // "system" removes the override so `@media (prefers-color-scheme)` governs
    // and tracks OS changes live; light/dark pin the attribute and win over it.
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
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
    mergeRechecks.current = 0;
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
  // re-fetch shortly after so conflicts settle into place. Bounded to a few
  // tries — some PRs never leave UNKNOWN and we don't want an endless poll.
  useEffect(() => {
    if (!pendingRecheck || status !== "idle") return;
    if (mergeRechecks.current >= MAX_MERGE_RECHECKS) return;
    const id = setTimeout(() => {
      mergeRechecks.current += 1;
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
    setScopePickerOpen(false);
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

  // Reserve one shared `#number` column width across the whole view, sized to
  // the widest number actually shown (+1 for the "#"). Keeps every row's title
  // aligned without over-reserving for digit counts we don't have yet.
  const numCol = useMemo(() => {
    let maxDigits = 1;
    if (view) {
      for (const b of view.buckets)
        for (const g of b.groups)
          for (const item of g.prs)
            maxDigits = Math.max(maxDigits, String(item.pr.number).length);
    }
    return `${maxDigits + 1}ch`;
  }, [view]);

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
    <div className="app" style={{ "--num-col": numCol } as React.CSSProperties}>
      <header className="header">
        <div>
          <div className="brand">
            <IconLogo size={30} />
            <h1>PR Triage</h1>
          </div>
          <div className="scope-line">
            <a
              className="scope-link"
              href={githubUrlForScope(scope)}
              target="_blank"
              rel="noreferrer"
              title="Open on GitHub ↗"
            >
              {scopeLabel}
            </a>
            <button
              className="scope-change"
              onClick={() => setScopePickerOpen((o) => !o)}
              aria-haspopup="dialog"
              aria-expanded={scopePickerOpen}
              aria-label="Change scope"
              title="Change scope"
            >
              <IconPencil />
            </button>
            {viewer ? (
              <>
                {" · viewed as "}
                <a
                  className="viewer"
                  href={`${GITHUB_BASE}/${viewer}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  @{viewer}
                </a>
              </>
            ) : null}
            {tokens.length > 1 ? ` · ${tokens.length} tokens` : null}
            {scopePickerOpen ? (
              <ScopePicker
                scope={scope}
                catalog={mergedCatalog}
                onApply={changeScope}
                onClose={() => setScopePickerOpen(false)}
              />
            ) : null}
          </div>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-icon"
            title="Refresh"
            aria-label="Refresh"
            onClick={() => {
              mergeRechecks.current = 0;
              void load();
            }}
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
            changeScope({ kind: "repo", value: repo });
            setShowManager(false);
          }}
          onClose={() => setShowManager(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * Popover (under the title) for changing what you're triaging. No "Go": picking
 * "Everything" or choosing an org/repo from the list applies immediately;
 * typing a custom value applies on Enter.
 */
function ScopePicker({
  scope,
  catalog,
  onApply,
  onClose,
}: {
  scope: Scope;
  catalog: Catalog | null;
  onApply: (s: Scope) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<Scope["kind"]>(scope.kind);
  const [value, setValue] = useState(scope.kind === "all" ? "" : scope.value);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (kind !== "all") inputRef.current?.focus();
  }, [kind]);

  const options =
    kind === "org" ? catalog?.orgs : kind === "repo" ? catalog?.repos : undefined;
  const listId = kind === "org" ? "scope-pop-orgs" : "scope-pop-repos";

  const applyValue = (v: string) => {
    const t = v.trim();
    if (t && kind !== "all") onApply({ kind, value: t });
  };

  return (
    <div className="scope-pop" ref={ref} role="dialog" aria-label="Change scope">
      <div className="scope-kinds">
        <button
          type="button"
          className="chip-btn"
          data-active={kind === "all"}
          onClick={() => onApply({ kind: "all" })}
        >
          Everything
        </button>
        <button
          type="button"
          className="chip-btn"
          data-active={kind === "org"}
          onClick={() => setKind("org")}
        >
          Org
        </button>
        <button
          type="button"
          className="chip-btn"
          data-active={kind === "repo"}
          onClick={() => setKind("repo")}
        >
          Repo
        </button>
      </div>
      {kind !== "all" ? (
        <>
          <input
            ref={inputRef}
            className="field"
            list={options?.length ? listId : undefined}
            value={value}
            placeholder={
              options?.length
                ? `pick or type — ${options.length} available`
                : kind === "org"
                  ? "organization"
                  : "owner/name"
            }
            aria-label={`${kind} to triage`}
            onChange={(e) => {
              const v = e.target.value;
              setValue(v);
              // An exact match to a listed option means it was picked → apply.
              if (options?.includes(v)) applyValue(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyValue(value);
              }
            }}
          />
          {options?.length ? (
            <datalist id={listId}>
              {options.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          ) : null}
          <div className="scope-hint">
            Pick from the list, or type and press Enter.
          </div>
        </>
      ) : null}
    </div>
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
