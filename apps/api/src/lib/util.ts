export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(now?: () => Date): string {
  return (now?.() ?? new Date()).toISOString();
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "project"}-${crypto.randomUUID().slice(0, 8)}`;
}
