import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
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
import {
  dependencyViolations,
  productionSources,
} from "../../../test/layer-package-imports.js";
import { createCanvasEditOps } from "../../app/edit/canvas-edit-ops.js";
import { startHttpServer } from "../http/http-server.js";
import { LocalFilesystemCanvasStore } from "../store/local-fs-canvas-store.js";

const CURRENT_TOOLS = [
  "list_canvases",
  "create_canvas",
  "read_source",
  "read_facts",
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
  "collect",
];

const CANVAS_ID = "notes/alpha";
const SOURCE = 'export default function Alpha() { return "notes-alpha-canvas" }\n';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function clientFrames(): Buffer {
  return Buffer.concat([
    encodeMcpMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    encodeMcpMessage({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "read_source", arguments: { id: CANVAS_ID } },
    }),
    encodeMcpMessage({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "list_canvases", arguments: {} },
    }),
  ]);
}

type Listed = { result?: { tools?: { name: string }[] } };
type Called = { result?: { content?: { text: string }[]; isError?: boolean } };

function expectClientSession(messages: unknown[]) {
  const listed = messages[0] as Listed;
  const names = listed.result?.tools?.map((tool) => tool.name);
  expect(names).toEqual(CURRENT_TOOLS);

  const read = messages[1] as Called;
  expect(read.result?.isError).toBe(false);
  expect(read.result?.content?.[0]?.text).toBe(SOURCE);

  const canvases = messages[2] as Called;
  expect(canvases.result?.isError).toBe(false);
  const ids = JSON.parse(canvases.result?.content?.[0]?.text ?? "null") as unknown;
  expect(Array.isArray(ids)).toBe(true);
  expect(ids).toContain(CANVAS_ID);
}

describe("mcp package tools", () => {
  it("keeps the existing MCP tools and returns notes/alpha from the store the shell was given, so collect does not replace a client call or become an HTTP route", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-mcp-pkg-"));
    await mkdir(path.join(root, "notes"));
    await writeFile(path.join(root, "notes", "alpha.canvas.tsx"), SOURCE, "utf8");
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), {
      requireLease: false,
    });

    const stdin = new PassThrough();
    const stdout = new PassThrough();
    let out = "";
    stdout.on("data", (chunk: Buffer | string) => {
      out += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });
    const frames = clientFrames();
    const done = startMcpStdioServer({ stdin, stdout, ops });
    stdin.write(frames);
    stdin.end();
    await done;

    const { messages } = extractMcpMessages(out);
    expectClientSession(messages);
    expect((messages[0] as Listed).result?.tools).toEqual(MCP_TOOL_DEFS);

    const direct = await callMcpTool(ops, "read_source", { id: CANVAS_ID });
    expect((messages[1] as Called).result).toEqual(direct);

    // The bin is the shell a client starts. It must open this directory and pass that store in.
    const shell = spawnSync(
      process.execPath,
      [path.join(repoRoot, "dist/cli.js"), "mcp", root],
      { input: frames.toString("utf8"), encoding: "utf8" },
    );
    expect(shell.status, shell.stderr).toBe(0);
    expectClientSession(extractMcpMessages(shell.stdout).messages);

    const server = await startHttpServer({ root, host: "127.0.0.1", port: 0 });
    try {
      for (const route of ["/collect", "/api/collect"]) {
        for (const method of ["GET", "POST"] as const) {
          const response = await fetch(`${server.url}${route}`, { method });
          expect(response.status, `${method} ${route}`).toBe(404);
          expect(await response.text()).not.toContain("notes-alpha-canvas");
        }
      }
    } finally {
      await server.close();
    }

    // Ontology and human stay closed, and mcp does not reach the shell.
    expect(dependencyViolations(productionSources(repoRoot))).toEqual([]);
  });
});
