import type { Severity } from "./severity";

interface TileProps {
  count: number;
  label: string;
  severity?: Severity;
}

/** One of the four summary tiles at the top of the page. */
export function Tile({ count, label, severity }: TileProps) {
  return (
    <div className="tile" data-severity={severity}>
      <div className="tile-count">{count}</div>
      <div className="tile-label">{label}</div>
    </div>
  );
}
