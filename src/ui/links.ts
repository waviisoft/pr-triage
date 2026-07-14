/** GitHub URLs used across the UI — the single source of truth. */
export const GITHUB_BASE = "https://github.com";
export const REPO_SLUG = "waviisoft/pr-triage";
export const REPO_URL = `${GITHUB_BASE}/${REPO_SLUG}`;
export const REPO_LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;
export const NEW_PAT_URL = `${GITHUB_BASE}/settings/personal-access-tokens/new`;

/**
 * Only let http(s) URLs reach an `href`. PR links come from GitHub's API and are
 * always `https://github.com/…` today, so this is belt-and-suspenders: if a
 * value ever arrived as `javascript:`/`data:` (a future data source, a bug), it
 * would be neutralized to "#" instead of becoming a script-execution sink.
 */
export function safeHref(url: string): string {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:" ? url : "#";
  } catch {
    return "#";
  }
}
