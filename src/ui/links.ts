/** GitHub URLs used across the UI — the single source of truth. */
export const GITHUB_BASE = "https://github.com";
const REPO_SLUG = "waviisoft/pr-triage";
export const REPO_URL = `${GITHUB_BASE}/${REPO_SLUG}`;
export const REPO_LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;
export const NEW_PAT_URL = `${GITHUB_BASE}/settings/personal-access-tokens/new`;

/** Scope kinds we can safely disclose in a public issue (the *kind*, never the
 *  org/repo name). Must exactly match the dropdown option labels in the form. */
export type BugScopeKind = "all" | "org" | "repo";
const BUG_SCOPE_LABEL: Record<BugScopeKind, string> = {
  all: "Everything accessible to me",
  org: "A specific org",
  repo: "A single repo",
};

/**
 * Deep link to the bug-report issue form with fields pre-filled. GitHub issue
 * forms seed a field from a query param named after that field's `id` in
 * `.github/ISSUE_TEMPLATE/bug_report.yml`. We fill `environment` (the
 * "Browser & OS" field) with the reporter's user-agent string, and — if given —
 * pre-select the `scope` dropdown by *kind* only. The actual org/repo name is
 * never included, since a public issue shouldn't leak it. No token is included.
 */
export function newBugReportUrl(
  userAgent: string,
  scopeKind?: BugScopeKind,
): string {
  const params = new URLSearchParams({
    template: "bug_report.yml",
    environment: userAgent,
  });
  if (scopeKind) params.set("scope", BUG_SCOPE_LABEL[scopeKind]);
  return `${REPO_URL}/issues/new?${params.toString()}`;
}
