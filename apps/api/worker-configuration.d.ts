/* Generated-style Env for wrangler.toml bindings. Keep in sync with wrangler.toml. */
interface CloudflareEnv {
  DB: D1Database;
  FRONTEND_ORIGIN: string;
  BETTER_AUTH_SECRET: string;
  API_BASE_URL: string;
  S3_ENDPOINT: string;
  S3_BUCKET: string;
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
  S3_REGION: string;
}

declare namespace Cloudflare {
  interface Env extends CloudflareEnv {}
}
