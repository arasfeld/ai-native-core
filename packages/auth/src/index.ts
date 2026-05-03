import { expo } from "@better-auth/expo";
import { authSchema, db } from "@repo/db";
import {
  renderPasswordResetEmail,
  renderWelcomeEmail,
  sendEmail,
} from "@repo/emails";
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
    requireEmailVerification: false,
    sendVerificationEmail: async ({
      user,
      url,
    }: {
      user: { name?: string | null; email: string };
      url: string;
    }) => {
      const html = `<p>Hi ${user.name ?? "there"},</p><p>Click <a href="${url}">here</a> to verify your email address. This link expires in 24 hours.</p><p>If you didn't create an account, you can ignore this email.</p>`;
      await sendEmail(user.email, "Verify your email address", html);
    },
    sendResetPassword: async ({
      user,
      url,
    }: {
      user: { email: string };
      url: string;
    }) => {
      const html = await renderPasswordResetEmail({ url });
      await sendEmail(user.email, "Reset your password", html);
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user: { name?: string | null; email: string }) => {
          const html = await renderWelcomeEmail({
            name: user.name ?? undefined,
            appUrl: env.BETTER_AUTH_URL,
          });
          await sendEmail(user.email, "Welcome to AI Native Core", html);
        },
      },
    },
  },
  socialProviders: {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
    ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
          },
        }
      : {}),
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  advanced: {
    defaultCookieAttributes: {
      sameSite: (process.env.NODE_ENV === "production" ? "none" : "lax") as
        | "none"
        | "lax"
        | "strict",
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
    },
  },
  user: {
    additionalFields: {
      isAdmin: {
        type: "boolean" as const,
        defaultValue: false,
        input: false,
      },
    },
  },
  plugins: [expo()],
});

export type Session = typeof auth.$Infer.Session;
