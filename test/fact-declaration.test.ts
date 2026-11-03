import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalFilesystemCanvasStore } from "../src/adapters/store/local-fs-canvas-store.js";
import { createCanvasEditOps } from "../src/app/edit/canvas-edit-ops.js";
import * as canvasSdk from "../packages/human/index.ts";
import { extractFacts } from "../packages/ontology/index.js";

const canvasId = "knowledge/layer-fact";

// Invalid tags come first so a reader that keeps the first Fact tag cannot pass on the literal one.
const source = [
  'import { Fact, H1, H2 } from "team-canvas/canvas";',
  "",
  'const factId = "layer-fact";',
  'const subject = "knowledge-layers";',
  'const claim = "Facts render as Turtle.";',
  'const area = "team-canvas/knowledge-layers/phase-2";',
  'const heading = "Facts render as Turtle";',
  "",
  "export default function DeclaresFact() {",
  "  return (",
  "    <>",
  "      <H1>Facts render as Turtle</H1>",
  "      <H2>Facts render as Turtle</H2>",
  '      <Fact id={factId} subject="knowledge-layers" claim="Facts render as Turtle." area="team-canvas/knowledge-layers/phase-2" heading="Facts render as Turtle" />',
  '      <Fact id="layer-fact" subject={subject} claim="Facts render as Turtle." area="team-canvas/knowledge-layers/phase-2" heading="Facts render as Turtle" />',
  '      <Fact id="layer-fact" subject="knowledge-layers" claim={claim} area="team-canvas/knowledge-layers/phase-2" heading="Facts render as Turtle" />',
  '      <Fact id="layer-fact" subject="knowledge-layers" claim="Facts render as Turtle." area={area} heading="Facts render as Turtle" />',
  '      <Fact id="layer-fact" subject="knowledge-layers" claim="Facts render as Turtle." area="team-canvas/knowledge-layers/phase-2" heading={heading} />',
  "      <Fact id={`layer-fact`} subject=\"knowledge-layers\" claim=\"Facts render as Turtle.\" area=\"team-canvas/knowledge-layers/phase-2\" heading=\"Facts render as Turtle\" />",
  "      <Fact id=\"layer-fact\" subject={`knowledge-layers`} claim=\"Facts render as Turtle.\" area=\"team-canvas/knowledge-layers/phase-2\" heading=\"Facts render as Turtle\" />",
  "      <Fact id=\"layer-fact\" subject=\"knowledge-layers\" claim={`Facts render as Turtle.`} area=\"team-canvas/knowledge-layers/phase-2\" heading=\"Facts render as Turtle\" />",
  "      <Fact id=\"layer-fact\" subject=\"knowledge-layers\" claim=\"Facts render as Turtle.\" area={`team-canvas/knowledge-layers/phase-2`} heading=\"Facts render as Turtle\" />",
  "      <Fact id=\"layer-fact\" subject=\"knowledge-layers\" claim=\"Facts render as Turtle.\" area=\"team-canvas/knowledge-layers/phase-2\" heading={`Facts render as Turtle`} />",
  '      <Fact id="layer-fact" subject="knowledge-layers" claim="Facts render as Turtle." area="team-canvas/knowledge-layers/phase-2" heading="Facts render as Turtle" />',
  "    </>",
  "  );",
  "}",
  "",
].join("\n");

describe("literal Fact declaration", () => {
  it("checks a canvas that declares one literal Fact and reads those fields back, so a variable, a template string, or a heading cannot become a fact and the fact stays out of the state sidecar", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-fact-"));
    const file = path.join(root, "knowledge", "layer-fact.canvas.tsx");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, source, "utf8");

    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), {
      requireLease: false,
    });
    // Bundles team-canvas/canvas, so Fact has to be an export of the human SDK.
    expect(await ops.checkCanvas(canvasId)).toEqual({ ok: true, id: canvasId });

    expect(extractFacts(await ops.readSource(canvasId))).toEqual([
      {
        id: "layer-fact",
        subject: "knowledge-layers",
        claim: "Facts render as Turtle.",
        area: "team-canvas/knowledge-layers/phase-2",
        heading: "Facts render as Turtle",
      },
    ]);

    expect(canvasSdk.Fact).toBeTypeOf("function");
    expect(canvasSdk).not.toHaveProperty("collect");
    expect(canvasSdk).not.toHaveProperty("collectById");
    expect(canvasSdk).not.toHaveProperty("collectBySubject");
    expect(canvasSdk).not.toHaveProperty("renderTurtle");
    expect(canvasSdk).not.toHaveProperty("toTurtle");

    // Check only reads source. A declared fact is not written into canvas state.
    let sidecar = "";
    try {
      sidecar = await readFile(
        path.join(root, "knowledge", "layer-fact.canvas.data.json"),
        "utf8",
      );
    } catch (err) {
      if ((err as { code?: string }).code !== "ENOENT") throw err;
    }
    expect(sidecar.includes("layer-fact")).toBe(false);
    expect(sidecar.includes("Facts render as Turtle.")).toBe(false);
  });
});
