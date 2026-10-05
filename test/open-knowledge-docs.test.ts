import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const GETTING_STARTED_AFTER_TOOLS =
  ". `create_canvas` takes an `id` and an optional `source`; without a source it writes the same starter canvas as the New button, and it fails if the id already exists. For small changes to a big canvas the agent should find the text with `search_source` and change it with `replace_in_source` (`id`, `old_string`, `new_string`, optional `replace_all`). It fails if the text is missing or matches more than once, so an edit never lands in the wrong place; `write_source` replaces the whole file and is for full rewrites. Reading whole files wastes context. `add_oriented` and `fill_slots` return the same shape as the HTTP API: `{ ok, id, slots }`, where `slots` are the blanks still left, as `{ id, label }`.";

describe("open knowledge docs", () => {
  it("@task-5: docs name the link HTTP routes and MCP tools, and the Open knowledge format roadmap item is gone", () => {
    const readme = readFileSync(path.join(root, "README.md"), "utf8");
    const gettingStarted = readFileSync(
      path.join(root, "docs/getting-started.md"),
      "utf8",
    );
    const roadmap = readFileSync(
      path.join(root, "examples/roadmap.canvas.tsx"),
      "utf8",
    );

    const http = readme.slice(
      readme.indexOf("### HTTP API"),
      readme.indexOf("## MCP for AI agents"),
    );
    expect(http).toContain("`GET /api/canvas/:id/links`");
    expect(http).toContain("`GET /api/canvas/:id/backlinks`");
    expect(http).toContain("`GET /api/canvas/:id/search-linked?q=`");

    const mcp = readme.slice(
      readme.indexOf("## MCP for AI agents"),
      readme.indexOf("## Use canvases"),
    );
    const mcpTools = mcp.split("\n").find((line) => line.startsWith("Tools:"));
    expect(mcpTools).toContain("`list_links`");
    expect(mcpTools).toContain("`backlinks`");
    expect(mcpTools).toContain("`search_linked`");

    expect(readme).not.toMatch(/^- Open knowledge format:/m);

    const architecture = readme.slice(
      readme.indexOf("## Architecture\n"),
      readme.indexOf("\n## Security"),
    );
    expect(
      architecture.split("\n").filter((line) => /^#{2,3} /.test(line)),
    ).toEqual(["## Architecture"]);
    expect(readme.match(/^## Architecture$/gm)).toHaveLength(1);

    const tools = gettingStarted
      .split("\n")
      .find((line) => line.startsWith("Tools:"));
    expect(tools).toBe(
      "Tools: `list_canvases`, `create_canvas`, `read_source`, `write_source`, `replace_in_source`, `search_source`, `inspect_orientation`, `add_oriented`, `fill_slots`, `list_links`, `backlinks`, `search_linked`" +
        GETTING_STARTED_AFTER_TOOLS,
    );
    expect(tools).not.toContain("check_canvas");

    expect(roadmap).not.toContain("Open knowledge format");
  });

  it("@task-9: both docs say a canvas id may contain /, the library is a tree, upload is one file in the store root, and the example is served with team-canvas serve examples/okf so those ids start at team-canvas/index, guides/editing-workflow, and reference/mcp-tools", () => {
    const readme = readFileSync(path.join(root, "README.md"), "utf8");
    const gettingStarted = readFileSync(
      path.join(root, "docs/getting-started.md"),
      "utf8",
    );

    for (const doc of [readme, gettingStarted]) {
      expect(doc).toContain("canvas id may contain `/`");
      expect(doc).toContain("library is a tree");
      expect(doc).toContain("upload is one file in the store root");
      expect(doc).toContain("team-canvas serve examples/okf");
      expect(doc).toContain(
        "ids start at `team-canvas/index`, `guides/editing-workflow`, and `reference/mcp-tools`",
      );
      expect(doc).toContain(
        "library toggle is Folders (filesystem) and Knowledge (canvases reached from each id whose last segment is `index`, with everything else under Unlinked)",
      );
      expect(doc).toContain("OKF root is `<project-name>/index`");
      expect(doc).not.toContain("ids start at `index`,");
      expect(doc).not.toContain("spec/format");
      expect(doc).not.toMatch(/\bCursor\b/);
    }

    expect(gettingStarted).toContain("images/library.png");
    expect(gettingStarted).toContain("images/viewer.png");
    expect(gettingStarted).toContain("images/oriented-add.png");
    expect(gettingStarted).toContain("images/oriented-filled.png");
    expect(gettingStarted).toContain("images/code-view.png");
  });
});
