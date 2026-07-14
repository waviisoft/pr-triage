const REPO_URL = "https://github.com/waviisoft/pr-triage";

/**
 * "Fork me on GitHub"-style corner ribbon linking to the source repo, where a
 * visitor can open an issue, fork, or review the code. Fixed to the top-right of
 * the viewport; hidden on narrow screens so it doesn't collide with the header
 * controls (see theme.css).
 */
export function GitHubSash() {
  return (
    <a
      className="gh-sash"
      href={REPO_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="View PR Triage on GitHub — open an issue, fork, or review the source"
    >
      View on GitHub
    </a>
  );
}
