import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Mutation edits the TypeScript source. Tests import the package name, which otherwise resolves to dist.
  resolve: {
    alias: {
      "@team-canvas/mcp": path.join(repoRoot, "packages/mcp/index.ts"),
      "@team-canvas/ontology": path.join(repoRoot, "packages/ontology/index.js"),
      "@team-canvas/ai": path.join(repoRoot, "packages/ai/index.js"),
    },
  },
  test: {
    environment: "node",
    include: [
      "src/app/edit/canvas-links.test.ts",
      "src/app/edit/canvas-edit-ops.test.ts",
      "src/app/edit/canvas-orientation.test.ts",
      "src/adapters/mcp/mcp-server.test.ts",
      "src/adapters/mcp/mcp-package-tools.test.ts",
      "test/ontology-literals.test.ts",
      "test/collect-fact-turtle.test.ts",
      "test/collect-subject-turtle.test.ts",
      "test/mcp-collect-turtle.test.ts",
      "test/area-read.test.ts",
      "test/mcp-read-area.test.ts",
      "test/fact-declaration.test.ts",
      "test/fact-vector-score.test.ts",
      "test/mcp-collect-query-turtle.test.ts",
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
