import { useState } from "react";

const PAT_URL = "https://github.com/settings/personal-access-tokens/new";

/**
 * Add-a-token form shared by the first-run gate and the token manager. `onAdd`
 * validates the token against GitHub (and auto-labels it), so it can reject —
 * we surface that inline. Leaving the label blank lets `onAdd` derive it from
 * the token's scoped owner.
 */
export function AddTokenForm({
  onAdd,
  submitLabel = "Add token",
  showCreateLink = false,
}: {
  onAdd: (label: string, token: string) => Promise<void>;
  submitLabel?: string;
  showCreateLink?: boolean;
}) {
  const [label, setLabel] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = token.trim();
    if (!t || busy) return;
    setBusy(true);
    setError("");
    try {
      await onAdd(label, t);
      setLabel("");
      setToken("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <label htmlFor="token">GitHub token</label>
      <input
        id="token"
        className="field"
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder="github_pat_… or ghp_…"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        disabled={busy}
      />
      <label htmlFor="token-label" style={{ marginTop: 10 }}>
        Label <span style={{ fontWeight: 400 }}>(optional)</span>
      </label>
      <input
        id="token-label"
        className="field"
        type="text"
        autoComplete="off"
        placeholder="auto-detected from the token’s owner"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        disabled={busy}
      />
      {error ? (
        <div className="banner banner-error" style={{ marginTop: 12 }}>
          {error}
        </div>
      ) : null}
      <div className="actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? (
            <>
              <span className="spin" />
              Checking…
            </>
          ) : (
            submitLabel
          )}
        </button>
        {showCreateLink ? (
          <a className="btn" href={PAT_URL} target="_blank" rel="noreferrer">
            Create a token ↗
          </a>
        ) : null}
      </div>
    </form>
  );
}
