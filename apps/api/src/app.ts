import { cors } from "@elysiajs/cors";
import { Elysia, type ElysiaAdapter } from "elysia";
import { createAuth } from "./auth";
import {
  type ApiBindings,
  requireApiBaseUrl,
  requireBetterAuthSecret,
  requireFrontendOrigin,
  requireS3Config,
} from "./bindings";
import { createApiRoutes } from "./routes/api";

type CreateAppOptions = {
  adapter?: ElysiaAdapter;
};

export function createApp(
  bindings: ApiBindings,
  options: CreateAppOptions = {},
) {
  const frontendOrigin = requireFrontendOrigin(bindings.FRONTEND_ORIGIN);
  requireBetterAuthSecret(bindings.BETTER_AUTH_SECRET);
  requireApiBaseUrl(bindings.API_BASE_URL);
  if (!bindings.objectStorage) {
    requireS3Config(bindings);
  }

  const auth = createAuth(bindings);

  const app = new Elysia(
    options.adapter !== undefined ? { adapter: options.adapter } : {},
  )
    .use(
      cors({
        origin: frontendOrigin,
        credentials: true,
      }),
    )
    .get("/health", async () => {
      const row = await bindings.DB.prepare("SELECT 1 AS ok").first<{
        ok: number;
      }>();
      if (row === null) {
        throw new Error("D1 health probe returned no row");
      }
      return { status: "ok" as const };
    })
    .all("/api/auth/*", ({ request }) => auth.handler(request))
    .use(createApiRoutes(bindings, auth));

  return app;
}

export type App = ReturnType<typeof createApp>;
