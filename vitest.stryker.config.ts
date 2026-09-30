import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/app/canvas-edit-ops.test.ts",
      "src/app/canvas-orientation.test.ts",
      "src/adapters/mcp-server.test.ts",
      "src/adapters/edit-acceptance.test.ts",
    ],
    pool: "forks",
    maxWorkers: 1,
    coverage: {
      enabled: true,
      provider: "v8",
      exclude: [
        "node_modules/**",
        "dist/**",
        ".stryker-tmp/**",
        "coverage/**",
        "src/**/*.test.{ts,tsx}",
        "src/**/*.spec.{ts,tsx}",
        "examples/**",
      ],
    },
  },
});
