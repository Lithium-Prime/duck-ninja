import type { ApiBindings } from "../bindings";
import { HttpError } from "./util";

export type ProjectRole = "admin" | "member" | "readonly";

export type AccessContext = {
  userId: string;
  email: string;
  name: string;
  isSystemAdmin: boolean;
};

export type ProjectAccess = AccessContext & {
  projectId: string;
  role: ProjectRole | "system_admin";
  canWrite: boolean;
  canAdmin: boolean;
};

export async function getMemberRole(
  db: D1Database,
  projectId: string,
  userId: string,
): Promise<ProjectRole | null> {
  const row = await db
    .prepare(
      `SELECT role FROM member WHERE organizationId = ? AND userId = ? LIMIT 1`,
    )
    .bind(projectId, userId)
    .first<{ role: string }>();
  if (!row) return null;
  if (row.role === "admin" || row.role === "member" || row.role === "readonly") {
    return row.role;
  }
  if (row.role === "owner") return "admin";
  return null;
}

export async function requireProjectAccess(
  bindings: ApiBindings,
  ctx: AccessContext,
  projectId: string,
  mode: "read" | "write" | "admin",
): Promise<ProjectAccess> {
  if (ctx.isSystemAdmin) {
    return {
      ...ctx,
      projectId,
      role: "system_admin",
      canWrite: true,
      canAdmin: true,
    };
  }

  const role = await getMemberRole(bindings.DB, projectId, ctx.userId);
  if (!role) {
    throw new HttpError(403, "无权访问该项目");
  }

  const canWrite = role === "admin" || role === "member";
  const canAdmin = role === "admin";

  if (mode === "write" && !canWrite) {
    throw new HttpError(403, "只读成员不可修改");
  }
  if (mode === "admin" && !canAdmin) {
    throw new HttpError(403, "需要项目管理员权限");
  }

  return { ...ctx, projectId, role, canWrite, canAdmin };
}

export async function getProjectOrThrow(
  db: D1Database,
  projectId: string,
): Promise<{
  id: string;
  name: string;
  slug: string;
  description: string | null;
  archivedAt: string | null;
}> {
  const row = await db
    .prepare(
      `SELECT id, name, slug, description, archivedAt FROM organization WHERE id = ?`,
    )
    .bind(projectId)
    .first<{
      id: string;
      name: string;
      slug: string;
      description: string | null;
      archivedAt: string | null;
    }>();
  if (!row) throw new HttpError(404, "项目不存在");
  return row;
}
