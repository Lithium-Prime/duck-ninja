import type { ObjectStorage } from "./storage/types";

export type ApiBindings = {
  DB: D1Database;
  FRONTEND_ORIGIN: string;
  BETTER_AUTH_SECRET: string;
  API_BASE_URL: string;
  S3_ENDPOINT: string;
  S3_BUCKET: string;
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
  S3_REGION: string;
  /** Test-only injectable storage; production uses S3 from bindings. */
  objectStorage?: ObjectStorage;
  /** Test-only clock. */
  now?: () => Date;
};

export function requireFrontendOrigin(origin: string | undefined): string {
  if (!origin) {
    throw new Error("FRONTEND_ORIGIN is required");
  }
  return origin;
}

export function requireBetterAuthSecret(secret: string | undefined): string {
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is required");
  }
  return secret;
}

export function requireApiBaseUrl(url: string | undefined): string {
  if (!url) {
    throw new Error("API_BASE_URL is required");
  }
  return url;
}

export function requireS3Config(bindings: ApiBindings): {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
} {
  const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION } =
    bindings;
  if (!S3_ENDPOINT) throw new Error("S3_ENDPOINT is required");
  if (!S3_BUCKET) throw new Error("S3_BUCKET is required");
  if (!S3_ACCESS_KEY_ID) throw new Error("S3_ACCESS_KEY_ID is required");
  if (!S3_SECRET_ACCESS_KEY) throw new Error("S3_SECRET_ACCESS_KEY is required");
  if (!S3_REGION) throw new Error("S3_REGION is required");
  return {
    endpoint: S3_ENDPOINT,
    bucket: S3_BUCKET,
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    region: S3_REGION,
  };
}
