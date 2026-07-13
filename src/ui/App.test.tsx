// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the GitHub layer so <App/> mounts straight into the dashboard with no
// network. `getToken` returning a value makes App skip the gate on first render.
const { forgetToken } = vi.hoisted(() => ({ forgetToken: vi.fn() }));
vi.mock("../github/client", () => ({
  getToken: () => "seed-token",
  setToken: vi.fn(),
  forgetToken,
  fetchViewerLogin: vi.fn(async () => "me"),
  fetchTriagePRs: vi.fn(async () => []),
  hasPendingMergeable: () => false,
}));

import { App } from "./App";

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("App — forget token", () => {
  it("returns to the token entry screen and clears the token", async () => {
    render(<App />);

    // Dashboard has loaded (viewer resolved, buckets rendered).
    await screen.findByText("Needs my attention");
    // The token-entry field is NOT present while signed in.
    expect(screen.queryByLabelText(/fine-grained token/i)).toBeNull();

    // Open the settings menu and click "Forget token".
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /forget token/i }));

    // We're back on the token-entry screen...
    const field = await screen.findByLabelText(/fine-grained token/i);
    expect(field).toBeTruthy();
    // ...the dashboard is gone...
    await waitFor(() =>
      expect(screen.queryByText("Needs my attention")).toBeNull(),
    );
    // ...and the stored token was cleared.
    expect(forgetToken).toHaveBeenCalledTimes(1);
  });
});
