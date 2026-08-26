import type { ApiBindings } from "../bindings";
import { HttpError, newId, nowIso } from "../lib/util";
import type { BoardColumn } from "../lib/vocab";
import { BOARD_COLUMNS } from "../lib/vocab";

export async function listProjects(
  db: D1Database,
  userId: string,
  opts: { includeArchived: boolean; isSystemAdmin: boolean },
) {
  if (opts.isSystemAdmin) {
    const sql = opts.includeArchived
      ? `SELECT id, name, slug, description, archivedAt, createdAt FROM organization ORDER BY createdAt DESC`
      : `SELECT id, name, slug, description, archivedAt, createdAt FROM organization WHERE archivedAt IS NULL ORDER BY createdAt DESC`;
    const { results } = await db.prepare(sql).all();
    return results ?? [];
  }

  const sql = opts.includeArchived
    ? `SELECT o.id, o.name, o.slug, o.description, o.archivedAt, o.createdAt, m.role
       FROM organization o
       INNER JOIN member m ON m.organizationId = o.id
       WHERE m.userId = ?
       ORDER BY o.createdAt DESC`
    : `SELECT o.id, o.name, o.slug, o.description, o.archivedAt, o.createdAt, m.role
       FROM organization o
       INNER JOIN member m ON m.organizationId = o.id
       WHERE m.userId = ? AND o.archivedAt IS NULL
       ORDER BY o.createdAt DESC`;
  const { results } = await db.prepare(sql).bind(userId).all();
  return results ?? [];
}

export async function updateProject(
  db: D1Database,
  projectId: string,
  patch: { name?: string; description?: string | null },
  now?: () => Date,
) {
  const existing = await db
    .prepare(`SELECT id, archivedAt FROM organization WHERE id = ?`)
    .bind(projectId)
    .first<{ id: string; archivedAt: string | null }>();
  if (!existing) throw new HttpError(404, "项目不存在");
  if (existing.archivedAt) throw new HttpError(400, "已归档项目不可编辑");

  if (patch.name !== undefined) {
    await db
      .prepare(`UPDATE organization SET name = ? WHERE id = ?`)
      .bind(patch.name, projectId)
      .run();
  }
  if (patch.description !== undefined) {
    await db
      .prepare(`UPDATE organization SET description = ? WHERE id = ?`)
      .bind(patch.description, projectId)
      .run();
  }
  void now;
  return db
    .prepare(
      `SELECT id, name, slug, description, archivedAt, createdAt FROM organization WHERE id = ?`,
    )
    .bind(projectId)
    .first();
}

export async function archiveProject(db: D1Database, projectId: string, now?: () => Date) {
  const existing = await db
    .prepare(`SELECT id, archivedAt FROM organization WHERE id = ?`)
    .bind(projectId)
    .first<{ id: string; archivedAt: string | null }>();
  if (!existing) throw new HttpError(404, "项目不存在");
  if (existing.archivedAt) return existing;
  const ts = nowIso(now);
  await db
    .prepare(`UPDATE organization SET archivedAt = ? WHERE id = ?`)
    .bind(ts, projectId)
    .run();
  return { id: projectId, archivedAt: ts };
}

export async function createInviteCode(
  db: D1Database,
  input: {
    projectId: string;
    createdBy: string;
    maxUses?: number | null;
    expiresAt?: string | null;
  },
  now?: () => Date,
) {
  const id = newId();
  const code = crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
  const createdAt = nowIso(now);
  await db
    .prepare(
      `INSERT INTO project_invite_code (id, projectId, code, maxUses, usedCount, expiresAt, createdBy, createdAt, revokedAt)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, NULL)`,
    )
    .bind(
      id,
      input.projectId,
      code,
      input.maxUses ?? null,
      input.expiresAt ?? null,
      input.createdBy,
      createdAt,
    )
    .run();
  return { id, code, maxUses: input.maxUses ?? null, expiresAt: input.expiresAt ?? null, usedCount: 0 };
}

export async function redeemInviteCode(
  bindings: ApiBindings,
  input: { code: string; userId: string },
  now?: () => Date,
) {
  const db = bindings.DB;
  const invite = await db
    .prepare(
      `SELECT * FROM project_invite_code WHERE code = ? AND revokedAt IS NULL`,
    )
    .bind(input.code.trim().toUpperCase())
    .first<{
      id: string;
      projectId: string;
      maxUses: number | null;
      usedCount: number;
      expiresAt: string | null;
    }>();
  if (!invite) throw new HttpError(404, "邀请码无效");

  const ts = nowIso(now);
  if (invite.expiresAt && invite.expiresAt < ts) {
    throw new HttpError(400, "邀请码已过期");
  }
  if (invite.maxUses !== null && invite.usedCount >= invite.maxUses) {
    throw new HttpError(400, "邀请码已用尽");
  }

  const project = await db
    .prepare(`SELECT id, archivedAt FROM organization WHERE id = ?`)
    .bind(invite.projectId)
    .first<{ id: string; archivedAt: string | null }>();
  if (!project || project.archivedAt) {
    throw new HttpError(400, "项目不可加入");
  }

  const existing = await db
    .prepare(
      `SELECT id FROM member WHERE organizationId = ? AND userId = ?`,
    )
    .bind(invite.projectId, input.userId)
    .first();
  if (existing) {
    throw new HttpError(400, "已是项目成员");
  }

  const memberId = newId();
  await db.batch([
    db
      .prepare(
        `INSERT INTO member (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, 'member', ?)`,
      )
      .bind(memberId, invite.projectId, input.userId, ts),
    db
      .prepare(
        `UPDATE project_invite_code SET usedCount = usedCount + 1 WHERE id = ?`,
      )
      .bind(invite.id),
  ]);

  return { projectId: invite.projectId, role: "member" as const };
}

export async function updateMemberRole(
  db: D1Database,
  projectId: string,
  userId: string,
  role: "admin" | "member" | "readonly",
) {
  const result = await db
    .prepare(
      `UPDATE member SET role = ? WHERE organizationId = ? AND userId = ?`,
    )
    .bind(role, projectId, userId)
    .run();
  if (!result.meta.changes) throw new HttpError(404, "成员不存在");
  return { projectId, userId, role };
}

export async function listMembers(db: D1Database, projectId: string) {
  const { results } = await db
    .prepare(
      `SELECT m.id, m.userId, m.role, m.createdAt, u.name, u.email
       FROM member m
       INNER JOIN user u ON u.id = m.userId
       WHERE m.organizationId = ?
       ORDER BY m.createdAt ASC`,
    )
    .bind(projectId)
    .all();
  return results ?? [];
}

export function assertBoardColumn(value: string): BoardColumn {
  if (!(BOARD_COLUMNS as readonly string[]).includes(value)) {
    throw new HttpError(400, "无效看板列");
  }
  return value as BoardColumn;
}
