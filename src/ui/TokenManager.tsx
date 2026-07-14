import { useEffect } from "react";
import {
  ownersOf,
  type Catalog,
  type TokenEntry,
} from "../github/client";
import { AddTokenForm } from "./AddTokenForm";

function mask(token: string): string {
  return token.length > 8 ? `••••${token.slice(-4)}` : "••••";
}

/** One-line summary of what a token can reach, from its fetched catalog. */
function reach(catalog: Catalog | undefined): string {
  if (!catalog) return "checking access…";
  const owners = ownersOf(catalog);
  const who =
    owners.length === 0
      ? catalog.login
      : owners.length <= 3
        ? owners.join(", ")
        : `${owners.slice(0, 3).join(", ")} +${owners.length - 3}`;
  return `${who} · ${catalog.repos.length} repo${catalog.repos.length === 1 ? "" : "s"}`;
}

export function TokenManager({
  tokens,
  catalogs,
  onAdd,
  onRemove,
  onClose,
}: {
  tokens: TokenEntry[];
  catalogs: Record<string, Catalog>;
  onAdd: (label: string, token: string) => Promise<void>;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Manage tokens"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>Tokens</h2>
          <button
            className="btn btn-ghost btn-icon"
            aria-label="Close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <p className="modal-note">
          Add one read-only token per account or org you want to triage — results
          are aggregated across all of them.
        </p>

        <ul className="token-list">
          {tokens.map((t) => (
            <li key={t.id} className="token-item">
              <div className="token-meta">
                <span className="token-label">{t.label}</span>
                <span className="token-reach">{reach(catalogs[t.id])}</span>
              </div>
              <code className="token-mask">{mask(t.token)}</code>
              <button
                className="btn btn-ghost token-remove"
                onClick={() => onRemove(t.id)}
                aria-label={`Remove ${t.label}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <div className="modal-add">
          <div className="modal-add-title">Add a token</div>
          <AddTokenForm onAdd={onAdd} submitLabel="Add token" showCreateLink />
        </div>
      </div>
    </div>
  );
}
