import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MCP_TOOL_DEFS } from "@team-canvas/mcp";
import { areaRead } from "../packages/ai/index.js";
import { LocalFilesystemCanvasStore } from "../src/adapters/store/local-fs-canvas-store.js";

const id = "notes/weekly";

const source = [
  'import { H1, H2, H3, Stack, Text } from "team-canvas/canvas";',
  "",
  "export default function Weekly() {",
  "  return (",
  "    <Stack>",
  "      <H1>Weekly</H1>",
  "      <Text>Shipped the store.</Text>",
  "      <H2>Done</H2>",
  "      <Text>Notes stayed.</Text>",
  "      <H3>Blockers</H3>",
  "      <Text>None.</Text>",
  "    </Stack>",
  "  );",
  "}",
  "",
].join("\n");

const knowledge = [
  "# Weekly",
  "",
  "Shipped the store.",
  "",
  "## Done",
  "",
  "Notes stayed.",
  "",
  "### Blockers",
  "",
  "None.",
  "",
].join("\n");

describe("reading an area", () => {
  it("returns the whole knowledge file for an area id, so every heading is included and the canvas and the knowledge file stay unchanged", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-area-read-"));
    const store = LocalFilesystemCanvasStore(root);
    const canvasPath = path.join(root, "notes", "weekly.canvas.tsx");
    const mdPath = path.join(root, "notes", "weekly.md");

    await store.writeSource(id, source);
    await writeFile(mdPath, knowledge, "utf8");

    const sourceBytes = await readFile(canvasPath);
    const mdBytes = await readFile(mdPath);
    const full = mdBytes.toString("utf8");

    const result = await areaRead(id, (areaId) => store.readDerived(areaId));

    expect(result).toBe(full);
    expect(result).toContain("Weekly");
    expect(result).toContain("Done");
    expect(result).toContain("Blockers");
    const afterWeekly = result.slice(result.indexOf("Weekly") + "Weekly".length);
    expect(afterWeekly).toContain("Done");
    expect(afterWeekly).toContain("Blockers");

    expect(await readFile(canvasPath)).toEqual(sourceBytes);
    expect(await readFile(mdPath)).toEqual(mdBytes);
    expect(await store.readSource(id)).toBe(source);

    const toolNames = MCP_TOOL_DEFS.map((tool) => tool.name);
    expect(toolNames).toContain("list_canvases");
    expect(toolNames).toContain("check_canvas");
    expect(toolNames).toHaveLength(24);
    expect(toolNames).toContain("collect");
    expect(toolNames).toContain("read-area");
    expect(toolNames).not.toContain("area-read");
  });
});
