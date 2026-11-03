import { appendFile, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { callMcpTool } from "@team-canvas/mcp";
import { collect, collectBySubject } from "../packages/ontology/index.js";
import { startHttpServer } from "../src/adapters/http/http-server.js";
import { LocalFilesystemCanvasStore } from "../src/adapters/store/local-fs-canvas-store.js";
import { createCanvasEditOps } from "../src/app/edit/canvas-edit-ops.js";

const alphaSource = [
  'import { Fact, Text } from "team-canvas/canvas";',
  "",
  "export default function AlphaNotes() {",
  "  return (",
  "    <>",
  '      <Fact id="layer-fact" subject="knowledge-layers" claim="Facts render as Turtle." area="notes/alpha" heading="Alpha" />',
  "      <Text>canvas-only-sentence</Text>",
  "    </>",
  "  );",
  "}",
  "",
].join("\n");

const betaSource = [
  'import { Fact } from "team-canvas/canvas";',
  "",
  "export default function BetaNotes() {",
  "  return (",
  "    <>",
  '      <Fact id="other-fact" subject="knowledge-layers" claim="An area id is a canvas id." area="notes/beta" heading="Beta" />',
  '      <Fact id="stray-fact" subject="other-subject" claim="Not this subject." area="notes/beta" heading="Stray" />',
  "    </>",
  "  );",
  "}",
  "",
].join("\n");

describe("MCP collect", () => {
  it("returns only the Turtle for a fact id or a subject, so an agent gets those facts and not the rest of the canvas or the derived file", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-mcp-collect-"));
    const store = LocalFilesystemCanvasStore(root);
    await store.writeSource("notes/alpha", alphaSource);
    await store.writeSource("notes/beta", betaSource);
    await store.writeSource(
      "other-project/leak",
      [
        'import { Fact } from "team-canvas/canvas";',
        "export default function Leak() {",
        '  return <Fact id="other-project-fact" subject="knowledge-layers" claim="Must not leak across projects." area="other-project/leak" heading="Leak" />;',
        "}",
        "",
      ].join("\n"),
    );
    const derived = path.join(root, "notes", "alpha.md");
    await appendFile(derived, "derived-only-sentence\n", "utf8");
    expect(await readFile(derived, "utf8")).toContain("derived-only-sentence");

    const ops = createCanvasEditOps(store, { requireLease: false });
    const ids = await ops.listCanvases({ folder: "notes" });
    const batch = await ops.readSources(ids);
    const sources = ids.map((id) => {
      const entry = batch.sources[id];
      if (!entry || !("source" in entry)) throw new Error(`Missing canvas source: ${id}`);
      return entry.source;
    });
    expect(sources.join("\n")).toContain("canvas-only-sentence");
    expect(sources.join("\n")).not.toContain("derived-only-sentence");

    const factTurtle = collect(sources, "layer-fact");
    const subjectTurtle = collectBySubject(sources, "knowledge-layers");
    const byFact = await callMcpTool(ops, "collect", { project: "notes", fact_id: "layer-fact" });
    const bySubject = await callMcpTool(ops, "collect", { project: "notes", subject: "knowledge-layers" });
    const crossProjectId = await callMcpTool(ops, "collect", { project: "notes", fact_id: "other-project-fact" });
    expect(crossProjectId.isError).toBe(false);
    expect(crossProjectId.content).toEqual([{ type: "text", text: "" }]);

    expect(byFact.isError).toBe(false);
    expect(byFact.content).toEqual([{ type: "text", text: factTurtle }]);
    expect(byFact.content[0]?.text).toContain("Facts render as Turtle.");
    expect(byFact.content[0]?.text).not.toContain("An area id is a canvas id.");

    expect(bySubject.isError).toBe(false);
    expect(bySubject.content).toEqual([{ type: "text", text: subjectTurtle }]);
    expect(bySubject.content[0]?.text).toContain("Facts render as Turtle.");
    expect(bySubject.content[0]?.text).toContain("An area id is a canvas id.");
    expect(bySubject.content[0]?.text).not.toContain("Not this subject.");
    expect(bySubject.content[0]?.text).not.toContain("Must not leak across projects.");

    for (const result of [byFact, bySubject]) {
      const text = result.content.map((item) => item.text).join("");
      expect(text).not.toContain("canvas-only-sentence");
      expect(text).not.toContain("derived-only-sentence");
    }

    const server = await startHttpServer({ root, host: "127.0.0.1", port: 0 });
    try {
      for (const route of ["/collect", "/api/collect"]) {
        for (const method of ["GET", "POST"] as const) {
          const response = await fetch(`${server.url}${route}`, { method });
          expect(response.status, `${method} ${route}`).toBe(404);
          expect(await response.text()).not.toContain("Facts render as Turtle.");
        }
      }
    } finally {
      await server.close();
    }
  });
});