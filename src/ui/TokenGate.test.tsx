// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TokenGate } from "./TokenGate";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TokenGate — welcome page", () => {
  it("triggers demo mode from the primary button", () => {
    const onDemo = vi.fn();
    render(<TokenGate onAdd={vi.fn()} onDemo={onDemo} />);

    fireEvent.click(screen.getByRole("button", { name: /view live demo/i }));
    expect(onDemo).toHaveBeenCalledTimes(1);
  });

  it("keeps the token form behind a modal, not on the page", async () => {
    render(<TokenGate onAdd={vi.fn()} onDemo={vi.fn()} />);

    // No token field visible until asked for.
    expect(screen.queryByLabelText(/GitHub token/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /add a token/i }));
    await screen.findByRole("dialog", { name: /add a token/i });
    expect(screen.getByLabelText(/GitHub token/i)).toBeTruthy();

    // Escape dismisses the modal.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /add a token/i })).toBeNull();
  });
});
