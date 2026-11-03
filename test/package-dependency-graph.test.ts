import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  dependencyViolations,
  productionSources,
  type SourceFile,
} from "./layer-package-imports.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const SHELL_ON_LAYERS = [
  'import "@team-canvas/ontology";',
  'import "@team-canvas/human";',
  'import "@team-canvas/mcp";',
].join("\n");

function withShell(...files: SourceFile[]): string[] {
  return dependencyViolations([{ path: "src/cli.ts", source: SHELL_ON_LAYERS }, ...files]);
}

describe("layer package import graph", () => {
  it("rejects an import outside the allowed package edges, and a shell that misses any layer, so ontology, human, and mcp stay behind the composition root", () => {
    expect(
      withShell({ path: "packages/ontology/index.js", source: 'import "@team-canvas/human";' }),
    ).toEqual(["ontology depends on human"]);
    expect(
      withShell({ path: "packages/human/index.ts", source: 'import "@team-canvas/mcp";' }),
    ).toEqual(["human depends on mcp"]);
    expect(
      withShell({ path: "packages/mcp/index.ts", source: 'import "../../src/cli.js";' }),
    ).toEqual(["mcp depends on shell"]);
    expect(
      withShell({
        path: "packages/human/index.ts",
        source: 'import "../../src/cli.js";',
      }),
    ).toEqual(["human depends on shell"]);

    // import type and import() still couple two packages.
    expect(
      withShell({
        path: "packages/human/index.ts",
        source: 'import type { Fact } from "@team-canvas/ontology";',
      }),
    ).toEqual(["human depends on ontology"]);
    expect(
      withShell({
        path: "packages/ontology/index.js",
        source: 'import("@team-canvas/mcp");',
      }),
    ).toEqual(["ontology depends on mcp"]);
    expect(
      withShell({ path: "packages/ontology/index.js", source: 'import "../human/index.ts";' }),
    ).toEqual(["ontology depends on human"]);

    for (const missing of ["ontology", "human", "mcp"] as const) {
      const source = (["ontology", "human", "mcp"] as const)
        .filter((layer) => layer !== missing)
        .map((layer) => `import "@team-canvas/${layer}";`)
        .join("\n");
      expect(dependencyViolations([{ path: "src/cli.ts", source }])).toEqual([
        `shell does not depend on ${missing}`,
      ]);
    }

    // Test files, package.json fields, and path.join strings are not import edges.
    expect(
      dependencyViolations([
        { path: "src/cli.test.ts", source: SHELL_ON_LAYERS },
        {
          path: "packages/ontology/package.json",
          source: '{ "dependencies": { "@team-canvas/ai": "0.0.0" } }',
        },
        {
          path: "src/app/build/bundle-canvas.ts",
          source:
            'import path from "node:path";\nexport const sdk = path.join(root, "packages/human/index.ts");',
        },
      ]),
    ).toEqual([
      "shell does not depend on human",
      "shell does not depend on mcp",
      "shell does not depend on ontology",
    ]);

    expect(withShell()).toEqual([]);
    expect(
      withShell(
        {
          path: "packages/mcp/index.ts",
          source: ['import "@team-canvas/ontology";', 'import "@team-canvas/human";'].join("\n"),
        },
        {
          path: "packages/human/index.ts",
          source: 'import "node:path";\nimport "react";\nimport "react-dom/client";',
        },
      ),
    ).toEqual([]);

    expect(dependencyViolations(productionSources(repoRoot))).toEqual([]);
  });
});
