import { HttpError, newId, nowIso } from "../lib/util";
import type { BoardColumn } from "../lib/vocab";
import { assertBoardColumn } from "./projects";

export type DemandInput = {
  title: string;
  description?: string | null;
  priority: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  storyPoints?: number | null;
  boardColumn?: BoardColumn;
  sprintId?: string | null;
};

export async function createDemand(
  db: D1Database,
  projectId: string,
  input: DemandInput,
  now?: () => Date,
) {
  if (!input.title?.trim()) throw new HttpError(400, "标题必填");
  const id = newId();
  const ts = nowIso(now);
  const boardColumn = assertBoardColumn(input.boardColumn ?? "todo");
  if (input.sprintId) {
    await assertSprintInProject(db, projectId, input.sprintId);
  }
  await db
    .prepare(
      `INSERT INTO demand (id, projectId, title, description, priority, assigneeId, dueDate, storyPoints, boardColumn, sprintId, archivedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    )
    .bind(
      id,
      projectId,
      input.title.trim(),
      input.description ?? null,
      input.priority,
      input.assigneeId ?? null,
      input.dueDate ?? null,
      input.storyPoints ?? null,
      boardColumn,
      input.sprintId ?? null,
      ts,
      ts,
    )
    .run();
  return getDemand(db, id);
}

export async function getDemand(db: D1Database, id: string) {
  const row = await db
    .prepare(`SELECT * FROM demand WHERE id = ?`)
    .bind(id)
    .first();
  if (!row) throw new HttpError(404, "需求不存在");
  return row;
}

export async function listDemands(
  db: D1Database,
  projectId: string,
  opts: { includeArchived?: boolean; sprintId?: string | null | "backlog" } = {},
) {
  const clauses = [`projectId = ?`];
  const binds: unknown[] = [projectId];
  if (!opts.includeArchived) clauses.push(`archivedAt IS NULL`);
  if (opts.sprintId === "backlog") {
    clauses.push(`sprintId IS NULL`);
  } else if (opts.sprintId) {
    clauses.push(`sprintId = ?`);
    binds.push(opts.sprintId);
  }
  const { results } = await db
    .prepare(
      `SELECT * FROM demand WHERE ${clauses.join(" AND ")} ORDER BY createdAt DESC`,
    )
    .bind(...binds)
    .all();
  return results ?? [];
}

export async function updateDemand(
  db: D1Database,
  demandId: string,
  projectId: string,
  patch: Partial<DemandInput> & { boardColumn?: BoardColumn },
  now?: () => Date,
) {
  const existing = await db
    .prepare(`SELECT * FROM demand WHERE id = ? AND projectId = ?`)
    .bind(demandId, projectId)
    .first<{ archivedAt: string | null; sprintId: string | null }>();
  if (!existing) throw new HttpError(404, "需求不存在");
  if (existing.archivedAt) throw new HttpError(400, "已归档需求不可编辑");

  if (patch.sprintId !== undefined && patch.sprintId !== null) {
    await assertSprintInProject(db, projectId, patch.sprintId);
  }

  const ts = nowIso(now);
  await db
    .prepare(
      `UPDATE demand SET
        title = COALESCE(?, title),
        description = CASE WHEN ? THEN ? ELSE description END,
        priority = COALESCE(?, priority),
        assigneeId = CASE WHEN ? THEN ? ELSE assigneeId END,
        dueDate = CASE WHEN ? THEN ? ELSE dueDate END,
        storyPoints = CASE WHEN ? THEN ? ELSE storyPoints END,
        boardColumn = COALESCE(?, boardColumn),
        sprintId = CASE WHEN ? THEN ? ELSE sprintId END,
        updatedAt = ?
       WHERE id = ?`,
    )
    .bind(
      patch.title ?? null,
      patch.description !== undefined ? 1 : 0,
      patch.description ?? null,
      patch.priority ?? null,
      patch.assigneeId !== undefined ? 1 : 0,
      patch.assigneeId ?? null,
      patch.dueDate !== undefined ? 1 : 0,
      patch.dueDate ?? null,
      patch.storyPoints !== undefined ? 1 : 0,
      patch.storyPoints ?? null,
      patch.boardColumn ? assertBoardColumn(patch.boardColumn) : null,
      patch.sprintId !== undefined ? 1 : 0,
      patch.sprintId ?? null,
      ts,
      demandId,
    )
    .run();
  return getDemand(db, demandId);
}

export async function archiveDemand(
  db: D1Database,
  demandId: string,
  projectId: string,
  now?: () => Date,
) {
  const ts = nowIso(now);
  const result = await db
    .prepare(
      `UPDATE demand SET archivedAt = ?, updatedAt = ? WHERE id = ? AND projectId = ? AND archivedAt IS NULL`,
    )
    .bind(ts, ts, demandId, projectId)
    .run();
  if (!result.meta.changes) throw new HttpError(404, "需求不存在或已归档");
  return { id: demandId, archivedAt: ts };
}

export async function moveDemandBoard(
  db: D1Database,
  demandId: string,
  projectId: string,
  boardColumn: string,
  now?: () => Date,
) {
  return updateDemand(
    db,
    demandId,
    projectId,
    { boardColumn: assertBoardColumn(boardColumn) },
    now,
  );
}

async function assertSprintInProject(
  db: D1Database,
  projectId: string,
  sprintId: string,
) {
  const row = await db
    .prepare(
      `SELECT id FROM sprint WHERE id = ? AND projectId = ? AND archivedAt IS NULL`,
    )
    .bind(sprintId, projectId)
    .first();
  if (!row) throw new HttpError(400, "Sprint 不存在");
}

export async function createSubtask(
  db: D1Database,
  projectId: string,
  demandId: string,
  input: { title: string; description?: string | null; storyPoints?: number | null },
  now?: () => Date,
) {
  const demand = await db
    .prepare(
      `SELECT id FROM demand WHERE id = ? AND projectId = ? AND archivedAt IS NULL`,
    )
    .bind(demandId, projectId)
    .first();
  if (!demand) throw new HttpError(404, "需求不存在");
  if (!input.title?.trim()) throw new HttpError(400, "标题必填");
  const id = newId();
  const ts = nowIso(now);
  await db
    .prepare(
      `INSERT INTO subtask (id, projectId, demandId, title, description, storyPoints, archivedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    )
    .bind(
      id,
      projectId,
      demandId,
      input.title.trim(),
      input.description ?? null,
      input.storyPoints ?? null,
      ts,
      ts,
    )
    .run();
  return db.prepare(`SELECT * FROM subtask WHERE id = ?`).bind(id).first();
}

export async function updateSubtask(
  db: D1Database,
  projectId: string,
  subtaskId: string,
  patch: { title?: string; description?: string | null; storyPoints?: number | null },
  now?: () => Date,
) {
  const existing = await db
    .prepare(`SELECT * FROM subtask WHERE id = ? AND projectId = ?`)
    .bind(subtaskId, projectId)
    .first<{ archivedAt: string | null }>();
  if (!existing) throw new HttpError(404, "子任务不存在");
  if (existing.archivedAt) throw new HttpError(400, "已归档子任务不可编辑");
  const ts = nowIso(now);
  await db
    .prepare(
      `UPDATE subtask SET
        title = COALESCE(?, title),
        description = CASE WHEN ? THEN ? ELSE description END,
        storyPoints = CASE WHEN ? THEN ? ELSE storyPoints END,
        updatedAt = ?
       WHERE id = ?`,
    )
    .bind(
      patch.title ?? null,
      patch.description !== undefined ? 1 : 0,
      patch.description ?? null,
      patch.storyPoints !== undefined ? 1 : 0,
      patch.storyPoints ?? null,
      ts,
      subtaskId,
    )
    .run();
  return db.prepare(`SELECT * FROM subtask WHERE id = ?`).bind(subtaskId).first();
}

export async function archiveSubtask(
  db: D1Database,
  projectId: string,
  subtaskId: string,
  now?: () => Date,
) {
  const ts = nowIso(now);
  const result = await db
    .prepare(
      `UPDATE subtask SET archivedAt = ?, updatedAt = ? WHERE id = ? AND projectId = ? AND archivedAt IS NULL`,
    )
    .bind(ts, ts, subtaskId, projectId)
    .run();
  if (!result.meta.changes) throw new HttpError(404, "子任务不存在或已归档");
  return { id: subtaskId, archivedAt: ts };
}

export async function listSubtasks(
  db: D1Database,
  projectId: string,
  demandId: string,
  includeArchived = false,
) {
  const sql = includeArchived
    ? `SELECT * FROM subtask WHERE projectId = ? AND demandId = ? ORDER BY createdAt ASC`
    : `SELECT * FROM subtask WHERE projectId = ? AND demandId = ? AND archivedAt IS NULL ORDER BY createdAt ASC`;
  const { results } = await db.prepare(sql).bind(projectId, demandId).all();
  return results ?? [];
}
