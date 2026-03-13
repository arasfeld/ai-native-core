import { expo } from "@better-auth/expo";
import { authSchema, db } from "@repo/db";
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
      ? [
          "exp://",
          "exp://**",
          "exp://192.168.*.*:*/**",
          "http://localhost:8081",
        ]
      : []),
  ],
  emailAndPassword: {
    enabled: true,
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  advanced: {
    defaultCookieAttributes: {
      sameSite: (process.env.NODE_ENV === "production" ? "none" : "lax") as any,
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
    },
  },
  plugins: [expo()],
});

export type Session = typeof auth.$Infer.Session;
