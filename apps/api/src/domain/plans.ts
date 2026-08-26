import { HttpError, newId, nowIso } from "../lib/util";

export async function createPlan(
  db: D1Database,
  projectId: string,
  sprintId: string,
  name: string,
  now?: () => Date,
) {
  if (!name?.trim()) throw new HttpError(400, "计划名称必填");
  const sprint = await db
    .prepare(
      `SELECT id FROM sprint WHERE id = ? AND projectId = ? AND archivedAt IS NULL`,
    )
    .bind(sprintId, projectId)
    .first();
  if (!sprint) throw new HttpError(400, "Sprint 不存在");
  const id = newId();
  const ts = nowIso(now);
  await db
    .prepare(
      `INSERT INTO test_plan (id, projectId, sprintId, name, archivedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, NULL, ?, ?)`,
    )
    .bind(id, projectId, sprintId, name.trim(), ts, ts)
    .run();
  return getPlan(db, id);
}

export async function getPlan(db: D1Database, id: string) {
  const row = await db.prepare(`SELECT * FROM test_plan WHERE id = ?`).bind(id).first();
  if (!row) throw new HttpError(404, "测试计划不存在");
  const cases = await listPlanCases(db, id);
  return { ...row, caseIds: cases };
}

export async function listPlans(
  db: D1Database,
  projectId: string,
  sprintId?: string,
  includeArchived = false,
) {
  const clauses = [`projectId = ?`];
  const binds: unknown[] = [projectId];
  if (sprintId) {
    clauses.push(`sprintId = ?`);
    binds.push(sprintId);
  }
  if (!includeArchived) clauses.push(`archivedAt IS NULL`);
  const { results } = await db
    .prepare(
      `SELECT * FROM test_plan WHERE ${clauses.join(" AND ")} ORDER BY createdAt DESC`,
    )
    .bind(...binds)
    .all();
  return results ?? [];
}

async function listPlanCases(db: D1Database, planId: string) {
  const { results } = await db
    .prepare(`SELECT caseId FROM test_plan_case WHERE planId = ?`)
    .bind(planId)
    .all<{ caseId: string }>();
  return (results ?? []).map((r) => r.caseId);
}

export async function setPlanCases(
  db: D1Database,
  projectId: string,
  planId: string,
  caseIds: string[],
  now?: () => Date,
) {
  const plan = await db
    .prepare(`SELECT * FROM test_plan WHERE id = ? AND projectId = ?`)
    .bind(planId, projectId)
    .first<{ archivedAt: string | null }>();
  if (!plan) throw new HttpError(404, "测试计划不存在");
  if (plan.archivedAt) throw new HttpError(400, "已归档计划不可改清单");

  for (const caseId of caseIds) {
    const c = await db
      .prepare(
        `SELECT id, status, archivedAt FROM test_case WHERE id = ? AND projectId = ?`,
      )
      .bind(caseId, projectId)
      .first<{ status: string; archivedAt: string | null }>();
    if (!c || c.archivedAt) throw new HttpError(400, `用例不可用: ${caseId}`);
    if (c.status !== "ready") {
      throw new HttpError(400, `仅就绪用例可加入计划: ${caseId}`);
    }
  }

  await db.prepare(`DELETE FROM test_plan_case WHERE planId = ?`).bind(planId).run();
  for (const caseId of caseIds) {
    await db
      .prepare(`INSERT INTO test_plan_case (planId, caseId) VALUES (?, ?)`)
      .bind(planId, caseId)
      .run();
  }
  const ts = nowIso(now);
  await db
    .prepare(`UPDATE test_plan SET updatedAt = ? WHERE id = ?`)
    .bind(ts, planId)
    .run();
  return getPlan(db, planId);
}

export async function archivePlan(
  db: D1Database,
  projectId: string,
  planId: string,
  now?: () => Date,
) {
  const ts = nowIso(now);
  const result = await db
    .prepare(
      `UPDATE test_plan SET archivedAt = ?, updatedAt = ? WHERE id = ? AND projectId = ? AND archivedAt IS NULL`,
    )
    .bind(ts, ts, planId, projectId)
    .run();
  if (!result.meta.changes) throw new HttpError(404, "计划不存在或已归档");
  return { id: planId, archivedAt: ts };
}
