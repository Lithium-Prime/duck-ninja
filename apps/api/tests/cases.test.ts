import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import ExcelJS from "exceljs";
import {
  api,
  createTestContext,
  destroyTestContext,
  json,
  signUp,
  type TestContext,
} from "./helpers/setup";
import { IMPORT_HEADERS } from "../src/domain/cases";

async function seed(ctx: TestContext) {
  const user = await signUp(
    ctx,
    `c-${crypto.randomUUID()}@example.com`,
    "password123",
  );
  const project = await json<{ id: string }>(
    await api(ctx, user.cookie, "/api/projects", {
      method: "POST",
      body: JSON.stringify({ name: "用例项目" }),
    }),
  );
  return { cookie: user.cookie, projectId: project.id };
}

describe("08–10 case library storage import", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await destroyTestContext(ctx);
  });

  test("folders cases ready→draft on critical edit; link demands; archive", async () => {
    const { cookie, projectId } = await seed(ctx);
    const folder = await json<{ id: string }>(
      await api(ctx, cookie, `/api/projects/${projectId}/folders`, {
        method: "POST",
        body: JSON.stringify({ name: "冒烟" }),
      }),
    );
    const demand = await json<{ id: string }>(
      await api(ctx, cookie, `/api/projects/${projectId}/demands`, {
        method: "POST",
        body: JSON.stringify({ title: "需求A", priority: "medium" }),
      }),
    );
    const created = await json<{ id: string; status: string }>(
      await api(ctx, cookie, `/api/projects/${projectId}/cases`, {
        method: "POST",
        body: JSON.stringify({
          title: "用例1",
          folderId: folder.id,
          steps: [{ action: "打开", expected: "显示" }],
          status: "ready",
          demandIds: [demand.id],
          tags: ["smoke"],
          type: "functional",
        }),
      }),
    );
    expect(created.status).toBe("ready");

    const updated = await json<{ status: string; demandIds: string[] }>(
      await api(ctx, cookie, `/api/projects/${projectId}/cases/${created.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: "用例1改" }),
      }),
    );
    expect(updated.status).toBe("draft");
    expect(updated.demandIds).toContain(demand.id);

    const arch = await api(
      ctx,
      cookie,
      `/api/projects/${projectId}/cases/${created.id}/archive`,
      { method: "POST", body: JSON.stringify({}) },
    );
    expect(arch.status).toBe(200);
  });

  test("step image upload via object storage", async () => {
    const { cookie, projectId } = await seed(ctx);
    const c = await json<{ id: string }>(
      await api(ctx, cookie, `/api/projects/${projectId}/cases`, {
        method: "POST",
        body: JSON.stringify({
          title: "配图用例",
          steps: [{ action: "看图", expected: "一致" }],
        }),
      }),
    );
    const form = new FormData();
    form.append(
      "file",
      new File([new Uint8Array([1, 2, 3, 4])], "a.png", { type: "image/png" }),
    );
    const res = await api(
      ctx,
      cookie,
      `/api/projects/${projectId}/cases/${c.id}/steps/0/image`,
      { method: "POST", body: form },
    );
    expect(res.status).toBe(200);
    const body = await json<{ steps: { imageKey?: string }[] }>(res);
    expect(body.steps[0]?.imageKey).toBeTruthy();

    const stored = await ctx.bindings.objectStorage!.get(body.steps[0].imageKey!);
    expect(stored?.body.length).toBe(4);
  });

  test("params copy template import all-or-nothing", async () => {
    const { cookie, projectId } = await seed(ctx);
    const c = await json<{ id: string }>(
      await api(ctx, cookie, `/api/projects/${projectId}/cases`, {
        method: "POST",
        body: JSON.stringify({
          title: "参数用例",
          steps: [{ action: "输入 {user}", expected: "ok" }],
          params: [{ name: "默认", rows: [{ user: "a" }, { user: "b" }] }],
        }),
      }),
    );
    const withParams = await json<{ params: unknown[] }>(
      await api(ctx, cookie, `/api/projects/${projectId}/cases/${c.id}`),
    );
    expect(withParams.params.length).toBe(1);

    const copied = await json<{ title: string; status: string }>(
      await api(ctx, cookie, `/api/projects/${projectId}/cases/${c.id}/copy`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    expect(copied.title).toContain("副本");
    expect(copied.status).toBe("draft");

    const template = await api(
      ctx,
      cookie,
      `/api/projects/${projectId}/cases/import-template`,
    );
    expect(template.status).toBe(200);
    expect(template.headers.get("content-type")).toContain("spreadsheet");

    const badWb = new ExcelJS.Workbook();
    const ws = badWb.addWorksheet("cases");
    ws.addRow([...IMPORT_HEADERS]);
    ws.addRow([
      "好用例",
      "",
      "",
      "步骤",
      "预期",
      "P1",
      "major",
      "functional",
      "",
      "draft",
    ]);
    ws.addRow(["", "", "", "", "", "", "", "", "", "draft"]); // invalid
    const badBuf = Buffer.from(await badWb.xlsx.writeBuffer());
    const badForm = new FormData();
    badForm.append(
      "file",
      new File([badBuf], "bad.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    const before = await json<unknown[]>(
      await api(ctx, cookie, `/api/projects/${projectId}/cases`),
    );
    const badImport = await api(
      ctx,
      cookie,
      `/api/projects/${projectId}/cases/import`,
      { method: "POST", body: badForm },
    );
    expect(badImport.status).toBe(400);
    const after = await json<unknown[]>(
      await api(ctx, cookie, `/api/projects/${projectId}/cases`),
    );
    expect(after.length).toBe(before.length);

    const goodWb = new ExcelJS.Workbook();
    const gws = goodWb.addWorksheet("cases");
    gws.addRow([...IMPORT_HEADERS]);
    gws.addRow([
      "导入用例",
      "desc",
      "pre",
      "act",
      "exp",
      "P2",
      "minor",
      "functional",
      "t1",
      "ready",
    ]);
    const goodBuf = Buffer.from(await goodWb.xlsx.writeBuffer());
    const goodForm = new FormData();
    goodForm.append(
      "file",
      new File([goodBuf], "good.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    const goodImport = await api(
      ctx,
      cookie,
      `/api/projects/${projectId}/cases/import`,
      { method: "POST", body: goodForm },
    );
    expect(goodImport.status).toBe(200);
    expect(await json<{ count: number }>(goodImport)).toMatchObject({
      count: 1,
    });
  });
});
