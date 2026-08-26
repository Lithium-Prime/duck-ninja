import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  api,
  createTestContext,
  destroyTestContext,
  json,
  signUp,
  type TestContext,
} from "./helpers/setup";

async function seedReadyPlan(ctx: TestContext) {
  const u1 = await signUp(
    ctx,
    `e1-${crypto.randomUUID()}@example.com`,
    "password123",
    "测试员1",
  );
  const u2 = await signUp(
    ctx,
    `e2-${crypto.randomUUID()}@example.com`,
    "password123",
    "测试员2",
  );
  const project = await json<{ id: string }>(
    await api(ctx, u1.cookie, "/api/projects", {
      method: "POST",
      body: JSON.stringify({ name: "执行项目" }),
    }),
  );
  const invite = await json<{ code: string }>(
    await api(ctx, u1.cookie, `/api/projects/${project.id}/invite-codes`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  );
  await api(ctx, u2.cookie, "/api/invite-codes/redeem", {
    method: "POST",
    body: JSON.stringify({ code: invite.code }),
  });

  const sprint = await json<{ id: string }>(
    await api(ctx, u1.cookie, `/api/projects/${project.id}/sprints`, {
      method: "POST",
      body: JSON.stringify({
        name: "执行 Sprint",
        startDate: "2026-04-01",
        endDate: "2026-04-14",
        capacityLimit: 10,
      }),
    }),
  );
  const demand = await json<{ id: string }>(
    await api(ctx, u1.cookie, `/api/projects/${project.id}/demands`, {
      method: "POST",
      body: JSON.stringify({
        title: "覆盖需求",
        priority: "high",
        storyPoints: 3,
        sprintId: sprint.id,
      }),
    }),
  );
  const ready = await json<{ id: string }>(
    await api(ctx, u1.cookie, `/api/projects/${project.id}/cases`, {
      method: "POST",
      body: JSON.stringify({
        title: "就绪用例",
        steps: [{ action: "a", expected: "b" }],
        status: "ready",
        demandIds: [demand.id],
        tags: ["reg"],
        type: "functional",
      }),
    }),
  );
  const draft = await json<{ id: string }>(
    await api(ctx, u1.cookie, `/api/projects/${project.id}/cases`, {
      method: "POST",
      body: JSON.stringify({
        title: "草稿用例",
        steps: [{ action: "a", expected: "b" }],
        status: "draft",
      }),
    }),
  );

  await api(
    ctx,
    u1.cookie,
    `/api/projects/${project.id}/sprints/${sprint.id}/transition`,
    {
      method: "POST",
      body: JSON.stringify({ status: "active" }),
    },
  );

  const plan = await json<{ id: string }>(
    await api(ctx, u1.cookie, `/api/projects/${project.id}/plans`, {
      method: "POST",
      body: JSON.stringify({ sprintId: sprint.id, name: "冒烟计划" }),
    }),
  );

  return {
    u1,
    u2,
    projectId: project.id,
    sprintId: sprint.id,
    planId: plan.id,
    readyId: ready.id,
    draftId: draft.id,
    demandId: demand.id,
  };
}

describe("11–12 plans executions reports", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await destroyTestContext(ctx);
  });

  test("plans only ready cases; execution freeze; shared results; reports", async () => {
    const s = await seedReadyPlan(ctx);

    const rejectDraft = await api(
      ctx,
      s.u1.cookie,
      `/api/projects/${s.projectId}/plans/${s.planId}/cases`,
      {
        method: "PUT",
        body: JSON.stringify({ caseIds: [s.draftId] }),
      },
    );
    expect(rejectDraft.status).toBe(400);

    const setCases = await api(
      ctx,
      s.u1.cookie,
      `/api/projects/${s.projectId}/plans/${s.planId}/cases`,
      {
        method: "PUT",
        body: JSON.stringify({ caseIds: [s.readyId] }),
      },
    );
    expect(setCases.status).toBe(200);

    const filtered = await json<{ id: string }[]>(
      await api(
        ctx,
        s.u1.cookie,
        `/api/projects/${s.projectId}/cases?status=ready&tag=reg&type=functional&demandSprintId=${s.sprintId}`,
      ),
    );
    expect(filtered.some((c) => c.id === s.readyId)).toBe(true);

    // planning sprint cannot start execution — complete current and try on new planning sprint
    const planningSprint = await json<{ id: string }>(
      await api(ctx, s.u1.cookie, `/api/projects/${s.projectId}/sprints`, {
        method: "POST",
        body: JSON.stringify({
          name: "规划中",
          startDate: "2026-05-01",
          endDate: "2026-05-14",
          capacityLimit: 5,
        }),
      }),
    );
    const planningPlan = await json<{ id: string }>(
      await api(ctx, s.u1.cookie, `/api/projects/${s.projectId}/plans`, {
        method: "POST",
        body: JSON.stringify({
          sprintId: planningSprint.id,
          name: "规划计划",
        }),
      }),
    );
    await api(
      ctx,
      s.u1.cookie,
      `/api/projects/${s.projectId}/plans/${planningPlan.id}/cases`,
      {
        method: "PUT",
        body: JSON.stringify({ caseIds: [s.readyId] }),
      },
    );
    const blocked = await api(
      ctx,
      s.u1.cookie,
      `/api/projects/${s.projectId}/plans/${planningPlan.id}/executions`,
      { method: "POST", body: JSON.stringify({}) },
    );
    expect(blocked.status).toBe(400);

    const exec = await json<{
      id: string;
      snapshots: unknown[];
      results: { id: string; status: string; lastEditorId: string | null }[];
    }>(
      await api(
        ctx,
        s.u1.cookie,
        `/api/projects/${s.projectId}/plans/${s.planId}/executions`,
        { method: "POST", body: JSON.stringify({ name: "第1轮" }) },
      ),
    );
    expect(exec.snapshots.length).toBe(1);
    expect(exec.results.length).toBe(1);

    // changing plan after start does not alter existing execution snapshots
    const another = await json<{ id: string }>(
      await api(ctx, s.u1.cookie, `/api/projects/${s.projectId}/cases`, {
        method: "POST",
        body: JSON.stringify({
          title: "另一就绪",
          steps: [{ action: "x", expected: "y" }],
          status: "ready",
        }),
      }),
    );
    await api(
      ctx,
      s.u1.cookie,
      `/api/projects/${s.projectId}/plans/${s.planId}/cases`,
      {
        method: "PUT",
        body: JSON.stringify({ caseIds: [s.readyId, another.id] }),
      },
    );
    const frozen = await json<{ snapshots: unknown[] }>(
      await api(
        ctx,
        s.u1.cookie,
        `/api/projects/${s.projectId}/executions/${exec.id}`,
      ),
    );
    expect(frozen.snapshots.length).toBe(1);

    const resultId = exec.results[0]!.id;
    const byOther = await json<{ status: string; lastEditorId: string }>(
      await api(
        ctx,
        s.u2.cookie,
        `/api/projects/${s.projectId}/executions/${exec.id}/results/${resultId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: "passed" }),
        },
      ),
    );
    expect(byOther.status).toBe("passed");
    expect(byOther.lastEditorId).toBeTruthy();

    const polled = await json<{
      results: { id: string; status: string }[];
    }>(
      await api(
        ctx,
        s.u1.cookie,
        `/api/projects/${s.projectId}/executions/${exec.id}`,
      ),
    );
    expect(polled.results[0]?.status).toBe("passed");

    const comment = await json<{ id: string }>(
      await api(
        ctx,
        s.u1.cookie,
        `/api/projects/${s.projectId}/executions/${exec.id}/results/${resultId}/comments`,
        {
          method: "POST",
          body: JSON.stringify({ body: "看起来没问题" }),
        },
      ),
    );
    expect(comment.id).toBeTruthy();

    const form = new FormData();
    form.append(
      "file",
      new File([new Uint8Array([9, 9])], "log.txt", { type: "text/plain" }),
    );
    const att = await api(
      ctx,
      s.u1.cookie,
      `/api/projects/${s.projectId}/executions/${exec.id}/results/${resultId}/attachments`,
      { method: "POST", body: form },
    );
    expect(att.status).toBe(200);

    const commentForm = new FormData();
    commentForm.append(
      "file",
      new File([new Uint8Array([8])], "c.png", { type: "image/png" }),
    );
    const cAtt = await api(
      ctx,
      s.u1.cookie,
      `/api/projects/${s.projectId}/comments/${comment.id}/attachments`,
      { method: "POST", body: commentForm },
    );
    expect(cAtt.status).toBe(200);

    const execReport = await json<{ level: string; counts: { passed: number } }>(
      await api(
        ctx,
        s.u1.cookie,
        `/api/projects/${s.projectId}/executions/${exec.id}/report`,
      ),
    );
    expect(execReport.level).toBe("execution");
    expect(execReport.counts.passed).toBe(1);

    const planReport = await json<{ level: string }>(
      await api(
        ctx,
        s.u1.cookie,
        `/api/projects/${s.projectId}/plans/${s.planId}/report`,
      ),
    );
    expect(planReport.level).toBe("plan");

    const sprintReport = await json<{
      level: string;
      demandCoverage: { tested: unknown[]; unlinked: unknown[] };
    }>(
      await api(
        ctx,
        s.u1.cookie,
        `/api/projects/${s.projectId}/sprints/${s.sprintId}/report`,
      ),
    );
    expect(sprintReport.level).toBe("sprint");
    expect(sprintReport.demandCoverage.tested.length).toBeGreaterThanOrEqual(1);

    const arch = await api(
      ctx,
      s.u1.cookie,
      `/api/projects/${s.projectId}/executions/${exec.id}/archive`,
      { method: "POST", body: JSON.stringify({}) },
    );
    expect(arch.status).toBe(200);
  });
});
