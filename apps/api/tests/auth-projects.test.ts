import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  api,
  createTestContext,
  destroyTestContext,
  json,
  signIn,
  signUp,
  type TestContext,
} from "./helpers/setup";

describe("02–04 auth projects invites roles archive", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await destroyTestContext(ctx);
  });

  test("sign-up, empty projects, sign-out, protected rejected", async () => {
    const { response, cookie } = await signUp(
      ctx,
      "a@example.com",
      "password123",
      "甲",
    );
    expect(response.status).toBeLessThan(400);
    expect(cookie.length).toBeGreaterThan(0);

    const list = await api(ctx, cookie, "/api/projects");
    expect(list.status).toBe(200);
    expect(await json(list)).toEqual([]);

    const denied = await api(ctx, "", "/api/projects");
    expect(denied.status).toBe(401);

    const out = await api(ctx, cookie, "/api/auth/sign-out", {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(out.status).toBeLessThan(400);
  });

  test("create project, isolation, edit, invite, roles, archive", async () => {
    const admin = await signUp(ctx, "admin@example.com", "password123", "管理");
    const member = await signUp(ctx, "member@example.com", "password123", "成员");
    const outsider = await signUp(ctx, "out@example.com", "password123", "外人");

    const created = await api(ctx, admin.cookie, "/api/projects", {
      method: "POST",
      body: JSON.stringify({ name: "项目一", description: "说明" }),
    });
    expect(created.status).toBeLessThan(400);
    const project = await json<{ id: string; name: string }>(created);
    expect(project.name).toBe("项目一");

    const adminList = await json<unknown[]>(
      await api(ctx, admin.cookie, "/api/projects"),
    );
    expect(adminList.length).toBe(1);

    const outsiderList = await json<unknown[]>(
      await api(ctx, outsider.cookie, "/api/projects"),
    );
    expect(outsiderList.length).toBe(0);

    const forbidden = await api(
      ctx,
      outsider.cookie,
      `/api/projects/${project.id}`,
    );
    expect(forbidden.status).toBe(403);

    const patched = await api(ctx, admin.cookie, `/api/projects/${project.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "项目一改", description: "新说明" }),
    });
    expect(patched.status).toBe(200);

    const inviteRes = await api(
      ctx,
      admin.cookie,
      `/api/projects/${project.id}/invite-codes`,
      {
        method: "POST",
        body: JSON.stringify({ maxUses: 2 }),
      },
    );
    expect(inviteRes.status).toBe(200);
    const invite = await json<{ code: string }>(inviteRes);

    const redeemed = await api(ctx, member.cookie, "/api/invite-codes/redeem", {
      method: "POST",
      body: JSON.stringify({ code: invite.code }),
    });
    expect(redeemed.status).toBe(200);
    expect(await json(redeemed)).toMatchObject({
      projectId: project.id,
      role: "member",
    });

    const memberList = await json<unknown[]>(
      await api(ctx, member.cookie, "/api/projects"),
    );
    expect(memberList.length).toBe(1);

    const members = await json<{ userId: string; email: string }[]>(
      await api(ctx, admin.cookie, `/api/projects/${project.id}/members`),
    );
    const memberUser = members.find((m) => m.email === "member@example.com");
    expect(memberUser).toBeTruthy();

    const roleChange = await api(
      ctx,
      admin.cookie,
      `/api/projects/${project.id}/members/${memberUser!.userId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ role: "readonly" }),
      },
    );
    expect(roleChange.status).toBe(200);

    const writeDenied = await api(
      ctx,
      member.cookie,
      `/api/projects/${project.id}/demands`,
      {
        method: "POST",
        body: JSON.stringify({
          title: "不可写",
          priority: "medium",
        }),
      },
    );
    expect(writeDenied.status).toBe(403);

    // system admin can access any project
    const sys = await signUp(ctx, "sys@example.com", "password123", "系统");
    const session = await api(ctx, sys.cookie, "/api/auth/get-session");
    const sessionBody = await json<{ user: { id: string } }>(session);
    await ctx.bindings.DB
      .prepare(`UPDATE user SET role = 'admin' WHERE id = ?`)
      .bind(sessionBody.user.id)
      .run();
    // re-login to refresh session role if cached — get-session reads DB
    const again = await signIn(ctx, "sys@example.com", "password123");
    const sysGet = await api(
      ctx,
      again.cookie,
      `/api/projects/${project.id}`,
    );
    expect(sysGet.status).toBe(200);

    const archived = await api(
      ctx,
      admin.cookie,
      `/api/projects/${project.id}/archive`,
      { method: "POST", body: JSON.stringify({}) },
    );
    expect(archived.status).toBe(200);

    const defaultList = await json<{ id: string }[]>(
      await api(ctx, admin.cookie, "/api/projects"),
    );
    expect(defaultList.find((p) => p.id === project.id)).toBeUndefined();

    const withArchived = await json<{ id: string }[]>(
      await api(ctx, admin.cookie, "/api/projects?includeArchived=1"),
    );
    expect(withArchived.find((p) => p.id === project.id)).toBeTruthy();

    const del = await api(ctx, admin.cookie, `/api/projects/${project.id}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(405);
  });
});
