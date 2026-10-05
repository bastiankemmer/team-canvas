import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const storeRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../examples/okf",
);

const CANVAS_SUFFIX = ".canvas.tsx";

const IDS = [
  "index",
  "guides/editing-workflow",
  "reference/canvas-format",
  "reference/architecture",
  "reference/http-api",
  "reference/mcp-tools",
  "reference/knowledge-links",
];

/** Flat id each moved canvas used before this tree. */
const MOVED: Record<string, string> = {
  "editing-workflow": "guides/editing-workflow",
  "canvas-format": "reference/canvas-format",
  architecture: "reference/architecture",
  "http-api": "reference/http-api",
  "mcp-tools": "reference/mcp-tools",
  "knowledge-links": "reference/knowledge-links",
};

async function listIds(root: string): Promise<string[]> {
  const ids: string[] = [];
  const walk = async (dir: string, prefix: string): Promise<void> => {
    for (const ent of await readdir(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      if (ent.isDirectory()) await walk(path.join(dir, ent.name), rel);
      else if (ent.isFile() && ent.name.endsWith(CANVAS_SUFFIX)) {
        ids.push(rel.slice(0, -CANVAS_SUFFIX.length));
      }
    }
  };
  await walk(root, "");
  return ids;
}

function canvasLinkTos(source: string): string[] {
  return [...source.matchAll(/<CanvasLink to="([^"]*)">/g)].map((match) => match[1]!);
}

describe("examples/okf", () => {
  it('@task-10: lists exactly "index", "guides/editing-workflow", "reference/canvas-format", "reference/architecture", "reference/http-api", "reference/mcp-tools", and "reference/knowledge-links"', async () => {
    const ids = await listIds(storeRoot);
    expect(ids.slice().sort()).toEqual(IDS.slice().sort());

    const rootNames = (await readdir(storeRoot)).sort();
    expect(rootNames).toContain("index.canvas.tsx");
    expect(rootNames).not.toContain("spec");
    for (const flat of Object.keys(MOVED)) {
      expect(ids).not.toContain(flat);
      expect(rootNames).not.toContain(`${flat}.canvas.tsx`);
    }
    expect(ids).not.toContain("spec/format");

    const indexLinks = canvasLinkTos(
      await readFile(path.join(storeRoot, "index.canvas.tsx"), "utf8"),
    );
    for (const id of IDS) {
      if (id !== "index") expect(indexLinks).toContain(id);
    }

    const tos: string[] = [];
    for (const id of ids) {
      const source = await readFile(
        path.join(storeRoot, `${id}.canvas.tsx`),
        "utf8",
      );
      for (const to of canvasLinkTos(source)) {
        tos.push(to);
        expect(IDS, `${id} -> ${to}`).toContain(to);
        if (to === "index") continue;
        const stem = to.slice(to.lastIndexOf("/") + 1);
        expect(MOVED[stem], `${id} -> ${to}`).toBe(to);
      }
    }
    expect(tos).toContain("index");
    for (const to of tos) {
      if (to.endsWith("index")) expect(to).toBe("index");
    }

    const shown = await readFile(
      path.join(storeRoot, "reference/knowledge-links.canvas.tsx"),
      "utf8",
    );
    expect(shown).toContain(
      `'<CanvasLink to="reference/mcp-tools">MCP tools</CanvasLink>'`,
    );
  });
});
