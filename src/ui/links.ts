/** GitHub URLs used across the UI — the single source of truth. */
export const GITHUB_BASE = "https://github.com";
const REPO_SLUG = "waviisoft/pr-triage";
export const REPO_URL = `${GITHUB_BASE}/${REPO_SLUG}`;
export const REPO_LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;
export const NEW_PAT_URL = `${GITHUB_BASE}/settings/personal-access-tokens/new`;
export const WAVIISOFT_URL = "https://www.waviisoft.com";

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

/**
 * Deep link to the bug-report issue form with fields pre-filled. GitHub issue
 * forms seed a field from a query param named after that field's `id` in
 * `.github/ISSUE_TEMPLATE/bug_report.yml`. We fill `environment` (the
 * "Browser & OS" field) with the reporter's user-agent string. The `scope`
 * dropdown is left for the reporter to pick: GitHub issue forms can't pre-fill
 * `dropdown` fields via query params, and it's deliberately a dropdown (not a
 * text input) so a private org/repo name can't leak into a public issue. No
 * token is included.
 */
export function newBugReportUrl(userAgent: string): string {
  const params = new URLSearchParams({
    template: "bug_report.yml",
    environment: userAgent,
  });
  return `${REPO_URL}/issues/new?${params.toString()}`;
}
