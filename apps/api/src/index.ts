import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker";
import { env } from "cloudflare:workers";
import { createApp } from "./app";

export default createApp(
  {
    DB: env.DB,
    FRONTEND_ORIGIN: env.FRONTEND_ORIGIN,
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
    API_BASE_URL: env.API_BASE_URL,
    S3_ENDPOINT: env.S3_ENDPOINT,
    S3_BUCKET: env.S3_BUCKET,
    S3_ACCESS_KEY_ID: env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY,
    S3_REGION: env.S3_REGION,
  },
  { adapter: CloudflareAdapter },
).compile();
