// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the GitHub layer so <App/> mounts straight into the dashboard with one
// saved token and no network.
const { saveTokens } = vi.hoisted(() => ({ saveTokens: vi.fn() }));
vi.mock("../github/client", () => ({
  getTokens: () => [{ id: "1", label: "me", token: "tok" }],
  saveTokens,
  makeToken: (label: string, token: string) => ({ id: "new", label, token }),
  suggestLabel: () => "auto",
  ownersOf: () => [],
  resolveLogin: vi.fn(async () => "me"),
  fetchTriageForTokens: vi.fn(async () => ({ prs: [], errors: [] })),
  fetchCatalog: vi.fn(async () => ({ login: "me", orgs: [], repos: [] })),
  tokensForScope: (_scope: unknown, tokens: unknown) => tokens,
  hasPendingMergeable: () => false,
}));

import { App } from "./App";

afterEach(() => {
  vi.clearAllMocks();
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

    // Remove the only token → back to the gate.
    fireEvent.click(screen.getByRole("button", { name: /remove me/i }));

    const field = await screen.findByLabelText(/GitHub token/i);
    expect(field).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByText("Needs my attention")).toBeNull(),
    );
    expect(saveTokens).toHaveBeenCalled();
  });
});
