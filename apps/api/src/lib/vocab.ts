export const BOARD_COLUMNS = [
  "todo",
  "in_progress",
  "awaiting_acceptance",
  "done",
] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export const SPRINT_STATUSES = [
  "planning",
  "active",
  "completed",
  "cancelled",
] as const;
export type SprintStatus = (typeof SPRINT_STATUSES)[number];

export const CASE_STATUSES = ["draft", "ready", "deprecated"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const RESULT_STATUSES = [
  "untested",
  "passed",
  "failed",
  "blocked",
] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

export const PROJECT_ROLES = ["admin", "member", "readonly"] as const;

export type CaseStep = {
  action: string;
  expected: string;
  imageKey?: string | null;
};

export type ParamGroup = {
  name: string;
  rows: Record<string, string>[];
};
