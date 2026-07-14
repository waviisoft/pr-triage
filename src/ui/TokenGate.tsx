import { AddTokenForm } from "./AddTokenForm";

export function TokenGate({
  onAdd,
}: {
  onAdd: (label: string, token: string) => Promise<void>;
}) {
  return (
    <div className="gate">
      <div className="card">
        <h1>PR Triage</h1>
        <p>
          A “whose move is it?” dashboard for your open pull requests. Add a
          read-only GitHub token to begin — everything runs in your browser and
          tokens never leave it.
        </p>
        <AddTokenForm onAdd={onAdd} submitLabel="Save token" showCreateLink />
        <ul>
          <li>
            A <strong>fine-grained</strong> PAT is simplest and safest — grant
            <code>Pull requests: Read</code> and <code>Metadata: Read</code>.
            For CI dots, add <code>Commit statuses: Read</code> — but note a
            fine-grained PAT can’t read <em>check runs</em> (GitHub Actions and most
            CI), since GitHub offers no Checks permission for these tokens, so those
            PRs show no dot. For Actions status use a <strong>classic</strong> PAT
            (scope <code>repo</code>) instead. It’s scoped to <em>one</em>{" "}
            owner (your account or one org).
          </li>
          <li>
            To span several accounts/orgs, add <strong>one token per owner</strong>
            {" "}
            later from the ⚙ menu — the dashboard aggregates them all. (Some orgs
            block classic PATs, so a fine-grained token per owner is the reliable
            path.)
          </li>
          <li>
            Tokens are stored in <code>localStorage</code>, sent only to{" "}
            <code>api.github.com</code>, and never logged.
          </li>
        </ul>
      </div>
    </div>
  );
}
