import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { callMcpTool } from "@team-canvas/mcp";
import * as ai from "../packages/ai/index.js";
import { collect, collectBySubject, extractFacts, score } from "../packages/ontology/index.js";
import { startHttpServer } from "../src/adapters/http/http-server.js";
import { LocalFilesystemCanvasStore } from "../src/adapters/store/local-fs-canvas-store.js";
import { createCanvasEditOps } from "../src/app/edit/canvas-edit-ops.js";
import { dependencyViolations, productionSources } from "./layer-package-imports.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PREFIX = "@prefix tc: <urn:team-canvas:ontology#> .\n";

// Declared alpha then Alpha on purpose: a query tie breaks by fact id, a subject collect keeps this order.
const searchSource = [
  'import { Fact } from "team-canvas/canvas";',
  "",
  "export default function SearchNotes() {",
  "  return (",
  "    <>",
  '      <Fact id="alpha" subject="mint" heading="mint" claim="mint" area="notes/search" />',
  '      <Fact id="Alpha" subject="mint" heading="mint" claim="Mint" area="notes/search" />',
  '      <Fact id="best" subject="ux" heading="ux" claim="design" area="notes/search" />',
  '      <Fact id="partial" subject="zzz" heading="zzz" claim="ux" area="notes/search" />',
  '      <Fact id="none" subject="billing" heading="billing" claim="invoice" area="notes/search" />',
  "    </>",
  "  );",
  "}",
  "",
].join("\n");

describe("MCP collect by query", () => {
  it("returns every fact at or above a query threshold as one Turtle document, so a search reuses the fact score and the same triples as a single collect", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-mcp-query-"));
    const store = LocalFilesystemCanvasStore(root);
    await store.writeSource("notes/search", searchSource);
    await store.writeSource(
      "other-project/ux",
      [
        'import { Fact } from "team-canvas/canvas";',
        "export default function OtherUx() {",
        '  return <Fact id="leaked-ux" subject="ux" heading="ux" claim="ux design" area="other-project/ux" />;',
        "}",
        "",
      ].join("\n"),
    );
    const written = (await readdir(root, { recursive: true })).map((entry) => entry.toString());
    expect(written.some((name) => name.endsWith(".md"))).toBe(false);
    expect(existsSync(path.join(root, "notes", "search.md"))).toBe(false);

    const ops = createCanvasEditOps(store, { requireLease: false });
    const canvasIds = await ops.listCanvases({ folder: "notes" });
    const batch = await ops.readSources(canvasIds);
    const sources = canvasIds.map((id) => {
      const entry = batch.sources[id];
      if (!entry || !("source" in entry)) throw new Error(`Missing canvas source: ${id}`);
      return entry.source;
    });
    expect(sources).toEqual([searchSource]);

    const facts = extractFacts(searchSource);
    expect(facts.map((fact) => fact.id)).toEqual(["alpha", "Alpha", "best", "partial", "none"]);
    const fact = (id: string) => {
      const found = facts.find((item) => item.id === id);
      if (!found) throw new Error(`Missing fact: ${id}`);
      return found;
    };

    const ux = "ux design";
    const bestScore = score(ux, fact("best"), facts);
    const partialScore = score(ux, fact("partial"), facts);
    expect(bestScore).toBeLessThan(1);
    expect(bestScore).toBeGreaterThan(partialScore);
    expect(partialScore).toBeGreaterThan(0);
    for (const id of ["Alpha", "alpha", "none"]) expect(score(ux, fact(id), facts), id).toBe(0);

    const mintScore = score("mint", fact("Alpha"), facts);
    expect(score("mint", fact("alpha"), facts)).toBe(mintScore);
    expect(mintScore).toBeGreaterThan(0);
    for (const id of ["best", "partial", "none"]) expect(score("mint", fact(id)), id).toBe(0);

    const block = (id: string) => {
      const one = collect(sources, id);
      expect(one.startsWith(PREFIX), id).toBe(true);
      const triples = one.slice(PREFIX.length);
      expect(triples, id).not.toContain("@prefix");
      expect(triples, id).toContain("tc:type tc:Fact");
      expect(triples, id).toContain("tc:subject");
      expect(triples, id).toContain("tc:claim");
      expect(triples, id).toContain("tc:area");
      expect(triples, id).toContain("tc:heading");
      return triples;
    };
    const document = (ids: string[]) => (ids.length === 0 ? "" : PREFIX + ids.map(block).join(""));

    const collectText = async (args: Record<string, unknown>) => {
      const result = await callMcpTool(ops, "collect", { project: "notes", ...args });
      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.type).toBe("text");
      return result.content[0]?.text ?? "";
    };

    const zero = await collectText({ query: ux, threshold: 0 });
    const zeroOrder = [
      "urn:team-canvas:fact:best",
      "urn:team-canvas:fact:partial",
      "urn:team-canvas:fact:Alpha",
      "urn:team-canvas:fact:alpha",
      "urn:team-canvas:fact:none",
    ];
    expect(zero).toBe(document(["best", "partial", "Alpha", "alpha", "none"]));
    expect(zero.startsWith(PREFIX)).toBe(true);
    expect(zero.match(/@prefix\b/g)).toHaveLength(1);
    let at = -1;
    for (const iri of zeroOrder) {
      const next = zero.indexOf(iri);
      expect(next, iri).toBeGreaterThan(at);
      at = next;
    }
    expect(await collectText({ query: ux, threshold: 0 })).toBe(zero);

    const atPartial = await collectText({ query: ux, threshold: partialScore });
    expect(atPartial).toBe(document(["best", "partial"]));
    expect(atPartial.indexOf("urn:team-canvas:fact:best")).toBeLessThan(
      atPartial.indexOf("urn:team-canvas:fact:partial"),
    );
    expect(atPartial).not.toContain("urn:team-canvas:fact:none");

    const atBest = await collectText({ query: ux, threshold: bestScore });
    expect(atBest).toBe(document(["best"]));
    expect(atBest).toContain("urn:team-canvas:fact:best");
    expect(atBest).not.toContain("urn:team-canvas:fact:partial");

    const atOne = await collectText({ query: ux, threshold: 1 });
    expect(atOne).toBe("");
    expect(atOne).not.toContain("@prefix");

    const mint = await collectText({ query: "mint", threshold: mintScore });
    expect(mint).toBe(document(["Alpha", "alpha"]));
    expect(mint.indexOf("urn:team-canvas:fact:Alpha")).toBeLessThan(
      mint.indexOf("urn:team-canvas:fact:alpha"),
    );
    expect(searchSource.indexOf('id="alpha"')).toBeLessThan(searchSource.indexOf('id="Alpha"'));
    expect(mint).not.toContain("urn:team-canvas:fact:best");

    const byId = await collectText({ fact_id: "best" });
    expect(byId).toBe(collect(sources, "best"));
    expect(byId).toContain('tc:claim "design"');
    expect(byId).not.toContain("urn:team-canvas:fact:partial");

    const bySubject = await collectText({ subject: "mint" });
    expect(bySubject).toBe(collectBySubject(sources, "mint"));
    expect(bySubject.indexOf("urn:team-canvas:fact:alpha")).toBeLessThan(
      bySubject.indexOf("urn:team-canvas:fact:Alpha"),
    );
    expect(bySubject).not.toContain("urn:team-canvas:fact:best");

    expect(await collectText({ fact_id: "missing" })).toBe("");

    const rejected: Array<[string, Record<string, unknown>]> = [
      ["missing project", { fact_id: "best" }],
      ["empty project", { project: "", fact_id: "best" }],
      ["no selector", { project: "notes" }],
      ["fact id with subject", { project: "notes", fact_id: "best", subject: "mint" }],
      ["fact id with query", { project: "notes", fact_id: "best", query: ux, threshold: 0 }],
      ["subject with query", { project: "notes", subject: "mint", query: ux, threshold: 0 }],
      ["all three selectors", { project: "notes", fact_id: "best", subject: "mint", query: ux, threshold: 0 }],
      ["query without threshold", { project: "notes", query: ux }],
      ["fact id with threshold", { project: "notes", fact_id: "best", threshold: 0 }],
      ["subject with threshold", { project: "notes", subject: "mint", threshold: 0 }],
      ["threshold alone", { project: "notes", threshold: 0 }],
      ["threshold below 0", { project: "notes", query: ux, threshold: -0.01 }],
      ["threshold above 1", { project: "notes", query: ux, threshold: 1.01 }],
      ["threshold that is not a number", { project: "notes", query: ux, threshold: "0.5" }],
    ];
    for (const [label, args] of rejected) {
      const result = await callMcpTool(ops, "collect", args);
      expect(result.isError, label).toBe(true);
      const text = result.content.map((item) => item.text).join("\n");
      expect(text, label).not.toContain("@prefix");
      expect(text, label).not.toContain("urn:team-canvas:fact:");
    }

    const server = await startHttpServer({ root, host: "127.0.0.1", port: 0 });
    try {
      for (const route of ["/collect", "/api/collect"]) {
        for (const method of ["GET", "POST"] as const) {
          const response = await fetch(`${server.url}${route}`, { method });
          expect(response.status, `${method} ${route}`).toBe(404);
          expect(await response.text(), `${method} ${route}`).not.toContain("@prefix tc:");
        }
      }
    } finally {
      await server.close();
    }

    expect(ai).not.toHaveProperty("projectCanvas");
    expect(existsSync(path.join(repoRoot, ".vectors.json"))).toBe(false);
    expect(existsSync(path.join(root, ".vectors.json"))).toBe(false);
    const rootPkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(rootPkg.dependencies ?? {}).sort()).toEqual([
      "esbuild",
      "react",
      "react-dom",
      "typescript",
    ]);
    for (const name of ["ontology", "ai", "human", "mcp"]) {
      const layer = JSON.parse(
        readFileSync(path.join(repoRoot, "packages", name, "package.json"), "utf8"),
      ) as { dependencies?: unknown };
      expect(layer.dependencies, name).toBeUndefined();
    }
    expect(dependencyViolations(productionSources(repoRoot))).toEqual([]);
  });
});
