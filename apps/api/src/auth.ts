import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins/admin";
import { organization } from "better-auth/plugins/organization";
import {
  adminAc,
  defaultAc,
  memberAc,
} from "better-auth/plugins/organization/access";
import type { ApiBindings } from "./bindings";
import {
  requireApiBaseUrl,
  requireBetterAuthSecret,
  requireFrontendOrigin,
} from "./bindings";

const readonlyAc = defaultAc.newRole({
  organization: [],
  member: [],
  invitation: [],
  team: [],
  ac: ["read"],
});

export function createAuth(bindings: ApiBindings) {
  const secret = requireBetterAuthSecret(bindings.BETTER_AUTH_SECRET);
  const baseURL = requireApiBaseUrl(bindings.API_BASE_URL);
  const frontendOrigin = requireFrontendOrigin(bindings.FRONTEND_ORIGIN);

  return betterAuth({
    database: bindings.DB,
    baseURL,
    secret,
    trustedOrigins: [frontendOrigin],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [
      organization({
        creatorRole: "admin",
        // Role generics from better-auth are overly strict across AC instances.
        roles: {
          admin: adminAc,
          member: memberAc,
          readonly: readonlyAc,
        } as never,
        schema: {
          organization: {
            additionalFields: {
              description: {
                type: "string",
                required: false,
                input: true,
              },
              archivedAt: {
                type: "string",
                required: false,
                input: false,
              },
            },
          },
        },
      }),
      admin(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
