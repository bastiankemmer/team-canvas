import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const storeRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../examples/okf",
);

const CANVAS_SUFFIX = ".canvas.tsx";

const repoRoot = path.resolve(storeRoot, "../..");

const IDS = [
  "team-canvas/index",
  "guides/editing-workflow",
  "reference/canvas-format",
  "reference/architecture",
  "reference/http-api",
  "reference/mcp-tools",
  "reference/knowledge-links",
];

/** Outgoing CanvasLink targets after bare "index" became "team-canvas/index". */
const LINKS: Record<string, string[]> = {
  "team-canvas/index": [
    "reference/canvas-format",
    "reference/architecture",
    "reference/http-api",
    "reference/mcp-tools",
    "guides/editing-workflow",
    "reference/knowledge-links",
  ],
  "guides/editing-workflow": [
    "reference/mcp-tools",
    "reference/canvas-format",
    "team-canvas/index",
  ],
  "reference/canvas-format": ["team-canvas/index", "guides/editing-workflow"],
  "reference/architecture": [
    "reference/http-api",
    "reference/mcp-tools",
    "reference/canvas-format",
    "team-canvas/index",
  ],
  "reference/http-api": [
    "reference/mcp-tools",
    "reference/knowledge-links",
    "reference/architecture",
  ],
  "reference/mcp-tools": [
    "guides/editing-workflow",
    "reference/knowledge-links",
    "reference/http-api",
  ],
  "reference/knowledge-links": [
    // The format example is a string in source; the same regex sees it before the real tag.
    "reference/mcp-tools",
    "reference/mcp-tools",
    "reference/http-api",
    "team-canvas/index",
  ],
};

const SKILL_PATH = "/Users/basti/.cursor/skills/okf/SKILL.md";

const LIBRARY_PNG_SHA1 = "9b18c9701716a98e5446f6d6f89020713a3492ec";
/** sha1 of the README HTTP table and the MCP tool lines, so a wording edit fails. */
const HTTP_TABLE_SHA1 = "ec0d9bd3c275690eaec3034ce00a29cced4a15ab";
const README_MCP_TOOLS_SHA1 = "3165b4f623d024e58af66fd7567a0274f5397026";
const GETTING_STARTED_MCP_TOOLS_SHA1 = "771f584022dd7f3a7a264e2a66793c600464e3f6";

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
  it('@task-10: lists exactly "team-canvas/index", "guides/editing-workflow", "reference/canvas-format", "reference/architecture", "reference/http-api", "reference/mcp-tools", and "reference/knowledge-links"', async () => {
    const ids = await listIds(storeRoot);
    expect(ids.slice().sort()).toEqual(IDS.slice().sort());
    expect(ids).not.toContain("index");

    const rootNames = (await readdir(storeRoot)).sort();
    expect(rootNames).not.toContain("index.canvas.tsx");
    expect(rootNames).toContain("team-canvas");
    expect(rootNames).not.toContain("spec");
    for (const flat of Object.keys(MOVED)) {
      expect(ids).not.toContain(flat);
      expect(rootNames).not.toContain(`${flat}.canvas.tsx`);
    }
    expect(ids).not.toContain("spec/format");

    const indexLinks = canvasLinkTos(
      await readFile(path.join(storeRoot, "team-canvas/index.canvas.tsx"), "utf8"),
    );
    for (const id of IDS) {
      if (id !== "team-canvas/index") expect(indexLinks).toContain(id);
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
        if (to === "team-canvas/index") continue;
        const stem = to.slice(to.lastIndexOf("/") + 1);
        expect(MOVED[stem], `${id} -> ${to}`).toBe(to);
      }
    }
    expect(tos).toContain("team-canvas/index");
    expect(tos).not.toContain("index");
    for (const to of tos) {
      if (to.endsWith("index")) expect(to).toBe("team-canvas/index");
    }

    const shown = await readFile(
      path.join(storeRoot, "reference/knowledge-links.canvas.tsx"),
      "utf8",
    );
    expect(shown).toContain(
      `'<CanvasLink to="reference/mcp-tools">MCP tools</CanvasLink>'`,
    );
  });

  it('@task-3: example canvas ids are exactly "team-canvas/index", "guides/editing-workflow", "reference/canvas-format", "reference/architecture", "reference/http-api", "reference/mcp-tools", and "reference/knowledge-links", and docs and the skill use that project index root', async () => {
    const ids = (await listIds(storeRoot)).slice().sort();
    expect(ids).toEqual(IDS.slice().sort());
    expect(ids).not.toContain("index");

    const sources = new Map<string, string>();
    for (const id of ids) {
      const source = await readFile(path.join(storeRoot, `${id}.canvas.tsx`), "utf8");
      sources.set(id, source);
      expect(source, id).not.toMatch(/<CanvasLink to="index">/);
      expect(canvasLinkTos(source), id).toEqual(LINKS[id]);
    }
    expect(sources.get("reference/knowledge-links")).toContain(
      `'<CanvasLink to="reference/mcp-tools">MCP tools</CanvasLink>'`,
    );
    expect(sources.get("reference/http-api")).not.toContain("team-canvas/index");
    expect(sources.get("reference/mcp-tools")).not.toContain("team-canvas/index");

    const readme = await readFile(path.join(repoRoot, "README.md"), "utf8");
    const gettingStarted = await readFile(
      path.join(repoRoot, "docs/getting-started.md"),
      "utf8",
    );
    for (const doc of [readme, gettingStarted]) {
      expect(doc).toContain(
        "ids start at `team-canvas/index`, `guides/editing-workflow`, and `reference/mcp-tools`",
      );
      expect(doc).toContain(
        "library toggle is Folders (filesystem) and Knowledge (canvases reached from each id whose last segment is `index`, with everything else under Unlinked)",
      );
      expect(doc).toContain("OKF root is `<project-name>/index`");
      expect(doc).toContain("canvas id may contain `/`");
      expect(doc).toContain("library is a tree");
      expect(doc).toContain("upload is one file in the store root");
      expect(doc).toContain("team-canvas serve examples/okf");
      expect(doc).not.toMatch(/\bCursor\b/);
    }
    for (const image of [
      "images/library.png",
      "images/viewer.png",
      "images/oriented-add.png",
      "images/oriented-filled.png",
      "images/code-view.png",
    ]) {
      expect(gettingStarted).toContain(image);
    }

    const http = readme.slice(
      readme.indexOf("### HTTP API"),
      readme.indexOf("## MCP for AI agents"),
    );
    const readmeTools = readme.split("\n").find((line) => line.startsWith("Tools:"));
    const gettingStartedTools = gettingStarted
      .split("\n")
      .find((line) => line.startsWith("Tools:"));
    const sha1 = (text: string) => createHash("sha1").update(text).digest("hex");
    expect(sha1(http)).toBe(HTTP_TABLE_SHA1);
    expect(sha1(readmeTools ?? "")).toBe(README_MCP_TOOLS_SHA1);
    expect(sha1(gettingStartedTools ?? "")).toBe(GETTING_STARTED_MCP_TOOLS_SHA1);

    const png = await readFile(path.join(repoRoot, "docs/images/library.png"));
    expect(createHash("sha1").update(png).digest("hex")).toBe(LIBRARY_PNG_SHA1);

    const skill = await readFile(SKILL_PATH, "utf8");
    expect(path.relative(repoRoot, SKILL_PATH).startsWith("..")).toBe(true);
    expect(skill).toContain("The root is `<project-name>/index`");
    expect(skill).toContain("The worked example id is `team-canvas/index`");
    expect(skill).toContain('to="team-canvas/index"');
    expect(skill).not.toMatch(/<CanvasLink to="index">/);
    const listed = execFileSync("git", ["ls-files"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(
      listed.split("\n").some((line) => line.endsWith("SKILL.md") || line.includes("skills/okf/")),
    ).toBe(false);
    expect(
      execFileSync("git", ["status", "--porcelain", "--", "SKILL.md"], {
        cwd: repoRoot,
        encoding: "utf8",
      }),
    ).toBe("");
  });
});
