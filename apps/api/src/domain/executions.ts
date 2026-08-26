import { HttpError, newId, nowIso } from "../lib/util";
import type { ResultStatus } from "../lib/vocab";
import { RESULT_STATUSES } from "../lib/vocab";
import { assertSprintActiveForExecution } from "./sprints";

export async function startExecution(
  db: D1Database,
  projectId: string,
  planId: string,
  name: string | undefined,
  now?: () => Date,
) {
  const plan = await db
    .prepare(
      `SELECT * FROM test_plan WHERE id = ? AND projectId = ? AND archivedAt IS NULL`,
    )
    .bind(planId, projectId)
    .first<{ id: string; sprintId: string; name: string }>();
  if (!plan) throw new HttpError(404, "测试计划不存在");
  await assertSprintActiveForExecution(db, plan.sprintId);

  const { results: caseLinks } = await db
    .prepare(`SELECT caseId FROM test_plan_case WHERE planId = ?`)
    .bind(planId)
    .all<{ caseId: string }>();
  if (!caseLinks?.length) throw new HttpError(400, "计划中没有用例");

  const executionId = newId();
  const ts = nowIso(now);
  await db
    .prepare(
      `INSERT INTO test_execution (id, projectId, planId, sprintId, name, status, archivedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 'in_progress', NULL, ?, ?)`,
    )
    .bind(
      executionId,
      projectId,
      planId,
      plan.sprintId,
      name ?? `${plan.name} 执行`,
      ts,
      ts,
    )
    .run();

  let order = 0;
  for (const link of caseLinks) {
    const c = await db
      .prepare(`SELECT * FROM test_case WHERE id = ?`)
      .bind(link.caseId)
      .first<{
        id: string;
        title: string;
        description: string | null;
        precondition: string | null;
        stepsJson: string;
        paramsJson: string | null;
      }>();
    if (!c) continue;
    const snapshotId = newId();
    const resultId = newId();
    await db
      .prepare(
        `INSERT INTO execution_case_snapshot
          (id, executionId, caseId, title, description, precondition, stepsJson, paramsJson, sortOrder)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        snapshotId,
        executionId,
        c.id,
        c.title,
        c.description,
        c.precondition,
        c.stepsJson,
        c.paramsJson,
        order++,
      )
      .run();
    await db
      .prepare(
        `INSERT INTO execution_result (id, executionId, snapshotId, status, lastEditorId, updatedAt)
         VALUES (?, ?, ?, 'untested', NULL, ?)`,
      )
      .bind(resultId, executionId, snapshotId, ts)
      .run();
  }

  return getExecution(db, executionId);
}

export async function getExecution(db: D1Database, id: string) {
  const row = await db
    .prepare(`SELECT * FROM test_execution WHERE id = ?`)
    .bind(id)
    .first();
  if (!row) throw new HttpError(404, "测试执行不存在");
  const snapshots = await listSnapshots(db, id);
  const results = await listResults(db, id);
  return { ...row, snapshots, results };
}

async function listSnapshots(db: D1Database, executionId: string) {
  const { results } = await db
    .prepare(
      `SELECT * FROM execution_case_snapshot WHERE executionId = ? ORDER BY sortOrder ASC`,
    )
    .bind(executionId)
    .all();
  return (results ?? []).map((r) => ({
    ...r,
    steps: JSON.parse(String((r as { stepsJson: string }).stepsJson ?? "[]")),
    params: JSON.parse(String((r as { paramsJson: string | null }).paramsJson ?? "[]")),
  }));
}

async function listResults(db: D1Database, executionId: string) {
  const { results } = await db
    .prepare(`SELECT * FROM execution_result WHERE executionId = ?`)
    .bind(executionId)
    .all();
  return results ?? [];
}

export async function listExecutions(
  db: D1Database,
  projectId: string,
  planId?: string,
  includeArchived = false,
) {
  const clauses = [`projectId = ?`];
  const binds: unknown[] = [projectId];
  if (planId) {
    clauses.push(`planId = ?`);
    binds.push(planId);
  }
  if (!includeArchived) clauses.push(`archivedAt IS NULL`);
  const { results } = await db
    .prepare(
      `SELECT * FROM test_execution WHERE ${clauses.join(" AND ")} ORDER BY createdAt DESC`,
    )
    .bind(...binds)
    .all();
  return results ?? [];
}

export async function updateResultStatus(
  db: D1Database,
  projectId: string,
  executionId: string,
  resultId: string,
  status: ResultStatus,
  editorId: string,
  now?: () => Date,
) {
  if (!(RESULT_STATUSES as readonly string[]).includes(status)) {
    throw new HttpError(400, "无效结果状态");
  }
  const exec = await db
    .prepare(
      `SELECT id, status, archivedAt FROM test_execution WHERE id = ? AND projectId = ?`,
    )
    .bind(executionId, projectId)
    .first<{ status: string; archivedAt: string | null }>();
  if (!exec) throw new HttpError(404, "测试执行不存在");
  if (exec.archivedAt) throw new HttpError(400, "已归档执行不可改");

  const ts = nowIso(now);
  const result = await db
    .prepare(
      `UPDATE execution_result SET status = ?, lastEditorId = ?, updatedAt = ?
       WHERE id = ? AND executionId = ?`,
    )
    .bind(status, editorId, ts, resultId, executionId)
    .run();
  if (!result.meta.changes) throw new HttpError(404, "结果不存在");
  return db
    .prepare(`SELECT * FROM execution_result WHERE id = ?`)
    .bind(resultId)
    .first();
}

export async function addResultComment(
  db: D1Database,
  projectId: string,
  executionId: string,
  resultId: string,
  authorId: string,
  body: string,
  now?: () => Date,
) {
  if (!body?.trim()) throw new HttpError(400, "评论不能为空");
  const exec = await db
    .prepare(`SELECT id FROM test_execution WHERE id = ? AND projectId = ?`)
    .bind(executionId, projectId)
    .first();
  if (!exec) throw new HttpError(404, "测试执行不存在");
  const result = await db
    .prepare(
      `SELECT id FROM execution_result WHERE id = ? AND executionId = ?`,
    )
    .bind(resultId, executionId)
    .first();
  if (!result) throw new HttpError(404, "结果不存在");
  const id = newId();
  const ts = nowIso(now);
  await db
    .prepare(
      `INSERT INTO result_comment (id, resultId, authorId, body, createdAt) VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(id, resultId, authorId, body.trim(), ts)
    .run();
  return { id, resultId, authorId, body: body.trim(), createdAt: ts };
}

export async function listResultComments(db: D1Database, resultId: string) {
  const { results } = await db
    .prepare(
      `SELECT * FROM result_comment WHERE resultId = ? ORDER BY createdAt ASC`,
    )
    .bind(resultId)
    .all();
  return results ?? [];
}

export async function archiveExecution(
  db: D1Database,
  projectId: string,
  executionId: string,
  now?: () => Date,
) {
  const ts = nowIso(now);
  const result = await db
    .prepare(
      `UPDATE test_execution SET archivedAt = ?, updatedAt = ? WHERE id = ? AND projectId = ? AND archivedAt IS NULL`,
    )
    .bind(ts, ts, executionId, projectId)
    .run();
  if (!result.meta.changes) throw new HttpError(404, "执行不存在或已归档");
  return { id: executionId, archivedAt: ts };
}

export async function createAttachment(
  db: D1Database,
  input: {
    projectId: string;
    kind: "step_image" | "result" | "result_comment";
    ownerId: string;
    storageKey: string;
    filename: string;
    contentType: string;
    createdBy: string;
  },
  now?: () => Date,
) {
  const id = newId();
  const ts = nowIso(now);
  await db
    .prepare(
      `INSERT INTO attachment (id, projectId, kind, ownerId, storageKey, filename, contentType, createdBy, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.projectId,
      input.kind,
      input.ownerId,
      input.storageKey,
      input.filename,
      input.contentType,
      input.createdBy,
      ts,
    )
    .run();
  return { id, ...input, createdAt: ts };
}

export async function getAttachment(db: D1Database, id: string) {
  const row = await db
    .prepare(`SELECT * FROM attachment WHERE id = ?`)
    .bind(id)
    .first();
  if (!row) throw new HttpError(404, "附件不存在");
  return row;
}
