import { expo } from "@better-auth/expo";
import { authSchema, db } from "@repo/db";
import { env } from "@repo/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { Resend } from "resend";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

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
    sendResetPassword: async ({ user, url }) => {
      if (!resend || !env.RESEND_FROM_EMAIL) return;
      await resend.emails.send({
        from: env.RESEND_FROM_EMAIL,
        to: user.email,
        subject: "Reset your password",
        html: `<p>Hi,</p><p>Click <a href="${url}">here</a> to reset your password. This link expires in 1 hour.</p><p>If you didn't request this, you can ignore this email.</p>`,
      });
    },
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
