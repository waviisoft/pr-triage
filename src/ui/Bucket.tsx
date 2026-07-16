import type { BucketView } from "../triage/group";
import { prKey, type ChangeInfo } from "../triage/changes";
import { PrRow } from "./PrRow";

/** Fallback text shown in the dashed empty box per bucket. */
const EMPTY_MESSAGE: Record<string, string> = {
  "needs-me": "Nothing needs your attention right now. 🎉",
  waiting: "You're not waiting on anyone.",
  "pick-up": "No unclaimed reviews to grab.",
};

export function Bucket({
  view,
  changes,
  emptyNote,
}: {
  view: BucketView;
  /** Per-PR change markers (keyed by `prKey`) since the last refresh. */
  changes?: Map<string, ChangeInfo>;
  /** Overrides the default dashed-box text when the bucket is empty. */
  emptyNote?: string;
}) {
  return (
    <section className="bucket">
      <div className="bucket-head">
        <h2>{view.title}</h2>
        <span className="bucket-count">{view.count}</span>
      </div>

      {view.groups.length === 0 ? (
        <div className="empty">{emptyNote ?? EMPTY_MESSAGE[view.bucket]}</div>
      ) : (
        view.groups.map((section) => (
          <div key={section.group} className="group">
            <div className="group-label">{section.label}</div>
            <div className="rows">
              {section.prs.map((item) => (
                <PrRow
                  key={item.pr.url}
                  item={item}
                  change={changes?.get(prKey(item.pr))}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
