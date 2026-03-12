import { expo } from "@better-auth/expo";
import { db, authSchema } from "@repo/db";
import { env } from "@repo/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
  }),
  trustedOrigins: [
    env.CORS_ORIGIN,
    "ai-native://",
    ...(env.NODE_ENV === "development"
      ? ["exp://", "exp://**", "exp://192.168.*.*:*/**", "http://localhost:8081"]
      : []),
  ],
  emailAndPassword: {
    enabled: true,
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Provision a FastAPI tenant + user record for every new better-auth user.
          // This is idempotent — safe to retry on failure.
          try {
            await fetch(`${env.API_URL}/auth/internal/register`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-internal-secret": env.INTERNAL_SECRET,
              },
              body: JSON.stringify({ email: user.email }),
            });
          } catch {
            // Non-fatal — FastAPI provisioning will be retried on next sign-in
          }
        },
      },
    },
  },
  plugins: [expo()],
});

export type Session = typeof auth.$Infer.Session;
