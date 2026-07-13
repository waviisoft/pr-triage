import { useState } from "react";

const PAT_URL = "https://github.com/settings/personal-access-tokens/new";

export function TokenGate({ onSave }: { onSave: (token: string) => void }) {
  const [value, setValue] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = value.trim();
    if (t) onSave(t);
  };

  return (
    <div className="gate">
      <div className="card">
        <h1>PR Triage</h1>
        <p>
          A “whose move is it?” dashboard for your open pull requests. Paste a
          read-only GitHub token to begin — everything runs in your browser and
          the token never leaves it.
        </p>
        <form onSubmit={submit}>
          <label htmlFor="token">GitHub fine-grained token</label>
          <input
            id="token"
            className="field"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="github_pat_…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <div className="actions">
            <button className="btn btn-primary" type="submit">
              Save token
            </button>
            <a
              className="btn"
              href={PAT_URL}
              target="_blank"
              rel="noreferrer"
            >
              Create a token ↗
            </a>
          </div>
        </form>
        <ul>
          <li>
            Create a <strong>fine-grained</strong> PAT scoped to the org or
            repos you want to triage.
          </li>
          <li>
            Grant only <code>Pull requests: Read</code> and{" "}
            <code>Metadata: Read</code>.
          </li>
          <li>
            It’s stored in <code>localStorage</code> and sent only to{" "}
            <code>api.github.com</code>. Use “Forget token” anytime.
          </li>
        </ul>
      </div>
    </div>
  );
}
