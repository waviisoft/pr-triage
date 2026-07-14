// Inline SVG icons (Feather, MIT). Stroke-based so they fill the button box
// cleanly at any size — unlike the Unicode glyphs they replace, which render
// small. `currentColor` inherits the button's text color.

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function IconRefresh({
  className,
  size = 18,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg className={className} width={size} height={size} {...base}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

export function IconSettings({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// The app mark: a commit-graph whose three nodes are the triage buckets
// (needs attention / waiting / ready) in the severity colors, each carrying a
// PR row. Self-contained (its own gradient + fills), so it ignores currentColor.
export function IconLogo({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role="img"
      aria-label="PR Triage"
    >
      <defs>
        <linearGradient id="pr-logo-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4c5ee0" />
          <stop offset="1" stopColor="#3a49c2" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="url(#pr-logo-tile)" />
      <line
        x1="152"
        y1="126"
        x2="152"
        y2="386"
        stroke="#fff"
        strokeWidth="20"
        strokeLinecap="round"
      />
      <rect x="214" y="141" width="196" height="22" rx="11" fill="#ccd3f1" />
      <rect x="214" y="245" width="196" height="22" rx="11" fill="#ccd3f1" />
      <rect x="214" y="349" width="196" height="22" rx="11" fill="#ccd3f1" />
      <circle cx="152" cy="152" r="30" fill="#ee4d74" stroke="#fff" strokeWidth="18" />
      <circle cx="152" cy="256" r="30" fill="#f4a52a" stroke="#fff" strokeWidth="18" />
      <circle cx="152" cy="360" r="30" fill="#21a25e" stroke="#fff" strokeWidth="18" />
    </svg>
  );
}

export function IconClose({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...base}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function IconPencil({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

// Bug icon from Lucide (MIT) — Feather has no bug glyph, but Lucide is a
// stroke-compatible fork that matches the set above.
export function IconBug({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="m8 2 1.88 1.88" />
      <path d="M14.12 3.88 16 2" />
      <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
      <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
      <path d="M12 20v-9" />
      <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
      <path d="M6 13H2" />
      <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
      <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
      <path d="M22 13h-4" />
      <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
    </svg>
  );
}
