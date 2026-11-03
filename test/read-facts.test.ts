import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { callMcpTool } from "@team-canvas/mcp";
import { readFacts } from "../packages/ontology/index.js";
import { startHttpServer } from "../src/adapters/http/http-server.js";
import { LocalFilesystemCanvasStore } from "../src/adapters/store/local-fs-canvas-store.js";
import { createCanvasEditOps } from "../src/app/edit/canvas-edit-ops.js";

const menuSource = [
  'import { Fact, Text } from "team-canvas/canvas";',
  "",
  "export default function MenuAndMoney() {",
  "  return (",
  "    <>",
  '      <Fact id="menu-price" subject="menu" claim="The lunch plate is 12 euros." area="notes/menu-and-money" heading="Price" />',
  '      <Fact id="menu-cash" subject="money" claim="Cash closes in the drawer." area="notes/menu-and-money" heading="Cash" />',
  "      <Text>canvas-only-sentence</Text>",
  "    </>",
  "  );",
  "}",
  "",
].join("\n");

const otherSource = [
  'import { Fact } from "team-canvas/canvas";',
  "",
  "export default function Other() {",
  '  return <Fact id="other-fact" subject="menu" claim="This other canvas stays out." area="notes/other" heading="Other" />;',
  "}",
  "",
].join("\n");

describe("read one canvas's facts", () => {
  it("returns Turtle for the facts on that canvas, so the component text and a second canvas stay out while search_source still finds the component", async () => {
    const turtle = readFacts(menuSource);
    expect(turtle).toContain('tc:claim "The lunch plate is 12 euros."');
    expect(turtle).toContain('tc:claim "Cash closes in the drawer."');
    expect(turtle.indexOf("menu-price")).toBeLessThan(turtle.indexOf("menu-cash"));
    expect(turtle).not.toContain("canvas-only-sentence");
    expect(turtle).not.toContain("other-fact");
    expect(turtle).not.toContain("export default");
    expect(readFacts('export default function Empty() { return <Text>no fact</Text> }')).toBe("");

    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-read-facts-"));
    const store = LocalFilesystemCanvasStore(root);
    await store.writeSource("notes/menu-and-money", menuSource);
    await store.writeSource("notes/other", otherSource);
    const ops = createCanvasEditOps(store, { requireLease: false });

    const facts = await callMcpTool(ops, "read_facts", { id: "notes/menu-and-money" });
    expect(facts.isError).toBe(false);
    expect(facts.content).toEqual([{ type: "text", text: turtle }]);
    expect(facts.content[0]?.text).not.toContain("This other canvas stays out.");

    const search = await callMcpTool(ops, "search_source", {
      id: "notes/menu-and-money",
      query: "canvas-only-sentence",
    });
    expect(search.isError).toBe(false);
    expect(search.content[0]?.text).toContain("canvas-only-sentence");

    const server = await startHttpServer({ root, host: "127.0.0.1", port: 0 });
    try {
      for (const route of ["/read-facts", "/api/read-facts"]) {
        const response = await fetch(`${server.url}${route}`);
        expect(response.status).toBe(404);
      }
    } finally {
      await server.close();
    }
  });
});
