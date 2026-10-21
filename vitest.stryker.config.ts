import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Mutation edits the TypeScript source. Tests import the package name, which otherwise resolves to dist.
  resolve: {
    alias: {
      "@team-canvas/mcp": path.join(repoRoot, "packages/mcp/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: [
      "src/cli.test.ts",
      "src/adapters/http/shell.test.ts",
      "src/app/build/bundle-canvas.test.ts",
      "src/client/canvas-state-bridge.test.ts",
      "src/app/edit/canvas-links.test.ts",
      "src/app/edit/canvas-edit-ops.test.ts",
      "src/app/edit/canvas-orientation.test.ts",
      "src/adapters/mcp/mcp-server.test.ts",
      "src/adapters/mcp/mcp-package-tools.test.ts",
      "src/adapters/store/local-fs-canvas-store.test.ts",
      "src/adapters/http/http-server.test.ts",
      "packages/human/**/*.test.{ts,tsx}",
      "test/acceptance/host-ui-bundle.test.ts",
      "test/acceptance/edit-acceptance.test.ts",
      "test/shell-serve-settlement.test.ts",
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
        "packages/human/**/*.test.{ts,tsx}",
        "test/**",
        "examples/**",
      ],
    },
  },
});
