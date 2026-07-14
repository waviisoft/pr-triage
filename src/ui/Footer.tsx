import { IconBug } from "./icons";
import {
  newBugReportUrl,
  REPO_LICENSE_URL,
  REPO_URL,
  type BugScopeKind,
} from "./links";

/** Derive the current scope *kind* from the page URL for the bug link. Only the
 *  kind (everything / org / repo) is read — never the org/repo name, which
 *  shouldn't leak into a public issue. */
function currentScopeKind(): BugScopeKind {
  if (typeof window === "undefined") return "all";
  const raw = new URLSearchParams(window.location.search).get("scope");
  if (raw?.startsWith("org:")) return "org";
  if (raw?.startsWith("repo:")) return "repo";
  return "all";
}

/** Page footer: copyright, the license (spelled out + linked), a "file a bug"
 *  link that pre-fills the report with the browser's user agent and scope kind,
 *  and a source link that also serves small screens where the sash is hidden. */
export function Footer() {
  const bugUrl = newBugReportUrl(
    typeof navigator === "undefined" ? "" : navigator.userAgent,
    currentScopeKind(),
  );
  return (
    <footer className="app-footer">
      © 2026 WAVIISoft, LLC{" · "}
      <a href={REPO_LICENSE_URL} target="_blank" rel="noreferrer">
        MIT License
      </a>
      {" · "}
      <a
        className="footer-link-icon"
        href={bugUrl}
        target="_blank"
        rel="noreferrer"
      >
        <IconBug />
        <span>File a bug</span>
      </a>
      {" · "}
      <a href={REPO_URL} target="_blank" rel="noreferrer">
        Source on GitHub
      </a>
    </footer>
  );
}
