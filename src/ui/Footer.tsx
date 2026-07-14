import { REPO_LICENSE_URL, REPO_URL } from "./links";

/** Page footer: copyright, the license (spelled out + linked), and a source
 *  link that also serves small screens where the corner sash is hidden. */
export function Footer() {
  return (
    <footer className="app-footer">
      © 2026 WAVIISoft, LLC{" · "}
      <a href={REPO_LICENSE_URL} target="_blank" rel="noreferrer">
        MIT License
      </a>
      {" · "}
      <a href={REPO_URL} target="_blank" rel="noreferrer">
        Source on GitHub
      </a>
    </footer>
  );
}
