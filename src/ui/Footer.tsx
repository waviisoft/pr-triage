const REPO_URL = "https://github.com/waviisoft/pr-triage";

/** Page footer: copyright, the license (spelled out + linked), and a source
 *  link that also serves small screens where the corner sash is hidden. */
export function Footer() {
  return (
    <footer className="app-footer">
      © 2026 WAVIISoft, LLC{" · "}
      <a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
        MIT License
      </a>
      {" · "}
      <a href={REPO_URL} target="_blank" rel="noreferrer">
        Source on GitHub
      </a>
    </footer>
  );
}
