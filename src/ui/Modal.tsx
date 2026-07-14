import { useEffect, type ReactNode } from "react";
import { IconClose } from "./icons";

/**
 * Shared modal chrome: a dimmed overlay plus a centered panel with a titled
 * header and a close button. Dismisses on Escape or a mousedown on the overlay
 * (not the panel) — mousedown rather than click, so a text-selection drag that
 * starts inside the panel and releases on the overlay doesn't close it.
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title}
        onMouseDown={(e) => e.stopPropagation()}
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
