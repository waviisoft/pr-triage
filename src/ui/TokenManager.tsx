import { useState } from "react";
import {
  ownersOf,
  type Catalog,
  type TokenEntry,
} from "../github/client";
import { AddTokenForm } from "./AddTokenForm";
import { IconPencil, IconRefresh } from "./icons";
import { Modal } from "./Modal";

function mask(token: string): string {
  return token.length > 8 ? `••••${token.slice(-4)}` : "••••";
}

/** Which owners a token reaches, for the summary line. */
function ownersText(catalog: Catalog): string {
  const owners = ownersOf(catalog);
  if (owners.length === 0) return catalog.login;
  if (owners.length <= 3) return owners.join(", ");
  return `${owners.slice(0, 3).join(", ")} +${owners.length - 3}`;
}

export function TokenManager({
  tokens,
  catalogs,
  refreshing,
  onAdd,
  onRemove,
  onRename,
  onRefresh,
  onPickRepo,
  onClose,
}: {
  tokens: TokenEntry[];
  catalogs: Record<string, Catalog>;
  /** Ids of tokens whose catalog is currently being re-fetched. */
  refreshing: string[];
  onAdd: (label: string, token: string) => Promise<void>;
  onRemove: (id: string) => void;
  /** Rename a token (its display label only — the credential is untouched). */
  onRename: (id: string, label: string) => void;
  /** Re-fetch a token's catalog to pick up access it gained since it was added. */
  onRefresh: (id: string) => void;
  /** Jump the dashboard to a specific repo picked from a token's list. */
  onPickRepo: (repo: string) => void;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  // The token currently being relabeled, and the in-progress draft name.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const startRename = (t: TokenEntry) => {
    setEditingId(t.id);
    setDraft(t.label);
  };
  const cancelRename = () => {
    setEditingId(null);
    setDraft("");
  };
  const commitRename = (t: TokenEntry) => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== t.label) onRename(t.id, trimmed);
    setEditingId(null);
    setDraft("");
  };

  return (
    <Modal title="Tokens" ariaLabel="Manage tokens" onClose={onClose}>
      <p className="modal-note">
        Add one read-only token per account or org you want to triage — results
        are aggregated across all of them. Expand a token to see the repos it
        can reach; click one to triage it.
      </p>

      <ul className="token-list">
        {tokens.map((t) => {
          const cat = catalogs[t.id];
          const repoCount = cat?.repos.length ?? 0;
          const open = expanded === t.id;
          const isRefreshing = refreshing.includes(t.id);
          return (
            <li key={t.id} className="token-entry">
              <div className="token-item">
                <div className="token-meta">
                  {editingId === t.id ? (
                    <input
                      className="field token-label-edit"
                      value={draft}
                      autoFocus
                      aria-label={`Rename ${t.label}`}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => commitRename(t)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitRename(t);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          cancelRename();
                        }
                      }}
                    />
                  ) : (
                    <span className="token-label-row">
                      <span className="token-label">{t.label}</span>
                      <button
                        className="btn btn-ghost btn-icon token-rename"
                        onClick={() => startRename(t)}
                        aria-label={`Rename ${t.label}`}
                        title="Rename"
                      >
                        <IconPencil size={13} />
                      </button>
                    </span>
                  )}
                  <span className="token-reach">
                    {isRefreshing ? (
                      "refreshing access…"
                    ) : !cat ? (
                      "checking access…"
                    ) : (
                      <>
                        {ownersText(cat)}
                        {repoCount ? (
                          <>
                            {" · "}
                            <button
                              className="link-btn"
                              aria-expanded={open}
                              onClick={() =>
                                setExpanded(open ? null : t.id)
                              }
                            >
                              {repoCount} repo{repoCount === 1 ? "" : "s"}{" "}
                              <span className="caret" aria-hidden>
                                {open ? "▾" : "▸"}
                              </span>
                            </button>
                          </>
                        ) : (
                          " · no repositories visible"
                        )}
                      </>
                    )}
                  </span>
                </div>
                <code className="token-mask">{mask(t.token)}</code>
                <button
                  className="btn btn-ghost btn-icon token-refresh"
                  onClick={() => onRefresh(t.id)}
                  disabled={isRefreshing}
                  aria-label={`Refresh access for ${t.label}`}
                  title="Refresh access — pick up newly granted permissions or repos"
                >
                  <IconRefresh
                    size={15}
                    className={isRefreshing ? "icon-spin busy" : undefined}
                  />
                </button>
                <button
                  className="btn btn-ghost token-remove"
                  onClick={() => onRemove(t.id)}
                  aria-label={`Remove ${t.label}`}
                >
                  Remove
                </button>
              </div>
              {open && cat && repoCount ? (
                <ul className="repo-sublist">
                  {cat.repos.map((r) => (
                    <li key={r}>
                      <button
                        className="repo-pick"
                        title={`Triage ${r}`}
                        onClick={() => onPickRepo(r)}
                      >
                        {r}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="modal-add">
        <div className="modal-add-title">Add a token</div>
        <AddTokenForm onAdd={onAdd} submitLabel="Add token" showCreateLink />
      </div>
    </Modal>
  );
}
