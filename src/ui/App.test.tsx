// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the GitHub layer so <App/> mounts straight into the dashboard with one
// saved token and no network.
const { saveTokens, fetchTriage } = vi.hoisted(() => ({
  saveTokens: vi.fn(),
  fetchTriage: vi.fn(
    async (): Promise<{ prs: unknown[]; errors: unknown[] }> => ({
      prs: [],
      errors: [],
    }),
  ),
}));
vi.mock("../github/client", () => ({
  getTokens: () => [{ id: "1", label: "me", token: "tok" }],
  saveTokens,
  makeToken: (label: string, token: string) => ({ id: "new", label, token }),
  suggestLabel: () => "auto",
  ownersOf: () => [],
  resolveLogin: vi.fn(async () => "me"),
  fetchTriageForTokens: fetchTriage,
  fetchCatalog: vi.fn(async () => ({ login: "me", orgs: [], repos: [] })),
  tokensForScope: (_scope: unknown, tokens: unknown) => tokens,
  scopeTargets: () => [],
  hasPendingMergeable: () => false,
}));

import { App, RefreshButton } from "./App";

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("App — token management", () => {
  it("removing the only token returns to the token-entry screen", async () => {
    render(<App />);

    // Dashboard has loaded and there's no token field while signed in.
    await screen.findByText("Needs my attention");
    expect(screen.queryByLabelText(/GitHub token/i)).toBeNull();

    // Open the settings menu and the token manager.
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /manage tokens/i }));
    await screen.findByRole("dialog", { name: /manage tokens/i });

    // Remove the only token → back to the welcome page.
    fireEvent.click(screen.getByRole("button", { name: /remove me/i }));

    // The welcome page is shown (demo entry point present) and the dashboard's
    // Refresh control is gone. (The welcome page previews the bucket names, so
    // their text alone no longer tells the two screens apart.)
    await screen.findByRole("button", { name: /view live demo/i });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /refresh/i })).toBeNull(),
    );
    // Token entry now lives behind the "Get started…" button (a modal).
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));
    expect(await screen.findByLabelText(/GitHub token/i)).toBeTruthy();
    expect(saveTokens).toHaveBeenCalled();
  });

  it("renames a token from the manager and persists the new label", async () => {
    render(<App />);
    await screen.findByText("Needs my attention");

    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /manage tokens/i }));
    await screen.findByRole("dialog", { name: /manage tokens/i });

    // Enter edit mode, type a new name, and commit with Enter.
    fireEvent.click(screen.getByRole("button", { name: /rename me/i }));
    const input = screen.getByRole("textbox", { name: /rename me/i });
    fireEvent.change(input, { target: { value: "work laptop" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(saveTokens).toHaveBeenCalledWith([
        expect.objectContaining({ id: "1", label: "work laptop" }),
      ]),
    );
    // The new label is shown; the editor is gone.
    expect(screen.getByText("work laptop")).toBeTruthy();
  });
});

describe("App — changed-since-last-refresh markers", () => {
  /** A normalized PR shaped enough to classify; overrides steer the bucket. */
  const pr = (overrides: Record<string, unknown> = {}) => ({
    number: 42,
    title: "Wire up the widget",
    url: "https://github.com/waviisoft/pr-triage/pull/42",
    isDraft: false,
    updatedAt: "2026-01-01T00:00:00Z",
    authorLogin: "me",
    repository: "waviisoft/pr-triage",
    mergeable: "MERGEABLE",
    reviewDecision: "REVIEW_REQUIRED",
    statusCheckRollup: "SUCCESS",
    reviewRequests: [{ type: "User", login: "reviewer" }],
    myReviewState: null,
    hasReviews: false,
    ...overrides,
  });

  it("flags a PR that moved buckets on the next refresh, and counts it", async () => {
    // First load: the PR is awaiting review (Waiting on others).
    fetchTriage.mockResolvedValueOnce({ prs: [pr()], errors: [] });
    render(<App />);
    await screen.findByText("Wire up the widget");

    // Nothing is highlighted on the very first load — there's no baseline yet.
    expect(screen.queryByText("Updated")).toBeNull();
    expect(screen.queryByText(/changed$/)).toBeNull();

    // Second load (Refresh): CI now failing and the reviewer is gone, so the PR
    // moves into "Needs my attention" — a triage move we should flag.
    fetchTriage.mockResolvedValueOnce({
      prs: [pr({ statusCheckRollup: "FAILURE", reviewRequests: [] })],
      errors: [],
    });
    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));

    // The row grows an "Updated" marker and the header shows the count.
    await screen.findByText("Updated");
    expect(screen.getByText("1 changed")).toBeTruthy();
  });

  it("does not flag an unchanged PR across a refresh", async () => {
    fetchTriage.mockResolvedValueOnce({ prs: [pr()], errors: [] });
    render(<App />);
    await screen.findByText("Wire up the widget");

    fetchTriage.mockResolvedValueOnce({ prs: [pr()], errors: [] });
    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));

    // Give the refresh a chance to resolve, then confirm no marker appeared.
    await waitFor(() => expect(fetchTriage).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Updated")).toBeNull();
    expect(screen.queryByText(/changed$/)).toBeNull();
  });
});

describe("RefreshButton — stale note", () => {
  const BASE = 1_700_000_000_000;

  it("shows when the data was updated once it's over 5 minutes old", () => {
    vi.spyOn(Date, "now").mockReturnValue(BASE + 6 * 60_000);
    render(
      <RefreshButton lastUpdated={BASE} loading={false} onRefresh={() => {}} />,
    );
    expect(screen.getByText(/updated 6m ago/i)).toBeTruthy();
  });

  it("stays hidden while the data is still fresh", () => {
    vi.spyOn(Date, "now").mockReturnValue(BASE + 4 * 60_000);
    render(
      <RefreshButton lastUpdated={BASE} loading={false} onRefresh={() => {}} />,
    );
    expect(screen.queryByText(/ago/i)).toBeNull();
  });

  it("stays hidden before the first load", () => {
    vi.spyOn(Date, "now").mockReturnValue(BASE);
    render(
      <RefreshButton lastUpdated={null} loading={false} onRefresh={() => {}} />,
    );
    expect(screen.queryByText(/ago/i)).toBeNull();
  });
});
