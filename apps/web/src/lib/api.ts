function requireApiBaseUrl(): string {
  const value = import.meta.env.VITE_API_BASE_URL;
  if (!value) {
    throw new Error("VITE_API_BASE_URL is required");
  }
  return value.replace(/\/$/, "");
}

export const API_BASE = requireApiBaseUrl();

export type HealthResponse = { status: "ok" };

async function parseJson<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    const err = (data as { error?: string })?.error ?? `HTTP ${response.status}`;
    throw new Error(err);
  }
  return data as T;
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (response.status === 204) return undefined as T;
  const ct = response.headers.get("content-type") ?? "";
  if (ct.includes("application/json") || ct.includes("text/plain") || !ct) {
    return parseJson<T>(response);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response as unknown as T;
}

export async function fetchHealth(): Promise<HealthResponse> {
  return api("/health");
}

export async function signUp(email: string, password: string, name: string) {
  return api("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email, password, name }),
  });
}

export async function signIn(email: string, password: string) {
  return api("/api/auth/sign-in/email", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function signOut() {
  return api("/api/auth/sign-out", { method: "POST", body: "{}" });
}

export async function getSession() {
  return api<{ user?: { id: string; email: string; name: string; role?: string } } | null>(
    "/api/auth/get-session",
  );
}
