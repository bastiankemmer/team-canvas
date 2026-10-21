import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

type Layer = "ontology" | "ai" | "human" | "mcp" | "shell";

const LAYERS: readonly Layer[] = ["ontology", "ai", "human", "mcp", "shell"];

const PACKAGE_ROOT: Record<Layer, string> = {
  ontology: "packages/ontology",
  ai: "packages/ai",
  human: "packages/human",
  mcp: "packages/mcp",
  shell: "src",
};

/**
 * Edges that may exist. Shell edges are required; every other allowed edge is optional.
 * Ontology has none. AI may reach ontology. Human has none. MCP may reach the other three, not the shell.
 */
const ALLOWED: Record<Layer, readonly Layer[]> = {
  ontology: [],
  ai: ["ontology"],
  human: [],
  mcp: ["ontology", "ai", "human"],
  shell: ["ontology", "ai", "human", "mcp"],
};

type SourceFile = { path: string; source: string };

const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
const SKIP_DIRS = new Set(["dist", "node_modules", "coverage"]);

function normalize(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function isProductionSource(filePath: string): boolean {
  const parts = normalize(filePath).split("/");
  if (parts.some((part) => SKIP_DIRS.has(part))) return false;
  const base = parts[parts.length - 1] ?? "";
  // A test-only import must not count as the shell depending on a layer.
  if (base.endsWith(".test.ts") || base.endsWith(".test.tsx")) return false;
  return SOURCE_EXT.has(path.posix.extname(base));
}

function layerOf(filePath: string): Layer | null {
  const normalized = normalize(filePath);
  for (const layer of LAYERS) {
    const root = PACKAGE_ROOT[layer];
    if (normalized === root || normalized.startsWith(`${root}/`)) return layer;
  }
  return null;
}

function targetLayer(fromFile: string, specifier: string): Layer | null {
  if (specifier.startsWith("@team-canvas/")) {
    const name = specifier.slice("@team-canvas/".length).split("/")[0];
    if (name === "ontology" || name === "ai" || name === "human" || name === "mcp") {
      return name;
    }
    return null;
  }
  if (!specifier.startsWith(".")) return null;
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(normalize(fromFile)), specifier),
  );
  return layerOf(resolved);
}

function scriptKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function literalSpecifier(expr: ts.Expression | undefined): string | undefined {
  return expr && ts.isStringLiteral(expr) ? expr.text : undefined;
}

/** Import and re-export specifiers, including import type and import(). Strings and path.join are not edges. */
function importSpecifiers(source: string, filePath: string): string[] {
  const sf = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    false,
    scriptKind(filePath),
  );
  const specs: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const spec = literalSpecifier(node.moduleSpecifier);
      if (spec !== undefined) specs.push(spec);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const spec = literalSpecifier(node.arguments[0]);
      if (spec !== undefined) specs.push(spec);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return specs;
}

function dependencyViolations(files: readonly SourceFile[]): string[] {
  const edges = new Map<Layer, Set<Layer>>(LAYERS.map((layer) => [layer, new Set()]));
  for (const file of files) {
    if (!isProductionSource(file.path)) continue;
    const from = layerOf(file.path);
    if (!from) continue;
    for (const specifier of importSpecifiers(file.source, file.path)) {
      const to = targetLayer(file.path, specifier);
      if (!to || to === from) continue;
      edges.get(from)?.add(to);
    }
  }
  const problems: string[] = [];
  for (const from of LAYERS) {
    const allowed = new Set<Layer>(ALLOWED[from]);
    for (const to of edges.get(from) ?? []) {
      if (!allowed.has(to)) problems.push(`${from} depends on ${to}`);
    }
  }
  for (const layer of ALLOWED.shell) {
    if (!edges.get("shell")?.has(layer)) problems.push(`shell does not depend on ${layer}`);
  }
  problems.sort();
  return problems;
}

function productionSources(root: string): SourceFile[] {
  const files: SourceFile[] = [];
  const walk = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      const rel = normalize(path.relative(root, abs));
      if (!isProductionSource(rel)) continue;
      files.push({ path: rel, source: fs.readFileSync(abs, "utf8") });
    }
  };
  for (const layer of LAYERS) walk(path.join(root, PACKAGE_ROOT[layer]));
  return files;
}

const SHELL_ON_ALL_FOUR = [
  'import "@team-canvas/ontology";',
  'import "@team-canvas/ai";',
  'import "@team-canvas/human";',
  'import "@team-canvas/mcp";',
].join("\n");

function withShell(...files: SourceFile[]): string[] {
  return dependencyViolations([{ path: "src/cli.ts", source: SHELL_ON_ALL_FOUR }, ...files]);
}

describe("layer package import graph", () => {
  it("rejects an import outside the allowed package edges, and a shell that misses any layer, so ontology, ai, human, and mcp stay behind the composition root", () => {
    expect(
      withShell({ path: "packages/ontology/index.js", source: 'import "@team-canvas/ai";' }),
    ).toEqual(["ontology depends on ai"]);
    expect(
      withShell({ path: "packages/human/index.ts", source: 'import "@team-canvas/mcp";' }),
    ).toEqual(["human depends on mcp"]);
    expect(
      withShell({ path: "packages/mcp/index.ts", source: 'import "../../src/cli.js";' }),
    ).toEqual(["mcp depends on shell"]);
    expect(
      withShell({
        path: "packages/ai/index.js",
        source: 'export { answer } from "@team-canvas/human";',
      }),
    ).toEqual(["ai depends on human"]);
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
      withShell({ path: "packages/ontology/index.js", source: 'import "../ai/index.js";' }),
    ).toEqual(["ontology depends on ai"]);

    for (const missing of ["ontology", "ai", "human", "mcp"] as const) {
      const source = (["ontology", "ai", "human", "mcp"] as const)
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
        { path: "src/cli.test.ts", source: SHELL_ON_ALL_FOUR },
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
      "shell does not depend on ai",
      "shell does not depend on human",
      "shell does not depend on mcp",
      "shell does not depend on ontology",
    ]);

    expect(withShell()).toEqual([]);
    expect(
      withShell(
        { path: "packages/ai/index.js", source: 'import "@team-canvas/ontology";' },
        {
          path: "packages/mcp/index.ts",
          source: [
            'import "@team-canvas/ontology";',
            'import "@team-canvas/ai";',
            'import "@team-canvas/human";',
          ].join("\n"),
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
