import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MCP_TOOL_DEFS } from "@team-canvas/mcp";
import { collect, collectBySubject } from "../packages/ontology/index.js";

function canvas(name: string, fact: string): string {
  return [
    'import { Fact } from "team-canvas/canvas";',
    "",
    `export default function ${name}() {`,
    "  return (",
    `    ${fact}`,
    "  );",
    "}",
    "",
  ].join("\n");
}

const layerSource = canvas(
  "LayerFactCanvas",
  '<Fact id="layer-fact" subject="knowledge-layers" claim="Facts render as Turtle." area="team-canvas/knowledge-layers/phase-2" heading="Facts render as Turtle" />',
);
const areaSource = canvas(
  "AreaFactCanvas",
  '<Fact id="area-fact" subject="knowledge-layers" claim="An area id is a canvas id." area="team-canvas/knowledge-layers/brief" heading="Area" />',
);
const otherSource = canvas(
  "OtherFactCanvas",
  '<Fact id="unrelated-fact" subject="other" claim="This fact has a different subject." area="team-canvas/knowledge-layers/research" heading="Other" />',
);

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true });
  return entries.map((entry) => entry.toString()).sort();
}

describe("collect facts by subject as Turtle", () => {
  it("returns every matching fact as one Turtle string, so a different subject, the canvas source, and a derived file stay out of the answer", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-collect-subject-"));
    const layerFile = path.join(root, "phase-2", "layer.canvas.tsx");
    const areaFile = path.join(root, "brief", "area.canvas.tsx");
    const otherFile = path.join(root, "research", "other.canvas.tsx");
    await mkdir(path.dirname(layerFile), { recursive: true });
    await mkdir(path.dirname(areaFile), { recursive: true });
    await mkdir(path.dirname(otherFile), { recursive: true });
    await writeFile(layerFile, layerSource, "utf8");
    await writeFile(areaFile, areaSource, "utf8");
    await writeFile(otherFile, otherSource, "utf8");
    const before = await filesUnder(root);

    // The other subject is first so a collector that keeps only the first canvas cannot pass.
    const sources = [
      await readFile(otherFile, "utf8"),
      await readFile(layerFile, "utf8"),
      await readFile(areaFile, "utf8"),
    ];
    const result = collectBySubject(sources, "knowledge-layers");

    expect(typeof result).toBe("string");
    expect(Array.isArray(result)).toBe(false);
    expect(result.match(/@prefix\b/g)).toHaveLength(1);
    expect(result.match(/tc:type tc:Fact/g)).toHaveLength(2);
    expect(result).toContain("layer-fact");
    expect(result).toContain("area-fact");
    expect(result).toContain('tc:subject "knowledge-layers"');
    expect(result).toContain('tc:claim "Facts render as Turtle."');
    expect(result).toContain('tc:claim "An area id is a canvas id."');
    expect(result).toContain('tc:area "team-canvas/knowledge-layers/phase-2"');
    expect(result).toContain('tc:area "team-canvas/knowledge-layers/brief"');
    expect(result).toContain('tc:heading "Facts render as Turtle"');
    expect(result).toContain('tc:heading "Area"');
    expect(result).toContain("Facts render as Turtle.");
    expect(result).toContain("An area id is a canvas id.");
    expect(result).not.toContain("unrelated-fact");
    expect(result).not.toContain("This fact has a different subject.");
    expect(result).not.toContain('tc:subject "other"');
    expect(result).not.toContain(layerSource);
    expect(result).not.toContain(areaSource);
    expect(result).not.toContain(otherSource);
    expect(result).not.toContain("id.md");
    expect(result).not.toMatch(/\b(SELECT|ASK|CONSTRUCT|DESCRIBE)\b/);

    const prefix = "@prefix tc: <urn:team-canvas:ontology#> .\n";
    const layerBlock = `<urn:team-canvas:fact:layer-fact> tc:type tc:Fact ;
  tc:subject "knowledge-layers" ;
  tc:claim "Facts render as Turtle." ;
  tc:area "team-canvas/knowledge-layers/phase-2" ;
  tc:heading "Facts render as Turtle" .
`;
    const areaBlock = `<urn:team-canvas:fact:area-fact> tc:type tc:Fact ;
  tc:subject "knowledge-layers" ;
  tc:claim "An area id is a canvas id." ;
  tc:area "team-canvas/knowledge-layers/brief" ;
  tc:heading "Area" .
`;
    // Either source order. Anything else (a third fact, a reasoner triple, a second prefix) is a different document.
    expect([prefix + layerBlock + areaBlock, prefix + areaBlock + layerBlock]).toContain(result);

    // A subject string is not a fact id. Collect-by-id must not return these facts for it.
    expect(collect(sources, "knowledge-layers")).toBe("");

    const after = await filesUnder(root);
    expect(after).toEqual(before);
    expect(after.some((name) => name.endsWith(".md") || name.includes("id.md"))).toBe(false);

    const toolNames = MCP_TOOL_DEFS.map((tool) => tool.name);
    expect(toolNames).toContain("list_canvases");
    expect(toolNames).toContain("check_canvas");
    expect(toolNames).toHaveLength(24);
    expect(toolNames).toContain("collect");
    expect(toolNames).toContain("read_facts");
    expect(toolNames).not.toContain("read-area");
  });
});
