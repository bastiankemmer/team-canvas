import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MCP_TOOL_DEFS } from "@team-canvas/mcp";
import { collect } from "../packages/ontology/index.js";

const layerSource = [
  'import { Fact } from "team-canvas/canvas";',
  "",
  "export default function LayerFactCanvas() {",
  "  return (",
  '    <Fact id="layer-fact" subject="knowledge-layers" claim="Facts render as Turtle." area="team-canvas/knowledge-layers/phase-2" heading="Facts render as Turtle" />',
  "  );",
  "}",
  "",
].join("\n");

const otherSource = [
  'import { Fact } from "team-canvas/canvas";',
  "",
  "export default function OtherFactCanvas() {",
  "  return (",
  '    <Fact id="other-fact" subject="knowledge-layers" claim="An area id is a canvas id." area="team-canvas/knowledge-layers/brief" heading="Area" />',
  "  );",
  "}",
  "",
].join("\n");

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true });
  return entries.map((entry) => entry.toString()).sort();
}

describe("collect one fact as Turtle", () => {
  it("returns only that fact as a Turtle string, so a second fact, the canvas source, and a derived file stay out of the answer", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-collect-"));
    const layerFile = path.join(root, "knowledge", "layer.canvas.tsx");
    const otherFile = path.join(root, "brief", "other.canvas.tsx");
    await mkdir(path.dirname(layerFile), { recursive: true });
    await mkdir(path.dirname(otherFile), { recursive: true });
    await writeFile(layerFile, layerSource, "utf8");
    await writeFile(otherFile, otherSource, "utf8");
    const before = await filesUnder(root);

    // The other fact is first so a collect that keeps the first fact cannot pass.
    const result = collect(
      [await readFile(otherFile, "utf8"), await readFile(layerFile, "utf8")],
      "layer-fact",
    );

    expect(typeof result).toBe("string");
    // The whole answer is this Turtle document: one prefix, direct triples, no second fact and no file path.
    expect(result).toBe(
      [
        "@prefix tc: <urn:team-canvas:ontology#> .",
        "<urn:team-canvas:fact:layer-fact> tc:type tc:Fact ;",
        '  tc:subject "knowledge-layers" ;',
        '  tc:claim "Facts render as Turtle." ;',
        '  tc:area "team-canvas/knowledge-layers/phase-2" ;',
        '  tc:heading "Facts render as Turtle" .',
        "",
      ].join("\n"),
    );
    expect(result.match(/@prefix\b/g)).toHaveLength(1);
    expect(result).toContain("tc:type tc:Fact");
    expect(result).toContain('tc:subject "knowledge-layers"');
    expect(result).toContain('tc:claim "Facts render as Turtle."');
    expect(result).toContain('tc:area "team-canvas/knowledge-layers/phase-2"');
    expect(result).toContain('tc:heading "Facts render as Turtle"');
    expect(result).toContain("Facts render as Turtle.");
    expect(result).toContain("layer-fact");
    expect(result).not.toContain("other-fact");
    expect(result).not.toContain("An area id is a canvas id.");
    expect(result).not.toContain(layerSource);
    expect(result).not.toContain(otherSource);
    expect(result).not.toContain("id.md");
    expect(result).not.toMatch(/\b(SELECT|ASK|CONSTRUCT|DESCRIBE)\b/);

    // A missing id must not invent either fact.
    const missing = collect([layerSource, otherSource], "missing-fact");
    expect(missing).toBe("");
    expect(missing).not.toContain("layer-fact");
    expect(missing).not.toContain("Facts render as Turtle.");

    const after = await filesUnder(root);
    expect(after).toEqual(before);
    expect(after.some((name) => name.endsWith(".md") || name.includes("id.md"))).toBe(false);

    const toolNames = MCP_TOOL_DEFS.map((tool) => tool.name);
    expect(toolNames).toContain("list_canvases");
    expect(toolNames).toContain("check_canvas");
    expect(toolNames).toHaveLength(24);
    expect(toolNames).toContain("collect");
    expect(toolNames).toContain("read-area");
  });
});
