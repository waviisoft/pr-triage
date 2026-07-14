// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WelcomePage } from "./WelcomePage";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WelcomePage", () => {
  it("triggers demo mode from the primary button", () => {
    const onDemo = vi.fn();
    render(<WelcomePage onAdd={vi.fn()} onDemo={onDemo} />);

    fireEvent.click(screen.getByRole("button", { name: /view live demo/i }));
    expect(onDemo).toHaveBeenCalledTimes(1);
  });

  it("keeps the token form behind a modal, not on the page", async () => {
    render(<WelcomePage onAdd={vi.fn()} onDemo={vi.fn()} />);

    // No token field visible until asked for.
    expect(screen.queryByLabelText(/GitHub token/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /add a token/i }));
    const dialog = await screen.findByRole("dialog", { name: /add a token/i });
    expect(screen.getByLabelText(/GitHub token/i)).toBeTruthy();
    // Focus moved into the dialog on open (a11y).
    expect(dialog.contains(document.activeElement)).toBe(true);

    // Escape dismisses the modal.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /add a token/i })).toBeNull();
  });

  it("opens a full-size lightbox from the screenshot", async () => {
    render(<WelcomePage onAdd={vi.fn()} onDemo={vi.fn()} />);

    fireEvent.click(
      screen.getByRole("button", { name: /view the sample board full size/i }),
    );
    await screen.findByRole("dialog", { name: /sample board, full size/i });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: /sample board, full size/i }),
    ).toBeNull();
  });
});
