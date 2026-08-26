import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  api,
  createTestContext,
  destroyTestContext,
  json,
  signUp,
  type TestContext,
} from "./helpers/setup";

async function seedProject(ctx: TestContext) {
  const user = await signUp(
    ctx,
    `u-${crypto.randomUUID()}@example.com`,
    "password123",
    "成员甲",
  );
  const created = await api(ctx, user.cookie, "/api/projects", {
    method: "POST",
    body: JSON.stringify({ name: "敏捷项目" }),
  });
  const project = await json<{ id: string }>(created);
  return { cookie: user.cookie, projectId: project.id };
}

describe("05–07 demands subtasks sprints", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await destroyTestContext(ctx);
  });

  test("demands board backlog sprint archive readonly", async () => {
    const { cookie, projectId } = await seedProject(ctx);
    const readonly = await signUp(
      ctx,
      `ro-${crypto.randomUUID()}@example.com`,
      "password123",
    );
    const invite = await json<{ code: string }>(
      await api(ctx, cookie, `/api/projects/${projectId}/invite-codes`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    await api(ctx, readonly.cookie, "/api/invite-codes/redeem", {
      method: "POST",
      body: JSON.stringify({ code: invite.code }),
    });
    const members = await json<{ userId: string; email: string }[]>(
      await api(ctx, cookie, `/api/projects/${projectId}/members`),
    );
    const ro = members.find((m) => m.email.startsWith("ro-"));
    await api(
      ctx,
      cookie,
      `/api/projects/${projectId}/members/${ro!.userId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ role: "readonly" }),
      },
    );

    const sprint = await json<{ id: string }>(
      await api(ctx, cookie, `/api/projects/${projectId}/sprints`, {
        method: "POST",
        body: JSON.stringify({
          name: "S1",
          startDate: "2026-01-01",
          endDate: "2026-01-14",
          capacityLimit: 20,
        }),
      }),
    );

    const demand = await json<{ id: string; boardColumn: string }>(
      await api(ctx, cookie, `/api/projects/${projectId}/demands`, {
        method: "POST",
        body: JSON.stringify({
          title: "登录",
          priority: "high",
          storyPoints: 5,
          sprintId: sprint.id,
        }),
      }),
    );
    expect(demand.boardColumn).toBe("todo");

    const moved = await json<{ boardColumn: string }>(
      await api(
        ctx,
        cookie,
        `/api/projects/${projectId}/demands/${demand.id}/board`,
        {
          method: "POST",
          body: JSON.stringify({ boardColumn: "in_progress" }),
        },
      ),
    );
    expect(moved.boardColumn).toBe("in_progress");

    const backlog = await api(
      ctx,
      cookie,
      `/api/projects/${projectId}/demands/${demand.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ sprintId: null }),
      },
    );
    expect(backlog.status).toBe(200);

    const roWrite = await api(
      ctx,
      readonly.cookie,
      `/api/projects/${projectId}/demands`,
      {
        method: "POST",
        body: JSON.stringify({ title: "x", priority: "low" }),
      },
    );
    expect(roWrite.status).toBe(403);

    const arch = await api(
      ctx,
      cookie,
      `/api/projects/${projectId}/demands/${demand.id}/archive`,
      { method: "POST", body: JSON.stringify({}) },
    );
    expect(arch.status).toBe(200);

    const del = await api(
      ctx,
      cookie,
      `/api/projects/${projectId}/demands/${demand.id}`,
      { method: "DELETE" },
    );
    expect(del.status).toBe(405);
  });

  test("subtasks points excluded from capacity/burndown; sprint lifecycle", async () => {
    const { cookie, projectId } = await seedProject(ctx);
    const sprint = await json<{ id: string }>(
      await api(ctx, cookie, `/api/projects/${projectId}/sprints`, {
        method: "POST",
        body: JSON.stringify({
          name: "S2",
          startDate: "2026-02-01",
          endDate: "2026-02-14",
          capacityLimit: 10,
        }),
      }),
    );
    const demand = await json<{ id: string }>(
      await api(ctx, cookie, `/api/projects/${projectId}/demands`, {
        method: "POST",
        body: JSON.stringify({
          title: "支付",
          priority: "high",
          storyPoints: 8,
          sprintId: sprint.id,
        }),
      }),
    );
    await api(
      ctx,
      cookie,
      `/api/projects/${projectId}/demands/${demand.id}/subtasks`,
      {
        method: "POST",
        body: JSON.stringify({ title: "拆解", storyPoints: 99 }),
      },
    );

    const active = await json<{ status: string; lockedCapacity: number }>(
      await api(
        ctx,
        cookie,
        `/api/projects/${projectId}/sprints/${sprint.id}/transition`,
        {
          method: "POST",
          body: JSON.stringify({ status: "active" }),
        },
      ),
    );
    expect(active.status).toBe("active");
    expect(active.lockedCapacity).toBe(8);

    const sprint2 = await json<{ id: string }>(
      await api(ctx, cookie, `/api/projects/${projectId}/sprints`, {
        method: "POST",
        body: JSON.stringify({
          name: "S3",
          startDate: "2026-03-01",
          endDate: "2026-03-14",
          capacityLimit: 5,
        }),
      }),
    );
    const dual = await api(
      ctx,
      cookie,
      `/api/projects/${projectId}/sprints/${sprint2.id}/transition`,
      {
        method: "POST",
        body: JSON.stringify({ status: "active" }),
      },
    );
    expect(dual.status).toBe(400);

    const burndown = await json<{
      committedDemandPoints: number;
      excludedSubtaskPoints: number;
    }>(
      await api(
        ctx,
        cookie,
        `/api/projects/${projectId}/sprints/${sprint.id}/burndown`,
      ),
    );
    expect(burndown.committedDemandPoints).toBe(8);
    expect(burndown.excludedSubtaskPoints).toBe(99);

    await api(
      ctx,
      cookie,
      `/api/projects/${projectId}/sprints/${sprint.id}/transition`,
      {
        method: "POST",
        body: JSON.stringify({ status: "completed" }),
      },
    );
    const arch = await api(
      ctx,
      cookie,
      `/api/projects/${projectId}/sprints/${sprint.id}/archive`,
      { method: "POST", body: JSON.stringify({}) },
    );
    expect(arch.status).toBe(200);
  });
});
