import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { createMemoryStorage } from "../src/storage";

function requiredBindings(db: D1Database) {
  return {
    DB: db,
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
}

function dbThatAnswers(): D1Database {
  return {
    prepare() {
      return {
        bind() {
          return this;
        },
        first: async () => ({ ok: 1 }),
        run: async () => ({ success: true }),
        all: async () => ({ results: [] }),
      };
    },
    batch: async () => [],
    exec: async () => ({ count: 0, duration: 0 }),
  } as unknown as D1Database;
}

function dbThatFails(): D1Database {
  return {
    prepare() {
      return {
        bind() {
          return this;
        },
        first: async () => {
          throw new Error("D1 unavailable");
        },
      };
    },
    batch: async () => [],
    exec: async () => ({ count: 0, duration: 0 }),
  } as unknown as D1Database;
}

describe("GET /health", () => {
  test("returns ok when D1 responds", async () => {
    const app = createApp(requiredBindings(dbThatAnswers()));
    const response = await app.handle(new Request("http://api.test/health"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  test("fails when D1 is unavailable", async () => {
    const app = createApp(requiredBindings(dbThatFails()));
    const response = await app.handle(new Request("http://api.test/health"));
    expect(response.status).toBeGreaterThanOrEqual(500);
  });

  test("rejects when FRONTEND_ORIGIN is missing", () => {
    expect(() =>
      createApp({
        ...requiredBindings(dbThatAnswers()),
        FRONTEND_ORIGIN: "",
      }),
    ).toThrow(/FRONTEND_ORIGIN/);
  });

  test("rejects when BETTER_AUTH_SECRET is missing", () => {
    expect(() =>
      createApp({
        ...requiredBindings(dbThatAnswers()),
        BETTER_AUTH_SECRET: "",
      }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });
});
