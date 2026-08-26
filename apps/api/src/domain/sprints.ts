import { HttpError, newId, nowIso } from "../lib/util";
import type { SprintStatus } from "../lib/vocab";
import { SPRINT_STATUSES } from "../lib/vocab";

export type SprintInput = {
  name: string;
  startDate: string;
  endDate: string;
  capacityLimit: number;
};

/** Demand story points only — subtask points never included. */
export async function sumDemandPointsInSprint(
  db: D1Database,
  sprintId: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(storyPoints), 0) AS total
       FROM demand
       WHERE sprintId = ? AND archivedAt IS NULL`,
    )
    .bind(sprintId)
    .first<{ total: number }>();
  return Number(row?.total ?? 0);
}

export async function remainingDemandPoints(
  db: D1Database,
  sprintId: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(storyPoints), 0) AS total
       FROM demand
       WHERE sprintId = ?
         AND archivedAt IS NULL
         AND boardColumn != 'done'`,
    )
    .bind(sprintId)
    .first<{ total: number }>();
  return Number(row?.total ?? 0);
}

export async function createSprint(
  db: D1Database,
  projectId: string,
  input: SprintInput,
  now?: () => Date,
) {
  if (!input.name?.trim()) throw new HttpError(400, "名称必填");
  if (!Number.isFinite(input.capacityLimit) || input.capacityLimit < 0) {
    throw new HttpError(400, "容量上限无效");
  }
  const id = newId();
  const ts = nowIso(now);
  await db
    .prepare(
      `INSERT INTO sprint (id, projectId, name, startDate, endDate, capacityLimit, status, lockedCapacity, archivedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'planning', NULL, NULL, ?, ?)`,
    )
    .bind(
      id,
      projectId,
      input.name.trim(),
      input.startDate,
      input.endDate,
      input.capacityLimit,
      ts,
      ts,
    )
    .run();
  return getSprint(db, id);
}

export async function getSprint(db: D1Database, id: string) {
  const row = await db.prepare(`SELECT * FROM sprint WHERE id = ?`).bind(id).first();
  if (!row) throw new HttpError(404, "Sprint 不存在");
  return row;
}

export async function listSprints(
  db: D1Database,
  projectId: string,
  includeArchived = false,
) {
  const sql = includeArchived
    ? `SELECT * FROM sprint WHERE projectId = ? ORDER BY createdAt DESC`
    : `SELECT * FROM sprint WHERE projectId = ? AND archivedAt IS NULL ORDER BY createdAt DESC`;
  const { results } = await db.prepare(sql).bind(projectId).all();
  return results ?? [];
}

export async function transitionSprint(
  db: D1Database,
  projectId: string,
  sprintId: string,
  nextStatus: SprintStatus,
  now?: () => Date,
) {
  if (!(SPRINT_STATUSES as readonly string[]).includes(nextStatus)) {
    throw new HttpError(400, "无效状态");
  }
  const sprint = await db
    .prepare(`SELECT * FROM sprint WHERE id = ? AND projectId = ?`)
    .bind(sprintId, projectId)
    .first<{
      status: string;
      archivedAt: string | null;
      capacityLimit: number;
    }>();
  if (!sprint) throw new HttpError(404, "Sprint 不存在");
  if (sprint.archivedAt) throw new HttpError(400, "已归档 Sprint 不可变更");

  const from = sprint.status as SprintStatus;
  const allowed =
    (from === "planning" && (nextStatus === "active" || nextStatus === "cancelled")) ||
    (from === "active" &&
      (nextStatus === "completed" || nextStatus === "cancelled"));
  if (!allowed) {
    throw new HttpError(400, `不能从 ${from} 转到 ${nextStatus}`);
  }

  if (nextStatus === "active") {
    const active = await db
      .prepare(
        `SELECT id FROM sprint WHERE projectId = ? AND status = 'active' AND archivedAt IS NULL AND id != ?`,
      )
      .bind(projectId, sprintId)
      .first();
    if (active) {
      throw new HttpError(400, "同一项目同时只能有一个进行中的 Sprint");
    }
    const committed = await sumDemandPointsInSprint(db, sprintId);
    const ts = nowIso(now);
    await db
      .prepare(
        `UPDATE sprint SET status = 'active', lockedCapacity = ?, updatedAt = ? WHERE id = ?`,
      )
      .bind(committed, ts, sprintId)
      .run();
  } else {
    const ts = nowIso(now);
    await db
      .prepare(`UPDATE sprint SET status = ?, updatedAt = ? WHERE id = ?`)
      .bind(nextStatus, ts, sprintId)
      .run();
  }
  return getSprint(db, sprintId);
}

export async function archiveSprint(
  db: D1Database,
  projectId: string,
  sprintId: string,
  now?: () => Date,
) {
  const ts = nowIso(now);
  const result = await db
    .prepare(
      `UPDATE sprint SET archivedAt = ?, updatedAt = ? WHERE id = ? AND projectId = ? AND archivedAt IS NULL`,
    )
    .bind(ts, ts, sprintId, projectId)
    .run();
  if (!result.meta.changes) throw new HttpError(404, "Sprint 不存在或已归档");
  return { id: sprintId, archivedAt: ts };
}

export async function getBurndown(
  db: D1Database,
  projectId: string,
  sprintId: string,
) {
  const sprint = await db
    .prepare(`SELECT * FROM sprint WHERE id = ? AND projectId = ?`)
    .bind(sprintId, projectId)
    .first<{
      startDate: string;
      endDate: string;
      lockedCapacity: number | null;
      capacityLimit: number;
      status: string;
    }>();
  if (!sprint) throw new HttpError(404, "Sprint 不存在");

  const committed =
    sprint.lockedCapacity ?? (await sumDemandPointsInSprint(db, sprintId));
  const remaining = await remainingDemandPoints(db, sprintId);
  const subtaskPoints = await db
    .prepare(
      `SELECT COALESCE(SUM(s.storyPoints), 0) AS total
       FROM subtask s
       INNER JOIN demand d ON d.id = s.demandId
       WHERE d.sprintId = ? AND s.archivedAt IS NULL AND d.archivedAt IS NULL`,
    )
    .bind(sprintId)
    .first<{ total: number }>();

  return {
    sprintId,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    capacityLimit: sprint.capacityLimit,
    lockedCapacity: sprint.lockedCapacity,
    committedDemandPoints: committed,
    remainingDemandPoints: remaining,
    /** Explicit: subtask points are tracked but excluded from capacity/burndown. */
    excludedSubtaskPoints: Number(subtaskPoints?.total ?? 0),
    points: [
      { date: sprint.startDate, remaining: committed },
      { date: sprint.endDate, remaining },
    ],
  };
}

export async function assertSprintActiveForExecution(
  db: D1Database,
  sprintId: string,
) {
  const sprint = await db
    .prepare(`SELECT status, archivedAt FROM sprint WHERE id = ?`)
    .bind(sprintId)
    .first<{ status: string; archivedAt: string | null }>();
  if (!sprint || sprint.archivedAt) {
    throw new HttpError(400, "Sprint 不可用");
  }
  if (sprint.status !== "active") {
    throw new HttpError(400, "仅进行中的 Sprint 可开测试执行");
  }
}
