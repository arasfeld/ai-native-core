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
import { twoFactor } from "better-auth/plugins";
import { maybeAlertOnNewLogin } from "./security-alert";

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
        after: async (user: {
          id: string;
          name?: string | null;
          email: string;
        }) => {
          const html = await renderWelcomeEmail({
            name: user.name ?? undefined,
            appUrl: env.BETTER_AUTH_URL,
          });
          await sendEmail(user.email, "Welcome to AI Native Core", html);

          // Eagerly bootstrap personal org (tenant + owner membership)
          const apiUrl = process.env.API_URL ?? "http://localhost:8000";
          try {
            await fetch(`${apiUrl}/auth/bootstrap-tenant`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ user_id: user.id, email: user.email }),
            });
          } catch {
            // Non-fatal: chat_service.get_or_create_tenant is the safety net
          }
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          await maybeAlertOnNewLogin(
            {
              id: session.id,
              userId: session.userId,
              ipAddress: session.ipAddress ?? null,
              userAgent: session.userAgent ?? null,
            },
            env.BETTER_AUTH_URL,
          );
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
  plugins: [
    expo(),
    twoFactor({
      issuer: "AI Native Core",
      otpOptions: { period: 30, digits: 6 },
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
