/** GitHub URLs used across the UI — the single source of truth. */
export const GITHUB_BASE = "https://github.com";
const REPO_SLUG = "waviisoft/pr-triage";
export const REPO_URL = `${GITHUB_BASE}/${REPO_SLUG}`;
export const REPO_LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;
export const NEW_PAT_URL = `${GITHUB_BASE}/settings/personal-access-tokens/new`;

/**
 * Deep link to the bug-report issue form with fields pre-filled. GitHub issue
 * forms seed a field from a query param named after that field's `id` in
 * `.github/ISSUE_TEMPLATE/bug_report.yml` — here we fill `environment` (the
 * "Browser & OS" field) with the reporter's user-agent string so they don't
 * have to describe it by hand. Nothing token-related is included.
 */
export function newBugReportUrl(userAgent: string): string {
  const params = new URLSearchParams({
    template: "bug_report.yml",
    environment: userAgent,
  });
  return `${REPO_URL}/issues/new?${params.toString()}`;
}
