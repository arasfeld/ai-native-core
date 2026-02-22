import { defineConfig } from "vitest/config";

export const baseConfig = defineConfig({
  test: {
    exclude: ["dist/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      enabled: true,
      include: ["**/*.ts"],
      exclude: ["**/*.test.ts", "**/example.ts", "dist/**", "node_modules/**"],
    },
  },
});
