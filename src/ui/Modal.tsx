import { useEffect, useRef, type ReactNode } from "react";
import { IconClose } from "./icons";

/** Tabbable elements inside the panel, for the focus trap and initial focus. */
const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function focusables(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1,
  );
}

/**
 * Shared modal chrome: a dimmed overlay plus a centered panel with a titled
 * header and a close button. Dismisses on Escape or a mousedown on the overlay
 * (not the panel) — mousedown rather than click, so a text-selection drag that
 * starts inside the panel and releases on the overlay doesn't close it.
 *
 * Focus is managed for keyboard/screen-reader users: on open, focus moves into
 * the dialog; Tab is trapped within it; and on close, focus returns to whatever
 * had it before (when that element still exists).
 */
export function Modal({
  title,
  ariaLabel,
  onClose,
  children,
}: {
  /** Heading shown in the header. */
  title: string;
  /** Accessible dialog name; defaults to `title`. */
  ariaLabel?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const restoreTo = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel ? focusables(panel)[0] : null;
    (first ?? panel)?.focus();
    // Return focus to the trigger on close (a no-op if it's since unmounted).
    return () => restoreTo?.focus?.();
  }, []);

  // Keep Tab from leaving the dialog while it's open.
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !panelRef.current) return;
    const items = focusables(panelRef.current);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={trapTab}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button
            className="btn btn-ghost btn-icon"
            aria-label="Close"
            onClick={onClose}
          >
            <IconClose />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
