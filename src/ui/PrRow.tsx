import type { ChangeInfo } from "../triage/changes";
import type { ClassifiedPR } from "../triage/types";
import { safeHref } from "./links";
import { CHIP_LABEL, SEVERITY } from "./severity";

/** Compact "3d ago" style relative time from an ISO string. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  const mins = Math.round(secs / 60);
  const hrs = Math.round(mins / 60);
  const days = Math.round(hrs / 24);
  if (secs < 60) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

export function PrRow({
  item,
  change,
}: {
  item: ClassifiedPR;
  /** Set when this PR moved triage group / newly appeared since the last refresh. */
  change?: ChangeInfo;
}) {
  const { pr, group, reason, mine } = item;
  const severity = group ? SEVERITY[group] : "slate";
  const chip = group ? CHIP_LABEL[group] : "";
  const showCi =
    pr.statusCheckRollup && pr.statusCheckRollup !== "EXPECTED"
      ? pr.statusCheckRollup
      : null;

  return (
    <a
      className="row"
      data-severity={severity}
      data-changed={change ? change.kind : undefined}
      href={safeHref(pr.url)}
      target="_blank"
      rel="noreferrer"
    >
      <span className="row-num">#{pr.number}</span>

      <div className="row-title">{pr.title}</div>
      <div className="row-meta">
        <span className="repo">{pr.repository}</span>
        <span className="sep">·</span>
        <span>
          {mine ? (
            <span className="you-tag">you</span>
          ) : (
            `${pr.authorLogin} · `
          )}
          {reason}
        </span>
        <span className="meta-part">
          <span className="sep">·</span>
          <span title={new Date(pr.updatedAt).toLocaleString()}>
            {relativeTime(pr.updatedAt)}
          </span>
        </span>
        {pr.mergeable === "CONFLICTING" && group !== "merge-conflict" ? (
          <span className="meta-part">
            <span className="sep">·</span>
            <span style={{ color: "var(--rose)" }}>conflicts</span>
          </span>
        ) : null}
      </div>

      <div className="row-right">
        {change ? (
          <span
            className="change-flag"
            data-kind={change.kind}
            title={change.reason}
          >
            {change.kind === "new" ? "New" : "Updated"}
          </span>
        ) : null}
        {showCi ? (
          <span
            className="ci-dot"
            data-ci={showCi}
            title={`CI: ${showCi.toLowerCase()}`}
          />
        ) : null}
        {chip ? <span className="chip">{chip}</span> : null}
      </div>
    </a>
  );
}
