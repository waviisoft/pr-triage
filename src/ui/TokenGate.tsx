import { useEffect, useState } from "react";
import { AddTokenForm } from "./AddTokenForm";
import { IconClose, IconLogo } from "./icons";

const BASE = import.meta.env.BASE_URL;
const SHOT_ALT =
  "The PR Triage board: open pull requests grouped into “Needs my attention”, " +
  "“Waiting on others”, and “Reviews to pick up”.";

/**
 * First-run welcome page. Leads with what the app looks like (a theme-aware
 * screenshot of the sample board) and two ways in — try the live demo, or add a
 * read-only token via a modal. `onDemo` flips the app into demo mode with no
 * token at all.
 */
export function TokenGate({
  onAdd,
  onDemo,
}: {
  onAdd: (label: string, token: string) => Promise<void>;
  onDemo: () => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="welcome">
      <div className="welcome-hero">
        <IconLogo size={104} />
        <div className="welcome-hero-text">
          <h1>PR Triage</h1>
          <p className="welcome-kicker">Whose move is it?</p>
          <p className="welcome-tagline">
            Your open GitHub pull requests, grouped by whose court the ball is
            in — not one flat list.
          </p>
          <div className="welcome-legend" aria-hidden="true">
            <span className="legend-dot" data-severity="rose" />
            <span className="legend-dot" data-severity="amber" />
            <span className="legend-dot" data-severity="green" />
            <span className="legend-text">
              needs attention · waiting · ready
            </span>
          </div>
          <div className="welcome-cta">
            <button className="btn btn-primary btn-lg" onClick={onDemo}>
              ▶ View live demo
            </button>
            <button className="btn btn-lg" onClick={() => setAdding(true)}>
              Add a token
            </button>
          </div>
          <p className="welcome-subtle">
            The demo uses sample data — no token, no network, nothing leaves your
            browser.
          </p>
        </div>
      </div>

      <figure className="welcome-shot">
        <img className="shot shot-light" src={`${BASE}demo-light.png`} alt={SHOT_ALT} />
        <img className="shot shot-dark" src={`${BASE}demo-dark.png`} alt={SHOT_ALT} />
      </figure>

      <div className="welcome-buckets">
        <div className="welcome-bucket" data-severity="indigo">
          <h3>Needs my attention</h3>
          <p>
            Merge conflicts, failing CI, changes requested, approved-and-ready,
            and reviews others are waiting on <em>you</em> for.
          </p>
        </div>
        <div className="welcome-bucket" data-severity="green">
          <h3>Waiting on others</h3>
          <p>
            You’ve done your part — awaiting a review, or a PR where the ball is
            now in the author’s court.
          </p>
        </div>
        <div className="welcome-bucket" data-severity="amber">
          <h3>Reviews to pick up</h3>
          <p>
            Unclaimed PRs in an org or repo you watch — work you could grab, with
            no reviewer yet.
          </p>
        </div>
      </div>

      {adding ? (
        <AddTokenModal onAdd={onAdd} onClose={() => setAdding(false)} />
      ) : null}
    </div>
  );
}

/**
 * The read-only token entry, in a dismissable modal so the welcome page stays a
 * landing page. A successful add unmounts the whole gate (the board takes over),
 * so there's nothing to close on success — Escape / the overlay / × handle the
 * cancel path.
 */
function AddTokenModal({
  onAdd,
  onClose,
}: {
  onAdd: (label: string, token: string) => Promise<void>;
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
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-label="Add a token"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>Add a token</h2>
          <button
            className="btn btn-ghost btn-icon"
            aria-label="Close"
            onClick={onClose}
          >
            <IconClose />
          </button>
        </div>
        <p className="modal-note">
          Everything runs in your browser and the token never leaves it — stored
          in <code>localStorage</code>, sent only to <code>api.github.com</code>.
          A fine-grained PAT with <code>Pull requests: Read</code> and{" "}
          <code>Metadata: Read</code> is enough (add{" "}
          <code>Commit statuses: Read</code> for CI dots).
        </p>
        <AddTokenForm onAdd={onAdd} submitLabel="Save token" showCreateLink />
      </div>
    </div>
  );
}
