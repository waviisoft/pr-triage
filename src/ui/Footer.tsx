import { IconBug, IconFeedback } from "./icons";
import {
  newBugReportUrl,
  newFeedbackUrl,
  REPO_LICENSE_URL,
  REPO_URL,
  WAVIISOFT_URL,
} from "./links";

/** Page footer: copyright, the license (spelled out + linked), a "file a bug"
 *  link and a "feedback" link that each pre-fill their issue form with the
 *  browser's user agent, and a source link to the repository. */
export function Footer() {
  const userAgent =
    typeof navigator === "undefined" ? "" : navigator.userAgent;
  const bugUrl = newBugReportUrl(userAgent);
  const feedbackUrl = newFeedbackUrl(userAgent);
  return (
    <footer className="app-footer">
      © 2026{" "}
      <a href={WAVIISOFT_URL} target="_blank" rel="noreferrer">
        WAVIISoft, LLC
      </a>
      {" · "}
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
      <a
        className="footer-link-icon"
        href={feedbackUrl}
        target="_blank"
        rel="noreferrer"
      >
        <IconFeedback />
        <span>Feedback</span>
      </a>
      {" · "}
      <a href={REPO_URL} target="_blank" rel="noreferrer">
        Source on GitHub
      </a>
    </footer>
  );
}
