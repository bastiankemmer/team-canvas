import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const LAYER_PACKAGES = [
  "@team-canvas/ontology",
  "@team-canvas/ai",
  "@team-canvas/human",
  "@team-canvas/mcp",
] as const;

describe("workspace layer packages", () => {
  it("resolves ontology, ai, human, and mcp in the installed workspace, and the team-canvas bin still starts the CLI, so the split does not replace the command that runs the process", () => {
    // Resolve from inside the root package so Node uses the workspace links and the root's own exports.
    const require = createRequire(path.join(repoRoot, "package.json"));
    const meta = spawnSync(
      "npm",
      ["pkg", "get", "name", "version", "--json"],
      { cwd: repoRoot, encoding: "utf8" },
    );
    expect(meta.status).toBe(0);
    expect(JSON.parse(meta.stdout)).toEqual({
      name: "team-canvas",
      version: "0.6.1",
    });

    for (const name of LAYER_PACKAGES) {
      const packageDir = realpathSync(path.join(repoRoot, "node_modules", name));
      const resolved = require.resolve(name);
      expect(resolved.startsWith(packageDir + path.sep)).toBe(true);
    }

    // Public canvas entry: the SDK file @team-canvas/human exports.
    const canvasExport = realpathSync(require.resolve("team-canvas/canvas"));
    expect(canvasExport).toBe(realpathSync(require.resolve("@team-canvas/human")));

    // npx runs the package bin. npm does not link a root package's own bin into node_modules/.bin.
    const started = spawnSync(
      "npx",
      ["--no-install", "team-canvas"],
      { cwd: repoRoot, encoding: "utf8" },
    );
    expect(started.error).toBeUndefined();
    expect(started.status).toBe(1);
    expect(`${started.stderr ?? ""}${started.stdout ?? ""}`).toMatch(
      /Usage: team-canvas serve/,
    );
  });
});
