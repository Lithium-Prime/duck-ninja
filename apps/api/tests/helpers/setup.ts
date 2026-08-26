import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "../../src/app";
import type { ApiBindings } from "../../src/bindings";
import { createMemoryStorage } from "../../src/storage";
import { createBunSqliteD1 } from "./bun-d1";

const MIGRATIONS = [
  "0001_better_auth.sql",
  "0002_domain.sql",
].map((name) =>
  readFileSync(join(import.meta.dir, "../../migrations", name), "utf8"),
);

export type TestContext = {
  app: ReturnType<typeof createApp>;
  bindings: ApiBindings;
  baseUrl: string;
};

async function applyMigrations(db: D1Database) {
  for (const sql of MIGRATIONS) {
    const withoutLineComments = sql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    const statements = withoutLineComments
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      await db.exec(stmt);
    }
  }
}

export async function createTestContext(): Promise<TestContext> {
  const DB = createBunSqliteD1(":memory:");
  await applyMigrations(DB);

  const bindings: ApiBindings = {
    DB,
    FRONTEND_ORIGIN: "http://localhost:5173",
    BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long!",
    API_BASE_URL: "http://api.test",
    S3_ENDPOINT: "http://s3.test",
    S3_BUCKET: "bucket",
    S3_ACCESS_KEY_ID: "key",
    S3_SECRET_ACCESS_KEY: "secret",
    S3_REGION: "auto",
    objectStorage: createMemoryStorage(),
  };

  const app = createApp(bindings);
  return { app, bindings, baseUrl: "http://api.test" };
}

export async function destroyTestContext(_ctx: TestContext | undefined) {
  // in-memory sqlite — nothing to dispose
}

export function withCookie(cookie: string, init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  headers.set("origin", "http://localhost:5173");
  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has("content-type")
  ) {
    headers.set("content-type", "application/json");
  }
  return { ...init, headers };
}

export function extractCookie(response: Response): string {
  const raw = response.headers.getSetCookie?.() ?? [];
  if (raw.length) {
    return raw.map((c) => c.split(";")[0]).join("; ");
  }
  const single = response.headers.get("set-cookie");
  if (!single) return "";
  return single
    .split(/,(?=[^;]+?=)/)
    .map((p) => p.split(";")[0].trim())
    .join("; ");
}

export async function signUp(
  ctx: TestContext,
  email: string,
  password: string,
  name = "用户",
) {
  const res = await ctx.app.handle(
    new Request(`${ctx.baseUrl}/api/auth/sign-up/email`, {
      method: "POST",
      ...withCookie("", {
        body: JSON.stringify({ email, password, name }),
      }),
    }),
  );
  const cookie = extractCookie(res);
  return { response: res, cookie };
}

export async function signIn(
  ctx: TestContext,
  email: string,
  password: string,
) {
  const res = await ctx.app.handle(
    new Request(`${ctx.baseUrl}/api/auth/sign-in/email`, {
      method: "POST",
      ...withCookie("", {
        body: JSON.stringify({ email, password }),
      }),
    }),
  );
  const cookie = extractCookie(res);
  return { response: res, cookie };
}

export async function api(
  ctx: TestContext,
  cookie: string,
  path: string,
  init: RequestInit = {},
) {
  return ctx.app.handle(
    new Request(`${ctx.baseUrl}${path}`, withCookie(cookie, init)),
  );
}

export async function json<T = unknown>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
