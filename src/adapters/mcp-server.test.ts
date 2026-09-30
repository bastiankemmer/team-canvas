import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { createCanvasEditOps } from "../app/canvas-edit-ops.js";
import { CLI_USAGE, parseMcpArgs, runCli } from "../cli.js";
import { LocalFilesystemCanvasStore } from "./local-fs-canvas-store.js";
import {
  callMcpTool,
  encodeMcpMessage,
  extractMcpMessages,
  handleMcpJsonRpc,
  MCP_PROTOCOL_VERSION,
  MCP_TOOL_DEFS,
  startMcpStdioServer,
} from "./mcp-server.js";

const TWO_CARDS = `import { Button, Card, CardBody, CardHeader, Stack, Text } from "team-canvas/canvas";

function onAct() {}

export default function OrientedDemo() {
  return (
    <Stack gap={8}>
      <Card>
        <CardHeader>Alpha</CardHeader>
        <CardBody>
          <Text>Body alpha</Text>
          <Button onClick={onAct}>Go alpha</Button>
        </CardBody>
      </Card>
      <Card>
        <CardHeader>Beta</CardHeader>
        <CardBody>
          <Text>Body beta</Text>
          <Button onClick={onAct}>Go beta</Button>
        </CardBody>
      </Card>
    </Stack>
  );
}
`;

async function tempOps(source = TWO_CARDS) {
  const root = await mkdtemp(path.join(tmpdir(), "team-canvas-mcp-"));
  await writeFile(path.join(root, "demo.canvas.tsx"), source, "utf8");
  const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root));
  return { root, ops };
}

describe("mcp stdio server", () => {
  it("@task-5: mcp tools call shared ops, write visible on disk, CLI documents mcp, unsafe/empty errors are clear", async () => {
    expect(CLI_USAGE).toMatch(/\bmcp\b/);
    expect(parseMcpArgs(["mcp", "/tmp/canvases"]).root).toBe("/tmp/canvases");
    await expect(runCli([])).rejects.toThrow(/mcp/);

    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-mcp-"));
    await writeFile(path.join(root, "demo.canvas.tsx"), TWO_CARDS, "utf8");

    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root));
    const toolNames = MCP_TOOL_DEFS.map((t) => t.name);
    expect(toolNames).toEqual([
      "list_canvases",
      "read_source",
      "write_source",
      "search_source",
      "inspect_orientation",
      "add_oriented",
      "fill_slots",
    ]);

    const list = await callMcpTool(ops, "list_canvases");
    expect(list.isError).toBeFalsy();
    expect(JSON.parse(list.content[0]!.text)).toContain("demo");

    const read = await callMcpTool(ops, "read_source", { id: "demo" });
    expect(read.isError).toBeFalsy();
    expect(read.content[0]!.text).toContain("OrientedDemo");

    const replacement =
      'export default function Demo() { return <span>via-mcp</span> }\n';
    const write = await callMcpTool(ops, "write_source", {
      id: "demo",
      source: replacement,
    });
    expect(write.isError).toBeFalsy();
    expect(await readFile(path.join(root, "demo.canvas.tsx"), "utf8")).toBe(
      replacement,
    );

    await callMcpTool(ops, "write_source", { id: "demo", source: TWO_CARDS });

    const search = await callMcpTool(ops, "search_source", {
      id: "demo",
      query: "Body alpha",
    });
    expect(search.isError).toBeFalsy();
    const hits = JSON.parse(search.content[0]!.text) as Array<{
      line: number;
      snippet: string;
    }>;
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]).toMatchObject({
      line: expect.any(Number),
      snippet: expect.stringContaining("Body alpha"),
    });

    const inspect = await callMcpTool(ops, "inspect_orientation", {
      id: "demo",
    });
    expect(inspect.isError).toBeFalsy();
    expect(inspect.content[0]!.text).toMatch(/Card/i);

    const add = await callMcpTool(ops, "add_oriented", { id: "demo" });
    expect(add.isError).toBeFalsy();
    const addBody = JSON.parse(add.content[0]!.text) as {
      ok: boolean;
      id: string;
      slots: Array<{ id: string }>;
    };
    expect(addBody).toEqual({
      ok: true,
      id: "demo",
      slots: expect.arrayContaining([expect.objectContaining({ id: expect.any(String) })]),
    });
    expect(addBody.slots.length).toBeGreaterThan(0);
    const afterAdd = await readFile(
      path.join(root, "demo.canvas.tsx"),
      "utf8",
    );
    expect(afterAdd).not.toBe(TWO_CARDS);

    const fillMap: Record<string, string> = {};
    for (const s of addBody.slots) fillMap[s.id] = `filled-${s.id}`;
    const fill = await callMcpTool(ops, "fill_slots", {
      id: "demo",
      slots: fillMap,
    });
    expect(fill.isError).toBeFalsy();
    expect(JSON.parse(fill.content[0]!.text)).toEqual({ ok: true, id: "demo" });

    const missing = await callMcpTool(ops, "read_source", {
      id: "no-such-canvas",
    });
    expect(missing.isError).toBe(true);
    expect(missing.content[0]!.text.length).toBeGreaterThan(0);

    const unsafe = await callMcpTool(ops, "read_source", { id: "../escape" });
    expect(unsafe.isError).toBe(true);
    expect(unsafe.content[0]!.text).toMatch(/Invalid canvas id/i);

    const emptySearch = await callMcpTool(ops, "search_source", {
      id: "demo",
      query: "",
    });
    expect(emptySearch.isError).toBe(true);
    expect(emptySearch.content[0]!.text).toMatch(/non-empty/i);

    // Stdio MCP round-trip without HTTP: initialize + tools/call write
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    let out = "";
    stdout.on("data", (c: Buffer) => {
      out += c.toString("utf8");
    });
    const serverDone = startMcpStdioServer({
      root,
      stdin,
      stdout,
      ops: createCanvasEditOps(LocalFilesystemCanvasStore(root)),
    });

    stdin.write(
      encodeMcpMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        },
      }),
    );
    stdin.write(
      encodeMcpMessage({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      }),
    );
    const diskWrite =
      'export default function Demo() { return <span>stdio-write</span> }\n';
    stdin.write(
      encodeMcpMessage({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "write_source",
          arguments: { id: "demo", source: diskWrite },
        },
      }),
    );
    stdin.end();
    await serverDone;

    expect(out).toMatch(/protocolVersion/);
    expect(out).toMatch(/list_canvases/);
    expect(out).toMatch(/write_source/);
    expect(await readFile(path.join(root, "demo.canvas.tsx"), "utf8")).toBe(
      diskWrite,
    );

    // JSON-RPC tool error path stays isError (not transport crash)
    const errRpc = await handleMcpJsonRpc(ops, {
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: { name: "search_source", arguments: { id: "demo", query: "" } },
    });
    expect(errRpc?.result).toMatchObject({ isError: true });
  });

  it("mutation:callMcpTool: rejects bad args, unknown tool, fill_slots shapes", async () => {
    const { ops } = await tempOps();

    const unknown = await callMcpTool(ops, "nope");
    expect(unknown).toEqual({
      content: [{ type: "text", text: "Unknown tool: nope" }],
      isError: true,
    });

    for (const bad of [undefined, 1, null, true, {}]) {
      const r = await callMcpTool(ops, "read_source", { id: bad as never });
      expect(r.isError).toBe(true);
      expect(r.content[0]!.text).toMatch(/Missing or invalid argument: id/);
    }

    const noSource = await callMcpTool(ops, "write_source", { id: "demo" });
    expect(noSource.isError).toBe(true);
    expect(noSource.content[0]!.text).toMatch(/source/);

    for (const slots of [undefined, null, "x", 1, ["a"], true]) {
      const r = await callMcpTool(ops, "fill_slots", {
        id: "demo",
        slots: slots as never,
      });
      expect(r.isError).toBe(true);
      expect(r.content[0]!.text).toMatch(/Missing or invalid argument: slots/);
    }

    const badVal = await callMcpTool(ops, "fill_slots", {
      id: "demo",
      slots: { a: 1 as never },
    });
    expect(badVal.isError).toBe(true);
    expect(badVal.content[0]!.text).toMatch(/Slot value for "a" must be a string/);

    const writeOk = await callMcpTool(ops, "write_source", {
      id: "demo",
      source: "export default function D() { return null }\n",
    });
    expect(writeOk.isError).toBeFalsy();
    expect(JSON.parse(writeOk.content[0]!.text)).toEqual({
      ok: true,
      id: "demo",
    });
  });

  it("mutation:handleMcpJsonRpc: notifications, missing id, initialize shape, tools/call, ping, unknown", async () => {
    const { ops } = await tempOps();

    expect(
      await handleMcpJsonRpc(ops, {
        method: "notifications/initialized",
        id: 1,
      }),
    ).toBeNull();
    expect(
      await handleMcpJsonRpc(ops, { method: "tools/list" /* no id */ }),
    ).toBeNull();

    const init = await handleMcpJsonRpc(ops, {
      id: 1,
      method: "initialize",
    });
    expect(init).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "team-canvas", version: "1.0.0" },
      },
    });
    expect(MCP_PROTOCOL_VERSION).toBe("2024-11-05");

    const listed = await handleMcpJsonRpc(ops, { id: 2, method: "tools/list" });
    expect(listed).toEqual({
      jsonrpc: "2.0",
      id: 2,
      result: { tools: MCP_TOOL_DEFS },
    });
    // Schema shapes are part of the MCP contract (not description copy).
    expect(MCP_TOOL_DEFS.map((t) => t.name)).toEqual([
      "list_canvases",
      "read_source",
      "write_source",
      "search_source",
      "inspect_orientation",
      "add_oriented",
      "fill_slots",
    ]);
    expect(
      MCP_TOOL_DEFS.find((t) => t.name === "read_source")?.inputSchema,
    ).toEqual({
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    });
    expect(
      MCP_TOOL_DEFS.find((t) => t.name === "write_source")?.inputSchema,
    ).toEqual({
      type: "object",
      properties: {
        id: { type: "string" },
        source: { type: "string" },
      },
      required: ["id", "source"],
    });
    expect(
      MCP_TOOL_DEFS.find((t) => t.name === "search_source")?.inputSchema,
    ).toEqual({
      type: "object",
      properties: {
        id: { type: "string" },
        query: { type: "string" },
      },
      required: ["id", "query"],
    });
    expect(
      MCP_TOOL_DEFS.find((t) => t.name === "inspect_orientation")?.inputSchema,
    ).toEqual({
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    });
    expect(
      MCP_TOOL_DEFS.find((t) => t.name === "add_oriented")?.inputSchema,
    ).toEqual({
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    });
    expect(
      MCP_TOOL_DEFS.find((t) => t.name === "fill_slots")?.inputSchema,
    ).toEqual({
      type: "object",
      properties: {
        id: { type: "string" },
        slots: {
          type: "object",
          additionalProperties: { type: "string" },
        },
      },
      required: ["id", "slots"],
    });
    expect(
      MCP_TOOL_DEFS.find((t) => t.name === "list_canvases")?.inputSchema,
    ).toEqual({ type: "object", properties: {} });

    const noName = await handleMcpJsonRpc(ops, {
      id: 3,
      method: "tools/call",
      params: {},
    });
    expect(noName).toEqual({
      jsonrpc: "2.0",
      id: 3,
      error: { code: -32602, message: "tools/call requires name" },
    });

    const callOk = await handleMcpJsonRpc(ops, {
      id: 31,
      method: "tools/call",
      params: { name: "list_canvases", arguments: {} },
    });
    expect(callOk?.jsonrpc).toBe("2.0");
    expect(callOk?.id).toBe(31);
    expect(callOk?.error).toBeUndefined();
    const callResult = callOk?.result as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    expect(callResult.isError).toBeFalsy();
    expect(callResult.content[0]!.type).toBe("text");
    expect(JSON.parse(callResult.content[0]!.text)).toContain("demo");

    const ping = await handleMcpJsonRpc(ops, { id: 4, method: "ping" });
    expect(ping).toEqual({ jsonrpc: "2.0", id: 4, result: {} });

    const missingMethod = await handleMcpJsonRpc(ops, { id: 5 });
    expect(missingMethod).toEqual({
      jsonrpc: "2.0",
      id: 5,
      error: { code: -32601, message: "Method not found: undefined" },
    });

    const unknownMethod = await handleMcpJsonRpc(ops, {
      id: 6,
      method: "nope/method",
    });
    expect(unknownMethod).toEqual({
      jsonrpc: "2.0",
      id: 6,
      error: { code: -32601, message: "Method not found: nope/method" },
    });

    const withNullId = await handleMcpJsonRpc(ops, {
      id: null,
      method: "ping",
    });
    expect(withNullId).toEqual({ jsonrpc: "2.0", id: null, result: {} });
  });

  it("mutation:extractMcpMessages: NDJSON, framing, incomplete, missing length", () => {
    const nd = extractMcpMessages(
      '  {"jsonrpc":"2.0","id":1,"method":"ping"}\n{"jsonrpc":"2.0","id":2,"method":"ping"}\n',
    );
    expect(nd.messages).toEqual([
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { jsonrpc: "2.0", id: 2, method: "ping" },
    ]);
    expect(nd.rest).toBe("");

    const partialLine = extractMcpMessages('{"id":1');
    expect(partialLine.messages).toEqual([]);
    expect(partialLine.rest).toBe('{"id":1');

    const blankLine = extractMcpMessages('\n\n{"id":1,"method":"ping"}\n');
    expect(blankLine.messages).toEqual([{ id: 1, method: "ping" }]);

    const body = JSON.stringify({ id: 7, method: "ping" });
    const framed = `Content-Length: ${body.length}\r\n\r\n${body}`;
    const f = extractMcpMessages(framed);
    expect(f.messages).toEqual([{ id: 7, method: "ping" }]);
    expect(f.rest).toBe("");

    const incomplete = extractMcpMessages(
      `Content-Length: 100\r\n\r\n${"x".repeat(10)}`,
    );
    expect(incomplete.messages).toEqual([]);
    expect(incomplete.rest.startsWith("Content-Length:")).toBe(true);

    const noHeaderEnd = extractMcpMessages("Content-Length: 3\r\n");
    expect(noHeaderEnd.messages).toEqual([]);

    expect(() => extractMcpMessages("Foo: bar\r\n\r\nxyz")).toThrow(
      /MCP framing missing Content-Length/,
    );

    // Regex must allow optional spaces after colon and be case-insensitive.
    const spaced = `Content-Length:  ${body.length}\r\n\r\n${body}`;
    expect(extractMcpMessages(spaced).messages).toHaveLength(1);
    const lower = `content-length: ${body.length}\r\n\r\n${body}`;
    expect(extractMcpMessages(lower).messages).toHaveLength(1);

    const encoded = encodeMcpMessage({ id: 1, method: "ping" });
    expect(encoded.toString("utf8")).toMatch(/^Content-Length: \d+\r\n\r\n/);
    expect(encoded.toString("utf8")).toContain('"method":"ping"');
    // utf8 round-trip: body bytes match JSON.stringify length (not empty encoding).
    const round = extractMcpMessages(encoded.toString("utf8"));
    expect(round.messages).toEqual([{ id: 1, method: "ping" }]);
    expect(round.rest).toBe("");

    // Leading whitespace before NDJSON object is skipped via slice(lead).
    const leadWs = extractMcpMessages(
      '  \t{"jsonrpc":"2.0","id":9,"method":"ping"}\n',
    );
    expect(leadWs.messages).toEqual([
      { jsonrpc: "2.0", id: 9, method: "ping" },
    ]);

    // CR-terminated NDJSON lines need trim (slice without trim leaves \\r).
    const cr = extractMcpMessages(
      '{"jsonrpc":"2.0","id":8,"method":"ping"}\r\n',
    );
    expect(cr.messages).toEqual([{ jsonrpc: "2.0", id: 8, method: "ping" }]);
  });

  it("mutation:stdio: newline framing and Buffer chunks", async () => {
    const { root, ops } = await tempOps(
      "export default function D() { return null }\n",
    );
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    let out = "";
    stdout.on("data", (c: Buffer) => {
      out += c.toString("utf8");
    });
    const done = startMcpStdioServer({ root, stdin, stdout, ops });
    // NDJSON mode (no Content-Length) — string chunk
    stdin.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
    // Buffer chunk must be decoded as utf8 (not ignored / wrong typeof branch)
    stdin.write(
      Buffer.from('{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n', "utf8"),
    );
    stdin.end();
    await done;
    expect(out).toContain('"id":1');
    expect(out).toContain('"id":2');
    expect(out).toContain("list_canvases");
    expect(out).not.toMatch(/Content-Length:/);
    // NDJSON responses are newline-delimited JSON objects
    for (const line of out.trim().split("\n")) {
      expect(JSON.parse(line).jsonrpc).toBe("2.0");
    }
  });

  it("mutation:stdio: string-only chunks and notification skip write", async () => {
    const { root, ops } = await tempOps();
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    let out = "";
    stdout.on("data", (c: Buffer) => {
      out += c.toString("utf8");
    });
    const done = startMcpStdioServer({ root, stdin, stdout, ops });
    // Pure string chunks (typeof === "string" branch)
    stdin.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
    // Notification: handleMcpJsonRpc returns null — must not write garbage
    stdin.write(
      '{"jsonrpc":"2.0","method":"notifications/initialized"}\n',
    );
    stdin.write('{"jsonrpc":"2.0","id":2,"method":"ping"}\n');
    stdin.end();
    await done;
    const lines = out
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines).toEqual([
      { jsonrpc: "2.0", id: 1, result: {} },
      { jsonrpc: "2.0", id: 2, result: {} },
    ]);
  });

  it("mutation:stdio: Content-Length framing via default ops factory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-mcp-frame-"));
    await writeFile(
      path.join(root, "demo.canvas.tsx"),
      "export default function D() { return null }\n",
      "utf8",
    );
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    let out = "";
    let resolveOut!: () => void;
    const gotBoth = new Promise<void>((r) => {
      resolveOut = r;
    });
    stdout.on("data", (c: Buffer) => {
      out += c.toString("utf8");
      if (out.includes('"id":2') && out.includes("demo")) resolveOut();
    });
    // No ops — exercises createCanvasEditOps(LocalFilesystemCanvasStore(root))
    // (?? not && — without ops must still serve)
    const done = startMcpStdioServer({ root, stdin, stdout });
    stdin.write(
      Buffer.concat([
        encodeMcpMessage({ jsonrpc: "2.0", id: 1, method: "ping" }),
        encodeMcpMessage({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "list_canvases" },
        }),
      ]),
    );
    await gotBoth;
    stdin.end();
    await done;
    expect(out).toMatch(/Content-Length:\s*\d+/i);
    expect(out).toContain('"id":1');
    expect(out).toContain('"id":2');
    expect(out).toContain("demo");
    // Once framed, subsequent writes stay Content-Length (framed=true sticky)
    const frames = out.split("Content-Length:").length - 1;
    expect(frames).toBeGreaterThanOrEqual(2);
  });

  it("mutation:stdio: readableEnded resolves immediately", async () => {
    const { root, ops } = await tempOps();
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    stdin.end();
    // After end, readableEnded is true — start must resolve without data
    await expect(
      startMcpStdioServer({ root, stdin, stdout, ops }),
    ).resolves.toBeUndefined();
  });

  it("mutation:stdio: waits for Content-Length header before framing", async () => {
    const { root, ops } = await tempOps();
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    let out = "";
    let resolveOut!: () => void;
    const got = new Promise<void>((r) => {
      resolveOut = r;
    });
    stdout.on("data", (c: Buffer) => {
      out += c.toString("utf8");
      if (out.includes('"id":1')) resolveOut();
    });
    const done = startMcpStdioServer({ root, stdin, stdout, ops });
    // Incomplete prefix — not `{` and not yet Content-Length → else return.
    stdin.write("Cont");
    const frame = encodeMcpMessage({ jsonrpc: "2.0", id: 1, method: "ping" });
    // Complete the header word then the rest of the frame.
    stdin.write(Buffer.concat([Buffer.from("ent-Length:", "utf8"), frame.subarray("Content-Length:".length)]));
    await got;
    stdin.end();
    await done;
    expect(out).toMatch(/Content-Length:/);
    expect(out).toContain('"id":1');
  });

  it("mutation:stdio: stdin error rejects", async () => {
    const { root, ops } = await tempOps();
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const done = startMcpStdioServer({ root, stdin, stdout, ops });
    stdin.destroy(new Error("boom-stdin"));
    await expect(done).rejects.toThrow(/boom-stdin/);
  });
});

describe("parseMcpArgs", () => {
  it("crap:parseMcpArgs: rejects bad cmd, flags, extras, missing root", () => {
    expect(() => parseMcpArgs([])).toThrow(/Usage/);
    expect(() => parseMcpArgs(["serve", "/tmp"])).toThrow(/Usage/);
    expect(() => parseMcpArgs(["mcp"])).toThrow(/Usage/);
    expect(() => parseMcpArgs(["mcp", "--root"])).toThrow(/Unknown flag/);
    expect(() => parseMcpArgs(["mcp", "/a", "/b"])).toThrow(
      /Unexpected extra argument/,
    );
    expect(parseMcpArgs(["mcp", "/tmp/x"])).toEqual({ root: "/tmp/x" });
  });
});
