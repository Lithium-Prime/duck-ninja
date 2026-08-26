import { Elysia } from "elysia";
import type { Auth } from "../auth";
import type { ApiBindings } from "../bindings";
import type { AccessContext } from "../lib/access";
import { requireProjectAccess } from "../lib/access";
import { HttpError, newId, slugify } from "../lib/util";
import * as projects from "../domain/projects";
import * as demands from "../domain/demands";
import * as sprints from "../domain/sprints";
import * as cases from "../domain/cases";
import * as plans from "../domain/plans";
import * as executions from "../domain/executions";
import * as reports from "../domain/reports";
import { resolveObjectStorage } from "../storage";
import type { ResultStatus } from "../lib/vocab";

async function resolveSession(
  auth: Auth,
  request: Request,
): Promise<AccessContext | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    isSystemAdmin: session.user.role === "admin",
  };
}

function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  throw error;
}

export function createApiRoutes(bindings: ApiBindings, auth: Auth) {
  const storage = resolveObjectStorage(bindings);
  const now = bindings.now;

  const app = new Elysia({ name: "api-routes" })
    .onError(({ error, set }) => {
      if (error instanceof HttpError) {
        set.status = error.status;
        return { error: error.message };
      }
    })
    .derive(async ({ request }) => {
      const access = await resolveSession(auth, request);
      return { access };
    })
    .guard({
      beforeHandle(ctx) {
        const access = (ctx as { access?: AccessContext | null }).access;
        if (!access) {
          ctx.set.status = 401;
          return { error: "未登录" };
        }
      },
    })
    // —— Projects ——
    .get("/api/projects", async ({ access, query }) => {
      const includeArchived = query.includeArchived === "1";
      return projects.listProjects(bindings.DB, access!.userId, {
        includeArchived,
        isSystemAdmin: access!.isSystemAdmin,
      });
    })
    .post("/api/projects", async ({ access, body, request }) => {
      const name = (body as { name?: string })?.name;
      if (!name?.trim()) throw new HttpError(400, "项目名称必填");
      const description =
        (body as { description?: string | null })?.description ?? null;
      const slug = slugify(name);
      const org = await auth.api.createOrganization({
        body: {
          name: name.trim(),
          slug,
          keepCurrentActiveOrganization: false,
        },
        headers: request.headers,
      });
      if (!org) throw new HttpError(500, "创建项目失败");
      const projectId = org.id;
      if (description !== null) {
        await bindings.DB
          .prepare(`UPDATE organization SET description = ? WHERE id = ?`)
          .bind(description, projectId)
          .run();
      }
      return bindings.DB
        .prepare(
          `SELECT id, name, slug, description, archivedAt, createdAt FROM organization WHERE id = ?`,
        )
        .bind(projectId)
        .first();
    })
    .get("/api/projects/:projectId", async ({ access, params }) => {
      await requireProjectAccess(bindings, access!, params.projectId, "read");
      return projects
        .listProjects(bindings.DB, access!.userId, {
          includeArchived: true,
          isSystemAdmin: access!.isSystemAdmin,
        })
        .then((list) => {
          const found = (list as { id: string }[]).find(
            (p) => p.id === params.projectId,
          );
          if (!found) throw new HttpError(404, "项目不存在");
          return found;
        });
    })
    .patch("/api/projects/:projectId", async ({ access, params, body }) => {
      await requireProjectAccess(bindings, access!, params.projectId, "admin");
      return projects.updateProject(
        bindings.DB,
        params.projectId,
        body as { name?: string; description?: string | null },
        now,
      );
    })
    .post("/api/projects/:projectId/archive", async ({ access, params }) => {
      await requireProjectAccess(bindings, access!, params.projectId, "admin");
      return projects.archiveProject(bindings.DB, params.projectId, now);
    })
    .delete("/api/projects/:projectId", () => {
      throw new HttpError(405, "不允许删除，请使用归档");
    })
    // —— Members & invites ——
    .get("/api/projects/:projectId/members", async ({ access, params }) => {
      await requireProjectAccess(bindings, access!, params.projectId, "read");
      return projects.listMembers(bindings.DB, params.projectId);
    })
    .patch(
      "/api/projects/:projectId/members/:userId",
      async ({ access, params, body }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "admin");
        const role = (body as { role?: string })?.role;
        if (role !== "admin" && role !== "member" && role !== "readonly") {
          throw new HttpError(400, "无效角色");
        }
        return projects.updateMemberRole(
          bindings.DB,
          params.projectId,
          params.userId,
          role,
        );
      },
    )
    .post("/api/projects/:projectId/invite-codes", async ({ access, params, body }) => {
      await requireProjectAccess(bindings, access!, params.projectId, "admin");
      const b = body as { maxUses?: number | null; expiresAt?: string | null };
      return projects.createInviteCode(
        bindings.DB,
        {
          projectId: params.projectId,
          createdBy: access!.userId,
          maxUses: b.maxUses ?? null,
          expiresAt: b.expiresAt ?? null,
        },
        now,
      );
    })
    .post("/api/invite-codes/redeem", async ({ access, body }) => {
      const code = (body as { code?: string })?.code;
      if (!code) throw new HttpError(400, "邀请码必填");
      return projects.redeemInviteCode(
        bindings,
        { code, userId: access!.userId },
        now,
      );
    })
    // —— Demands ——
    .get("/api/projects/:projectId/demands", async ({ access, params, query }) => {
      await requireProjectAccess(bindings, access!, params.projectId, "read");
      return demands.listDemands(bindings.DB, params.projectId, {
        includeArchived: query.includeArchived === "1",
        ...(query.sprintId === "backlog"
          ? { sprintId: "backlog" as const }
          : query.sprintId
            ? { sprintId: String(query.sprintId) }
            : {}),
      });
    })
    .post("/api/projects/:projectId/demands", async ({ access, params, body }) => {
      await requireProjectAccess(bindings, access!, params.projectId, "write");
      return demands.createDemand(
        bindings.DB,
        params.projectId,
        body as demands.DemandInput,
        now,
      );
    })
    .patch(
      "/api/projects/:projectId/demands/:demandId",
      async ({ access, params, body }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "write");
        return demands.updateDemand(
          bindings.DB,
          params.demandId,
          params.projectId,
          body as Partial<demands.DemandInput>,
          now,
        );
      },
    )
    .post(
      "/api/projects/:projectId/demands/:demandId/board",
      async ({ access, params, body }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "write");
        const boardColumn = (body as { boardColumn?: string })?.boardColumn;
        if (!boardColumn) throw new HttpError(400, "boardColumn 必填");
        return demands.moveDemandBoard(
          bindings.DB,
          params.demandId,
          params.projectId,
          boardColumn,
          now,
        );
      },
    )
    .post(
      "/api/projects/:projectId/demands/:demandId/archive",
      async ({ access, params }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "write");
        return demands.archiveDemand(
          bindings.DB,
          params.demandId,
          params.projectId,
          now,
        );
      },
    )
    .delete("/api/projects/:projectId/demands/:demandId", () => {
      throw new HttpError(405, "不允许删除，请使用归档");
    })
    // —— Subtasks ——
    .get(
      "/api/projects/:projectId/demands/:demandId/subtasks",
      async ({ access, params }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "read");
        return demands.listSubtasks(
          bindings.DB,
          params.projectId,
          params.demandId,
        );
      },
    )
    .post(
      "/api/projects/:projectId/demands/:demandId/subtasks",
      async ({ access, params, body }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "write");
        return demands.createSubtask(
          bindings.DB,
          params.projectId,
          params.demandId,
          body as { title: string; description?: string; storyPoints?: number },
          now,
        );
      },
    )
    .patch(
      "/api/projects/:projectId/subtasks/:subtaskId",
      async ({ access, params, body }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "write");
        return demands.updateSubtask(
          bindings.DB,
          params.projectId,
          params.subtaskId,
          body as { title?: string; description?: string; storyPoints?: number },
          now,
        );
      },
    )
    .post(
      "/api/projects/:projectId/subtasks/:subtaskId/archive",
      async ({ access, params }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "write");
        return demands.archiveSubtask(
          bindings.DB,
          params.projectId,
          params.subtaskId,
          now,
        );
      },
    )
    // —— Sprints ——
    .get("/api/projects/:projectId/sprints", async ({ access, params, query }) => {
      await requireProjectAccess(bindings, access!, params.projectId, "read");
      return sprints.listSprints(
        bindings.DB,
        params.projectId,
        query.includeArchived === "1",
      );
    })
    .post("/api/projects/:projectId/sprints", async ({ access, params, body }) => {
      await requireProjectAccess(bindings, access!, params.projectId, "write");
      return sprints.createSprint(
        bindings.DB,
        params.projectId,
        body as sprints.SprintInput,
        now,
      );
    })
    .post(
      "/api/projects/:projectId/sprints/:sprintId/transition",
      async ({ access, params, body }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "write");
        const status = (body as { status?: string })?.status;
        if (!status) throw new HttpError(400, "status 必填");
        return sprints.transitionSprint(
          bindings.DB,
          params.projectId,
          params.sprintId,
          status as "planning" | "active" | "completed" | "cancelled",
          now,
        );
      },
    )
    .get(
      "/api/projects/:projectId/sprints/:sprintId/burndown",
      async ({ access, params }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "read");
        return sprints.getBurndown(
          bindings.DB,
          params.projectId,
          params.sprintId,
        );
      },
    )
    .post(
      "/api/projects/:projectId/sprints/:sprintId/archive",
      async ({ access, params }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "write");
        return sprints.archiveSprint(
          bindings.DB,
          params.projectId,
          params.sprintId,
          now,
        );
      },
    )
    .delete("/api/projects/:projectId/sprints/:sprintId", () => {
      throw new HttpError(405, "不允许删除，请使用归档");
    })
    // —— Case library ——
    .get("/api/projects/:projectId/folders", async ({ access, params }) => {
      await requireProjectAccess(bindings, access!, params.projectId, "read");
      return cases.listFolders(bindings.DB, params.projectId);
    })
    .post("/api/projects/:projectId/folders", async ({ access, params, body }) => {
      await requireProjectAccess(bindings, access!, params.projectId, "write");
      return cases.createFolder(
        bindings.DB,
        params.projectId,
        body as { name: string; parentId?: string },
        now,
      );
    })
    .post(
      "/api/projects/:projectId/folders/:folderId/archive",
      async ({ access, params }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "write");
        return cases.archiveFolder(
          bindings.DB,
          params.projectId,
          params.folderId,
          now,
        );
      },
    )
    .get("/api/projects/:projectId/cases", async ({ access, params, query }) => {
      await requireProjectAccess(bindings, access!, params.projectId, "read");
      return cases.listCases(bindings.DB, params.projectId, {
        includeArchived: query.includeArchived === "1",
        ...(query.folderId ? { folderId: String(query.folderId) } : {}),
        ...(query.tag ? { tag: String(query.tag) } : {}),
        ...(query.type ? { type: String(query.type) } : {}),
        ...(query.status ? { status: String(query.status) } : {}),
        ...(query.demandSprintId
          ? { demandSprintId: String(query.demandSprintId) }
          : {}),
      });
    })
    .post("/api/projects/:projectId/cases", async ({ access, params, body }) => {
      await requireProjectAccess(bindings, access!, params.projectId, "write");
      return cases.createCase(
        bindings.DB,
        params.projectId,
        body as cases.CaseInput,
        now,
      );
    })
    .get("/api/projects/:projectId/cases/import-template", async ({ access, params }) => {
      await requireProjectAccess(bindings, access!, params.projectId, "read");
      const bytes = await cases.buildImportTemplate();
      return new Response(bytes, {
        headers: {
          "content-type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": 'attachment; filename="case-import-template.xlsx"',
        },
      });
    })
    .post(
      "/api/projects/:projectId/cases/import",
      async ({ access, params, request }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "write");
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) throw new HttpError(400, "缺少 file");
        const bytes = new Uint8Array(await file.arrayBuffer());
        return cases.importCasesFromXlsx(
          bindings.DB,
          params.projectId,
          bytes,
          now,
        );
      },
    )
    .get(
      "/api/projects/:projectId/cases/:caseId",
      async ({ access, params }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "read");
        const c = await cases.getCase(bindings.DB, params.caseId);
        if (c.projectId !== params.projectId) throw new HttpError(404, "用例不存在");
        return c;
      },
    )
    .patch(
      "/api/projects/:projectId/cases/:caseId",
      async ({ access, params, body }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "write");
        return cases.updateCase(
          bindings.DB,
          params.projectId,
          params.caseId,
          body as Partial<cases.CaseInput>,
          now,
        );
      },
    )
    .post(
      "/api/projects/:projectId/cases/:caseId/archive",
      async ({ access, params }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "write");
        return cases.archiveCase(
          bindings.DB,
          params.projectId,
          params.caseId,
          now,
        );
      },
    )
    .post(
      "/api/projects/:projectId/cases/:caseId/copy",
      async ({ access, params }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "write");
        return cases.copyCase(bindings.DB, params.projectId, params.caseId, now);
      },
    )
    .post(
      "/api/projects/:projectId/cases/:caseId/steps/:stepIndex/image",
      async ({ access, params, request }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "write");
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) throw new HttpError(400, "缺少 file");
        const c = await cases.getCase(bindings.DB, params.caseId);
        if (c.projectId !== params.projectId) throw new HttpError(404, "用例不存在");
        const steps = [...(c.steps as { action: string; expected: string; imageKey?: string | null }[])];
        const idx = Number(params.stepIndex);
        if (!Number.isInteger(idx) || idx < 0 || idx >= steps.length) {
          throw new HttpError(400, "步骤索引无效");
        }
        const key = `projects/${params.projectId}/cases/${params.caseId}/steps/${idx}/${newId()}`;
        const body = new Uint8Array(await file.arrayBuffer());
        await storage.put(key, body, file.type || "application/octet-stream");
        const prev = steps[idx]!;
        steps[idx] = {
          action: prev.action,
          expected: prev.expected,
          imageKey: key,
        };
        const updated = await cases.updateCase(
          bindings.DB,
          params.projectId,
          params.caseId,
          { steps },
          now,
        );
        await executions.createAttachment(
          bindings.DB,
          {
            projectId: params.projectId,
            kind: "step_image",
            ownerId: `${params.caseId}:${idx}`,
            storageKey: key,
            filename: file.name || "step.png",
            contentType: file.type || "application/octet-stream",
            createdBy: access!.userId,
          },
          now,
        );
        return updated;
      },
    )
    .get("/api/attachments/:attachmentId/content", async ({ access, params }) => {
      const att = await executions.getAttachment(bindings.DB, params.attachmentId);
      await requireProjectAccess(
        bindings,
        access!,
        String((att as { projectId: string }).projectId),
        "read",
      );
      const obj = await storage.get(String((att as { storageKey: string }).storageKey));
      if (!obj) throw new HttpError(404, "对象不存在");
      return new Response(obj.body, {
        headers: { "content-type": obj.contentType },
      });
    })
    .get("/api/storage", async ({ access, query }) => {
      if (!access) throw new HttpError(401, "未登录");
      const key = query.key as string;
      if (!key) throw new HttpError(400, "key 必填");
      const obj = await storage.get(key);
      if (!obj) throw new HttpError(404, "对象不存在");
      return new Response(obj.body, {
        headers: { "content-type": obj.contentType },
      });
    })
    // —— Plans ——
    .get("/api/projects/:projectId/plans", async ({ access, params, query }) => {
      await requireProjectAccess(bindings, access!, params.projectId, "read");
      return plans.listPlans(
        bindings.DB,
        params.projectId,
        query.sprintId as string | undefined,
        query.includeArchived === "1",
      );
    })
    .post("/api/projects/:projectId/plans", async ({ access, params, body }) => {
      await requireProjectAccess(bindings, access!, params.projectId, "write");
      const b = body as { sprintId?: string; name?: string };
      if (!b.sprintId || !b.name) throw new HttpError(400, "sprintId 与 name 必填");
      return plans.createPlan(
        bindings.DB,
        params.projectId,
        b.sprintId,
        b.name,
        now,
      );
    })
    .get(
      "/api/projects/:projectId/plans/:planId",
      async ({ access, params }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "read");
        const plan = await plans.getPlan(bindings.DB, params.planId);
        if (String((plan as Record<string, unknown>).projectId) !== params.projectId) {
          throw new HttpError(404, "测试计划不存在");
        }
        return plan;
      },
    )
    .put(
      "/api/projects/:projectId/plans/:planId/cases",
      async ({ access, params, body }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "write");
        const caseIds = (body as { caseIds?: string[] })?.caseIds;
        if (!Array.isArray(caseIds)) throw new HttpError(400, "caseIds 必填");
        return plans.setPlanCases(
          bindings.DB,
          params.projectId,
          params.planId,
          caseIds,
          now,
        );
      },
    )
    .post(
      "/api/projects/:projectId/plans/:planId/archive",
      async ({ access, params }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "write");
        return plans.archivePlan(
          bindings.DB,
          params.projectId,
          params.planId,
          now,
        );
      },
    )
    // —— Executions ——
    .get(
      "/api/projects/:projectId/executions",
      async ({ access, params, query }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "read");
        return executions.listExecutions(
          bindings.DB,
          params.projectId,
          query.planId as string | undefined,
          query.includeArchived === "1",
        );
      },
    )
    .post(
      "/api/projects/:projectId/plans/:planId/executions",
      async ({ access, params, body }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "write");
        return executions.startExecution(
          bindings.DB,
          params.projectId,
          params.planId,
          (body as { name?: string })?.name,
          now,
        );
      },
    )
    .get(
      "/api/projects/:projectId/executions/:executionId",
      async ({ access, params }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "read");
        const exec = await executions.getExecution(
          bindings.DB,
          params.executionId,
        );
        if (String((exec as Record<string, unknown>).projectId) !== params.projectId) {
          throw new HttpError(404, "测试执行不存在");
        }
        return exec;
      },
    )
    .patch(
      "/api/projects/:projectId/executions/:executionId/results/:resultId",
      async ({ access, params, body }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "write");
        const status = (body as { status?: ResultStatus })?.status;
        if (!status) throw new HttpError(400, "status 必填");
        return executions.updateResultStatus(
          bindings.DB,
          params.projectId,
          params.executionId,
          params.resultId,
          status,
          access!.userId,
          now,
        );
      },
    )
    .post(
      "/api/projects/:projectId/executions/:executionId/results/:resultId/comments",
      async ({ access, params, body }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "write");
        return executions.addResultComment(
          bindings.DB,
          params.projectId,
          params.executionId,
          params.resultId,
          access!.userId,
          (body as { body?: string })?.body ?? "",
          now,
        );
      },
    )
    .get(
      "/api/projects/:projectId/executions/:executionId/results/:resultId/comments",
      async ({ access, params }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "read");
        return executions.listResultComments(bindings.DB, params.resultId);
      },
    )
    .post(
      "/api/projects/:projectId/executions/:executionId/results/:resultId/attachments",
      async ({ access, params, request }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "write");
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) throw new HttpError(400, "缺少 file");
        const key = `projects/${params.projectId}/results/${params.resultId}/${newId()}`;
        const bytes = new Uint8Array(await file.arrayBuffer());
        await storage.put(key, bytes, file.type || "application/octet-stream");
        return executions.createAttachment(
          bindings.DB,
          {
            projectId: params.projectId,
            kind: "result",
            ownerId: params.resultId,
            storageKey: key,
            filename: file.name || "attachment.bin",
            contentType: file.type || "application/octet-stream",
            createdBy: access!.userId,
          },
          now,
        );
      },
    )
    .post(
      "/api/projects/:projectId/comments/:commentId/attachments",
      async ({ access, params, request }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "write");
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) throw new HttpError(400, "缺少 file");
        const key = `projects/${params.projectId}/comments/${params.commentId}/${newId()}`;
        const bytes = new Uint8Array(await file.arrayBuffer());
        await storage.put(key, bytes, file.type || "application/octet-stream");
        return executions.createAttachment(
          bindings.DB,
          {
            projectId: params.projectId,
            kind: "result_comment",
            ownerId: params.commentId,
            storageKey: key,
            filename: file.name || "attachment.bin",
            contentType: file.type || "application/octet-stream",
            createdBy: access!.userId,
          },
          now,
        );
      },
    )
    .post(
      "/api/projects/:projectId/executions/:executionId/archive",
      async ({ access, params }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "write");
        return executions.archiveExecution(
          bindings.DB,
          params.projectId,
          params.executionId,
          now,
        );
      },
    )
    // —— Reports ——
    .get(
      "/api/projects/:projectId/executions/:executionId/report",
      async ({ access, params }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "read");
        return reports.executionReport(
          bindings.DB,
          params.projectId,
          params.executionId,
        );
      },
    )
    .get(
      "/api/projects/:projectId/plans/:planId/report",
      async ({ access, params }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "read");
        return reports.planReport(
          bindings.DB,
          params.projectId,
          params.planId,
        );
      },
    )
    .get(
      "/api/projects/:projectId/sprints/:sprintId/report",
      async ({ access, params }) => {
        await requireProjectAccess(bindings, access!, params.projectId, "read");
        return reports.sprintReport(
          bindings.DB,
          params.projectId,
          params.sprintId,
        );
      },
    )
    // system admin: promote user (for tests / bootstrap)
    .post("/api/system/users/:userId/make-admin", async ({ access, params }) => {
      if (!access!.isSystemAdmin) {
        // Allow first bootstrap only if no admin exists yet — let it crash otherwise.
        // Tests seed admin via direct DB update.
        throw new HttpError(403, "需要系统管理员");
      }
      await bindings.DB
        .prepare(`UPDATE user SET role = 'admin' WHERE id = ?`)
        .bind(params.userId)
        .run();
      return { userId: params.userId, role: "admin" };
    });

  void jsonError;
  return app;
}
