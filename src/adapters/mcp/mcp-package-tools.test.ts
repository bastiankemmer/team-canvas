import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  callMcpTool,
  encodeMcpMessage,
  extractMcpMessages,
  MCP_TOOL_DEFS,
  startMcpStdioServer,
} from "@team-canvas/mcp";
import { createCanvasEditOps } from "../../app/edit/canvas-edit-ops.js";
import { LocalFilesystemCanvasStore } from "../store/local-fs-canvas-store.js";

const CURRENT_TOOLS = [
  "list_canvases",
  "create_canvas",
  "read_source",
  "read_sources",
  "write_source",
  "replace_in_source",
  "check_canvas",
  "search_source",
  "list_links",
  "backlinks",
  "search_linked",
  "inspect_orientation",
  "add_oriented",
  "fill_slots",
  "move",
  "acquire_lease",
  "release_lease",
  "list_leases",
  "declare_intent",
  "list_topics",
  "escalate_topic",
  "list_changes",
];

const SOURCE = "export default function Kept() { return null }\n";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("mcp package tools", () => {
  it("lists the current tools from the mcp package and read_source returns the canvas in the directory the shell was given, so a client keeps those tools and the server reads the store the shell passed in", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-mcp-pkg-"));
    await writeFile(path.join(root, "kept.canvas.tsx"), SOURCE, "utf8");
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), {
      requireLease: false,
    });

    const stdin = new PassThrough();
    const stdout = new PassThrough();
    let out = "";
    stdout.on("data", (chunk: Buffer | string) => {
      out += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });
    const done = startMcpStdioServer({ stdin, stdout, ops });
    stdin.write(
      Buffer.concat([
        encodeMcpMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
        encodeMcpMessage({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "read_source", arguments: { id: "kept" } },
        }),
      ]),
    );
    stdin.end();
    await done;

    const { messages } = extractMcpMessages(out);
    const listed = messages[0] as {
      result?: { tools?: { name: string }[] };
    };
    const names = listed.result?.tools?.map((tool) => tool.name);
    expect(names).toEqual(CURRENT_TOOLS);
    expect(names).not.toContain("collect");
    expect(names).not.toContain("read-area");
    expect(listed.result?.tools).toEqual(MCP_TOOL_DEFS);

    const called = messages[1] as {
      result?: { content?: { text: string }[]; isError?: boolean };
    };
    expect(called.result?.isError).toBe(false);
    expect(called.result?.content?.[0]?.text).toBe(SOURCE);

    const direct = await callMcpTool(ops, "read_source", { id: "kept" });
    expect(called.result).toEqual(direct);

    // The bin is the shell a client starts. It must open this directory and pass that store in.
    const payload = Buffer.concat([
      encodeMcpMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      encodeMcpMessage({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "read_source", arguments: { id: "kept" } },
      }),
    ]).toString("utf8");
    const shell = spawnSync(
      process.execPath,
      [path.join(repoRoot, "dist/cli.js"), "mcp", root],
      { input: payload, encoding: "utf8" },
    );
    expect(shell.status).toBe(0);
    const fromShell = extractMcpMessages(shell.stdout).messages;
    const shellListed = fromShell[0] as {
      result?: { tools?: { name: string }[] };
    };
    const shellCalled = fromShell[1] as {
      result?: { content?: { text: string }[]; isError?: boolean };
    };
    expect(shellListed.result?.tools?.map((tool) => tool.name)).toEqual(CURRENT_TOOLS);
    expect(shellCalled.result?.isError).toBe(false);
    expect(shellCalled.result?.content?.[0]?.text).toBe(SOURCE);
  });
});
