import { z } from "zod";

const schema = z.object({
  EXPO_PUBLIC_SERVER_URL: z.url().default("http://localhost:3000"),
  EXPO_PUBLIC_SENTRY_DSN: z.string().default(""),
  EXPO_PUBLIC_SENTRY_ENVIRONMENT: z.string().default("development"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid native environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;
