export type User = {
  id: string;
  email: string;
  name: string;
  role?: string;
};

export const TABS = [
  "overview",
  "demands",
  "sprints",
  "cases",
  "plans",
  "executions",
  "reports",
] as const;

export type Tab = (typeof TABS)[number];

export const TAB_LABEL: Record<Tab, string> = {
  overview: "概览",
  demands: "需求看板",
  sprints: "Sprint",
  cases: "用例库",
  plans: "测试计划",
  executions: "测试执行",
  reports: "测试报告",
};
