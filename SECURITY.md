# Security Policy

## How pr-triage handles your token

pr-triage is a **fully static, client-side** app. There is no backend, so your
GitHub token is handled entirely in your browser:

- It's stored in **`localStorage`** on your device and never sent anywhere except
  directly to **`https://api.github.com`**.
- It is **never logged** and never transmitted to any third party or server the
  project controls (there isn't one).
- You can remove any token at any time via **⚙ → Manage tokens**, which deletes
  it from `localStorage`.

### Least-privilege guidance

- Prefer a **fine-grained personal access token** scoped to only the org/repos
  you want to triage.
- Grant only **Pull requests: Read** and **Metadata: Read** (plus optionally
  **Commit statuses: Read** / **Checks: Read** for CI dots). The app never needs
  write access.
- Because tokens live in `localStorage`, avoid using pr-triage on a shared or
  untrusted machine, and remove tokens when you're done there.

## Reporting a vulnerability

Please **do not open a public issue** for security reports.

Instead, report privately via GitHub's
[**Report a vulnerability**](https://github.com/waviisoft/pr-triage/security/advisories/new)
(Security → Advisories), or email **andy@waviisoft.com**.

Please include steps to reproduce and the impact. We'll acknowledge your report,
investigate, and coordinate a fix and disclosure. Thank you for helping keep
users safe.
