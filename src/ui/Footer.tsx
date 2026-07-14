import { IconBug } from "./icons";
import { newBugReportUrl, REPO_LICENSE_URL, REPO_URL } from "./links";

/** Page footer: copyright, the license (spelled out + linked), a "file a bug"
 *  link that pre-fills the report with the browser's user agent, and a source
 *  link to the repository. */
export function Footer() {
  const bugUrl = newBugReportUrl(
    typeof navigator === "undefined" ? "" : navigator.userAgent,
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
