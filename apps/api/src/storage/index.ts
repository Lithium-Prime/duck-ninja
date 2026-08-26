import { AwsClient } from "aws4fetch";
import type { ApiBindings } from "../bindings";
import { requireS3Config } from "../bindings";
import type { ObjectStorage } from "./types";

export function createS3Storage(bindings: ApiBindings): ObjectStorage {
  const cfg = requireS3Config(bindings);
  const client = new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    region: cfg.region,
    service: "s3",
  });
  const endpoint = cfg.endpoint.replace(/\/$/, "");
  const bucket = cfg.bucket;

  return {
    async put(key, body, contentType) {
      const url = `${endpoint}/${bucket}/${key}`;
      const res = await client.fetch(url, {
        method: "PUT",
        headers: { "content-type": contentType },
        body: body as unknown as BodyInit,
      });
      if (!res.ok) {
        throw new Error(`S3 put failed: HTTP ${res.status}`);
      }
    },
    async get(key) {
      const url = `${endpoint}/${bucket}/${key}`;
      const res = await client.fetch(url, { method: "GET" });
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(`S3 get failed: HTTP ${res.status}`);
      }
      const contentType = res.headers.get("content-type") ?? "application/octet-stream";
      const ab = await res.arrayBuffer();
      return { body: new Uint8Array(ab), contentType };
    },
  };
}

export function createMemoryStorage(): ObjectStorage {
  const map = new Map<string, { body: Uint8Array; contentType: string }>();
  return {
    async put(key, body, contentType) {
      map.set(key, { body, contentType });
    },
    async get(key) {
      return map.get(key) ?? null;
    },
  };
}

export function resolveObjectStorage(bindings: ApiBindings): ObjectStorage {
  if (bindings.objectStorage) return bindings.objectStorage;
  return createS3Storage(bindings);
}
