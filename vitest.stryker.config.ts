import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/app/edit/canvas-edit-ops.test.ts",
      "src/app/edit/canvas-orientation.test.ts",
      "src/adapters/mcp/mcp-server.test.ts",
      "test/acceptance/edit-acceptance.test.ts",
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
        "test/**",
        "examples/**",
      ],
    },
  },
});
