import path from "node:path";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const _uiSrc = path.resolve(__dirname, "../../packages/ui/src");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@repo/ui"],
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  tunnelRoute: "/api/monitoring",
  // Skip Sentry uploads when env is not configured (e.g. local dev without a DSN)
  dryRun: !process.env.SENTRY_AUTH_TOKEN,
});
