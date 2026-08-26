import { HttpError } from "../lib/util";

function countByStatus(
  results: { status: string }[],
): Record<string, number> {
  const out = { untested: 0, passed: 0, failed: 0, blocked: 0 };
  for (const r of results) {
    if (r.status in out) {
      out[r.status as keyof typeof out] += 1;
    }
  }
  return out;
}

export async function executionReport(db: D1Database, projectId: string, executionId: string) {
  const exec = await db
    .prepare(`SELECT * FROM test_execution WHERE id = ? AND projectId = ?`)
    .bind(executionId, projectId)
    .first();
  if (!exec) throw new HttpError(404, "测试执行不存在");
  const { results } = await db
    .prepare(`SELECT * FROM execution_result WHERE executionId = ?`)
    .bind(executionId)
    .all<{ id: string; status: string; snapshotId: string }>();
  const counts = countByStatus(results ?? []);
  const failed = (results ?? []).filter((r) => r.status === "failed");
  const failedDetails = [];
  for (const f of failed) {
    const snap = await db
      .prepare(`SELECT id, title, caseId FROM execution_case_snapshot WHERE id = ?`)
      .bind(f.snapshotId)
      .first();
    failedDetails.push({ resultId: f.id, snapshot: snap });
  }
  return {
    level: "execution" as const,
    executionId,
    counts,
    failed: failedDetails,
  };
}

export async function planReport(db: D1Database, projectId: string, planId: string) {
  const plan = await db
    .prepare(`SELECT * FROM test_plan WHERE id = ? AND projectId = ?`)
    .bind(planId, projectId)
    .first();
  if (!plan) throw new HttpError(404, "测试计划不存在");
  const { results: executions } = await db
    .prepare(
      `SELECT id FROM test_execution WHERE planId = ? AND projectId = ? AND archivedAt IS NULL`,
    )
    .bind(planId, projectId)
    .all<{ id: string }>();

  const aggregated = { untested: 0, passed: 0, failed: 0, blocked: 0 };
  const perExecution = [];
  for (const e of executions ?? []) {
    const report = await executionReport(db, projectId, e.id);
    perExecution.push(report);
    for (const k of Object.keys(aggregated) as (keyof typeof aggregated)[]) {
      aggregated[k] += report.counts[k] ?? 0;
    }
  }
  return {
    level: "plan" as const,
    planId,
    counts: aggregated,
    executions: perExecution,
  };
}

export async function sprintReport(db: D1Database, projectId: string, sprintId: string) {
  const sprint = await db
    .prepare(`SELECT * FROM sprint WHERE id = ? AND projectId = ?`)
    .bind(sprintId, projectId)
    .first();
  if (!sprint) throw new HttpError(404, "Sprint 不存在");

  const { results: plans } = await db
    .prepare(
      `SELECT id FROM test_plan WHERE sprintId = ? AND projectId = ? AND archivedAt IS NULL`,
    )
    .bind(sprintId, projectId)
    .all<{ id: string }>();

  const aggregated = { untested: 0, passed: 0, failed: 0, blocked: 0 };
  const planReports = [];
  for (const p of plans ?? []) {
    const report = await planReport(db, projectId, p.id);
    planReports.push(report);
    for (const k of Object.keys(aggregated) as (keyof typeof aggregated)[]) {
      aggregated[k] += report.counts[k] ?? 0;
    }
  }

  // Demand coverage: linked cases that were tested / no cases / untested
  const { results: demands } = await db
    .prepare(
      `SELECT id, title FROM demand WHERE projectId = ? AND sprintId = ? AND archivedAt IS NULL`,
    )
    .bind(projectId, sprintId)
    .all<{ id: string; title: string }>();

  const coverage = [];
  for (const d of demands ?? []) {
    const { results: links } = await db
      .prepare(`SELECT caseId FROM case_demand_link WHERE demandId = ?`)
      .bind(d.id)
      .all<{ caseId: string }>();
    if (!links?.length) {
      coverage.push({ demandId: d.id, title: d.title, status: "unlinked" as const });
      continue;
    }
    let anyTested = false;
    let anyUntested = false;
    for (const link of links) {
      const row = await db
        .prepare(
          `SELECT r.status
           FROM execution_result r
           INNER JOIN execution_case_snapshot s ON s.id = r.snapshotId
           INNER JOIN test_execution e ON e.id = r.executionId
           WHERE s.caseId = ? AND e.sprintId = ? AND e.archivedAt IS NULL
           ORDER BY r.updatedAt DESC
           LIMIT 1`,
        )
        .bind(link.caseId, sprintId)
        .first<{ status: string }>();
      if (!row || row.status === "untested") anyUntested = true;
      else anyTested = true;
    }
    const status = anyTested && !anyUntested
      ? ("tested" as const)
      : anyTested
        ? ("partial" as const)
        : ("untested" as const);
    coverage.push({ demandId: d.id, title: d.title, status });
  }

  return {
    level: "sprint" as const,
    sprintId,
    counts: aggregated,
    plans: planReports,
    demandCoverage: {
      tested: coverage.filter((c) => c.status === "tested"),
      unlinked: coverage.filter((c) => c.status === "unlinked"),
      untested: coverage.filter(
        (c) => c.status === "untested" || c.status === "partial",
      ),
      items: coverage,
    },
  };
}
