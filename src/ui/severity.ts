import { Group, type Group as GroupT } from "../triage/types";

export type Severity = "rose" | "amber" | "indigo" | "slate" | "green";

/** Group → stripe/chip severity color. */
export const SEVERITY: Record<GroupT, Severity> = {
  [Group.MERGE_CONFLICT]: "rose",
  [Group.CI_FAILING]: "rose",
  [Group.CHANGES_REQUESTED]: "rose",
  [Group.REVIEW_REQUESTED]: "indigo",
  [Group.READY_TO_MERGE]: "green",
  [Group.NO_REVIEWER]: "amber",
  [Group.DRAFT]: "slate",
  [Group.AWAITING_REVIEW]: "indigo",
  [Group.I_REQUESTED_CHANGES]: "green",
  [Group.I_APPROVED]: "green",
  [Group.UNCLAIMED]: "indigo",
};

/** Short status-chip text per group. */
export const CHIP_LABEL: Record<GroupT, string> = {
  [Group.MERGE_CONFLICT]: "Conflicts",
  [Group.CI_FAILING]: "CI failing",
  [Group.CHANGES_REQUESTED]: "Changes requested",
  [Group.REVIEW_REQUESTED]: "Review requested",
  [Group.READY_TO_MERGE]: "Approved",
  [Group.NO_REVIEWER]: "No reviewer",
  [Group.DRAFT]: "Draft",
  [Group.AWAITING_REVIEW]: "Awaiting review",
  [Group.I_REQUESTED_CHANGES]: "You requested changes",
  [Group.I_APPROVED]: "You approved",
  [Group.UNCLAIMED]: "Unclaimed",
};
