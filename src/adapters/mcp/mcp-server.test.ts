import { once } from "node:events";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { createCanvasEditOps } from "../../app/edit/canvas-edit-ops.js";
import { CLI_USAGE, parseMcpArgs, runCli } from "../../cli.js";
import { LocalFilesystemCanvasStore } from "../store/local-fs-canvas-store.js";
import {
  callMcpTool,
  encodeMcpMessage,
  extractMcpMessages,
  handleMcpJsonRpc,
  MCP_PROTOCOL_VERSION,
  MCP_TOOL_DEFS,
  startMcpStdioServer,
  META_PROPS,
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
  const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });
  return { root, ops };
}

describe("mcp stdio server", () => {
  it("@task-5: mcp tools call shared ops, write visible on disk, CLI documents mcp, unsafe/empty errors are clear", async () => {
    expect(CLI_USAGE).toMatch(/\bmcp\b/);
    expect(parseMcpArgs(["mcp", "/tmp/canvases"]).root).toBe("/tmp/canvases");
    await expect(runCli([])).rejects.toThrow(/mcp/);

    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-mcp-"));
    await writeFile(path.join(root, "demo.canvas.tsx"), TWO_CARDS, "utf8");

    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });
    const toolNames = MCP_TOOL_DEFS.map((t) => t.name);
    expect(toolNames).toEqual([
      "list_canvases",
      "create_canvas",
      "read_source",
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
      slots: Array<{ id: string; label: string }>;
    };
    expect(addBody).toEqual({
      ok: true,
      id: "demo",
      slots: [
        { id: expect.any(String), label: "Card header" },
        { id: expect.any(String), label: "Text" },
        { id: expect.any(String), label: "Button label" },
      ],
    });
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
    expect(JSON.parse(fill.content[0]!.text)).toEqual({
      ok: true,
      id: "demo",
      slots: [],
    });

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
      ops: createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false }),
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
      "create_canvas",
      "read_source",
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
        ...META_PROPS,
        id: { type: "string" },
        source: { type: "string" },
      },
      required: ["id", "source", "actor"],
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
      properties: { ...META_PROPS, id: { type: "string" } },
      required: ["id", "actor"],
    });
    expect(
      MCP_TOOL_DEFS.find((t) => t.name === "fill_slots")?.inputSchema,
    ).toEqual({
      type: "object",
      properties: {
        ...META_PROPS,
        id: { type: "string" },
        slots: {
          type: "object",
          additionalProperties: { type: "string" },
        },
      },
      required: ["id", "slots", "actor"],
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

  it("mutation:tools/list description and required fields are literals", async () => {
    const { ops } = await tempOps();
    const listed = await handleMcpJsonRpc(ops, { id: 11, method: "tools/list" });
    expect(listed?.error).toBeUndefined();
    const tools = (
      listed?.result as {
        tools: Array<{
          name: string;
          description: string;
          inputSchema: {
            type: string;
            properties: Record<string, unknown>;
            required?: string[];
          };
        }>;
      }
    ).tools;
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    const idProp = { id: { type: "string" } };

    expect(byName.list_canvases).toEqual({
      name: "list_canvases",
      description:
        'List canvas ids in the store root. Ids are relative to the store root and may contain "/".',
      inputSchema: { type: "object", properties: {} },
    });
    expect(byName.create_canvas).toEqual({
      name: "create_canvas",
      description:
        "Create a new canvas. Optional source; without it a starter canvas is written. Fails if the id already exists. Needs the lease on the new id (acquire_lease first)",
      inputSchema: {
        type: "object",
        properties: {
          ...META_PROPS,
          id: { type: "string" },
          source: { type: "string" },
        },
        required: ["id", "actor"],
      },
    });
    expect(byName.read_source).toEqual({
      name: "read_source",
      description: "Read full .canvas.tsx source for an id",
      inputSchema: {
        type: "object",
        properties: idProp,
        required: ["id"],
      },
    });
    expect(byName.write_source).toEqual({
      name: "write_source",
      description:
        "Replace the ENTIRE .canvas.tsx source for an id. For a change to part of a canvas use replace_in_source instead",
      inputSchema: {
        type: "object",
        properties: {
          ...META_PROPS,
          id: { type: "string" },
          source: { type: "string" },
        },
        required: ["id", "source", "actor"],
      },
    });
    expect(byName.replace_in_source).toEqual({
      name: "replace_in_source",
      description:
        "Replace exact text in a canvas without rewriting the file. Fails if old_string is not found, or matches more than once unless replace_all is true. Use search_source to find the text; prefer this over write_source for changes to large canvases",
      inputSchema: {
        type: "object",
        properties: {
          ...META_PROPS,
          id: { type: "string" },
          old_string: { type: "string" },
          new_string: { type: "string" },
          replace_all: { type: "boolean" },
        },
        required: ["id", "old_string", "new_string", "actor"],
      },
    });
    expect(byName.check_canvas).toEqual({
      name: "check_canvas",
      description:
        "Check that a canvas still builds. Returns { ok: true } or { ok: false, error } with line:col messages. Call it after write_source, replace_in_source or fill_slots to catch syntax errors, bad imports and a missing default export",
      inputSchema: {
        type: "object",
        properties: idProp,
        required: ["id"],
      },
    });
    expect(byName.search_source).toEqual({
      name: "search_source",
      description: "Search one canvas source; returns line + snippet matches",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          query: { type: "string" },
        },
        required: ["id", "query"],
      },
    });
    expect(byName.inspect_orientation).toEqual({
      name: "inspect_orientation",
      description:
        "Describe the repeating sibling pattern, whether Add is available, and the blank slots still in the file (id, label)",
      inputSchema: {
        type: "object",
        properties: idProp,
        required: ["id"],
      },
    });
    expect(byName.add_oriented).toEqual({
      name: "add_oriented",
      description:
        "Clone the repeating sibling with blank slots; returns the new slots (id, label) in document order",
      inputSchema: {
        type: "object",
        properties: { ...META_PROPS, ...idProp },
        required: ["id", "actor"],
      },
    });
    expect(byName.fill_slots).toEqual({
      name: "fill_slots",
      description:
        "Fill blank slots by id (see add_oriented or inspect_orientation); returns the slots still blank",
      inputSchema: {
        type: "object",
        properties: {
          ...META_PROPS,
          id: { type: "string" },
          slots: {
            type: "object",
            additionalProperties: { type: "string" },
          },
        },
        required: ["id", "slots", "actor"],
      },
    });
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

    // Whitespace-only line between NDJSON objects is skipped, not parsed.
    const blankBetween = extractMcpMessages(
      '{"id":1,"method":"ping"}\n   \n{"id":2,"method":"ping"}\n',
    );
    expect(blankBetween.messages).toEqual([
      { id: 1, method: "ping" },
      { id: 2, method: "ping" },
    ]);
    expect(blankBetween.rest).toBe("");

    // Content-Length consumes exactly `len` bytes; trailing bytes stay in rest.
    const pingBody = JSON.stringify({ id: 3, method: "ping" });
    const withTail = `Content-Length: ${pingBody.length}\r\n\r\n${pingBody}TAIL`;
    const tailed = extractMcpMessages(withTail);
    expect(tailed.messages).toEqual([{ id: 3, method: "ping" }]);
    expect(tailed.rest).toBe("TAIL");
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
    // end() does not set readableEnded until the stream is consumed.
    stdin.resume();
    stdin.end();
    await once(stdin, "end");
    expect(stdin.readableEnded).toBe(true);
    // 'end' already fired, so only the readableEnded check can resolve.
    await expect(
      startMcpStdioServer({ root, stdin, stdout, ops }),
    ).resolves.toBeUndefined();
  });

  it("mutation:stdio: utf8 string chunks are NDJSON, not Content-Length", async () => {
    const { root, ops } = await tempOps(
      "export default function D() { return null }\n",
    );
    const stdin = new PassThrough();
    stdin.setEncoding("utf8");
    const stdout = new PassThrough();
    let out = "";
    stdout.on("data", (c: Buffer | string) => {
      out += typeof c === "string" ? c : c.toString("utf8");
    });
    const done = startMcpStdioServer({ root, stdin, stdout, ops });
    stdin.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
    stdin.end();
    await done;
    expect(out).not.toMatch(/Content-Length:/);
    expect(JSON.parse(out.trim())).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {},
    });
  });

  it("mutation:stdio: leading space is NDJSON; framed mode stays Content-Length; junk header does not throw", async () => {
    const { root, ops } = await tempOps(
      "export default function D() { return null }\n",
    );
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    let out = "";
    let resolveSecond!: () => void;
    const gotSecond = new Promise<void>((r) => {
      resolveSecond = r;
    });
    stdout.on("data", (c: Buffer) => {
      out += c.toString("utf8");
      if (out.includes('"id":2')) resolveSecond();
    });
    const done = startMcpStdioServer({ root, stdin, stdout, ops });

    // Leading whitespace still selects NDJSON (trimStart, not trimEnd).
    stdin.write('  {"jsonrpc":"2.0","id":1,"method":"ping"}\n');
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no id 1")), 1000);
      stdout.on("data", () => {
        if (out.includes('"id":1')) {
          clearTimeout(timer);
          resolve();
        }
      });
      if (out.includes('"id":1')) {
        clearTimeout(timer);
        resolve();
      }
    });
    expect(out).not.toMatch(/Content-Length:/);
    expect(JSON.parse(out.trim())).toMatchObject({ id: 1, result: {} });

    stdin.end();
    await done;

    // Once Content-Length is chosen, a later `{` message is still answered with Content-Length.
    const stdin2 = new PassThrough();
    const stdout2 = new PassThrough();
    let out2 = "";
    stdout2.on("data", (c: Buffer) => {
      out2 += c.toString("utf8");
      if (out2.includes('"id":2')) resolveSecond();
    });
    const done2 = startMcpStdioServer({ root, stdin: stdin2, stdout: stdout2, ops });
    stdin2.write(
      encodeMcpMessage({ jsonrpc: "2.0", id: 1, method: "ping" }),
    );
    stdin2.write('{"jsonrpc":"2.0","id":2,"method":"ping"}\n');
    await gotSecond;
    stdin2.end();
    await done2;
    const frames = out2.split("Content-Length:").length - 1;
    expect(frames).toBeGreaterThanOrEqual(2);
    expect(out2).toContain('"id":2');

    // A header block that is not Content-Length is left unparsed; the server still ends.
    const stdin3 = new PassThrough();
    const stdout3 = new PassThrough();
    const done3 = startMcpStdioServer({ root, stdin: stdin3, stdout: stdout3, ops });
    stdin3.write("Foo: bar\r\n\r\nxyz");
    stdin3.end();
    await expect(done3).resolves.toBeUndefined();
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

  it("create_canvas: writes a starter or the given source, same { ok, id } as HTTP, refuses duplicates and bad ids", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-mcp-new-"));
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });

    const made = await callMcpTool(ops, "create_canvas", { id: "fresh" });
    expect(made.isError).toBeFalsy();
    expect(JSON.parse(made.content[0]!.text)).toEqual({ ok: true, id: "fresh" });
    const starter = await readFile(path.join(root, "fresh.canvas.tsx"), "utf8");
    expect(starter).toContain("export default function Fresh()");

    const custom = "export default function C() { return null }\n";
    await callMcpTool(ops, "create_canvas", { id: "mine", source: custom });
    expect(await readFile(path.join(root, "mine.canvas.tsx"), "utf8")).toBe(custom);

    const dup = await callMcpTool(ops, "create_canvas", { id: "fresh" });
    expect(dup.isError).toBe(true);
    expect(dup.content[0]!.text).toMatch(/already exists/);
    // The existing canvas was not touched.
    expect(await readFile(path.join(root, "fresh.canvas.tsx"), "utf8")).toBe(starter);

    const nested = await callMcpTool(ops, "create_canvas", { id: "notes/demo" });
    expect(nested.isError).toBeFalsy();
    expect(JSON.parse(nested.content[0]!.text)).toEqual({ ok: true, id: "notes/demo" });
    const nestedFile = await readFile(path.join(root, "notes", "demo.canvas.tsx"), "utf8");
    expect(nestedFile).toContain("export default function NotesDemo()");

    for (const bad of ["../x", "", "-x", "a b", "notes/edit", "notes/links"]) {
      const r = await callMcpTool(ops, "create_canvas", { id: bad });
      expect(r.isError, bad).toBe(true);
      expect(r.content[0]!.text, bad).toMatch(/Invalid canvas id/);
    }
    const flatEdit = await callMcpTool(ops, "create_canvas", { id: "edit" });
    expect(flatEdit.isError).toBeFalsy();
    expect(JSON.parse(flatEdit.content[0]!.text)).toEqual({ ok: true, id: "edit" });
    const noId = await callMcpTool(ops, "create_canvas", {});
    expect(noId.isError).toBe(true);

    // Non-string source is ignored; a starter canvas is written.
    const num = await callMcpTool(ops, "create_canvas", {
      id: "numsrc",
      source: 1 as never,
    });
    expect(num.isError).toBeFalsy();
    expect(JSON.parse(num.content[0]!.text)).toEqual({ ok: true, id: "numsrc" });
    expect(await readFile(path.join(root, "numsrc.canvas.tsx"), "utf8")).toContain(
      "export default function Numsrc()",
    );
  });

  it("replace_in_source: edits in place with the same { ok, id, replacements } as HTTP; ambiguous, missing and malformed calls are errors", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-mcp-replace-"));
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });
    const file = path.join(root, "demo.canvas.tsx");
    await writeFile(file, TWO_CARDS, "utf8");

    const ok = await callMcpTool(ops, "replace_in_source", {
      id: "demo",
      old_string: "Go alpha",
      new_string: "Go first",
    });
    expect(ok.isError).toBeFalsy();
    expect(JSON.parse(ok.content[0]!.text)).toEqual({ ok: true, id: "demo", replacements: 1 });
    expect(await readFile(file, "utf8")).toBe(TWO_CARDS.replace("Go alpha", "Go first"));

    const after = await readFile(file, "utf8");
    const ambiguous = await callMcpTool(ops, "replace_in_source", {
      id: "demo",
      old_string: "<Card>",
      new_string: "<Card >",
    });
    expect(ambiguous.isError).toBe(true);
    expect(ambiguous.content[0]!.text).toMatch(/matches 2 places/);
    const all = await callMcpTool(ops, "replace_in_source", {
      id: "demo",
      old_string: "<Card>",
      new_string: "<Card >",
      replace_all: true,
    });
    expect(JSON.parse(all.content[0]!.text).replacements).toBe(2);
    expect(await readFile(file, "utf8")).toBe(after.split("<Card>").join("<Card >"));

    for (const args of [
      { id: "demo", old_string: "absent", new_string: "x" },
      { id: "demo", old_string: "", new_string: "x" },
      { id: "demo", old_string: "Alpha" },
      { old_string: "a", new_string: "b" },
      { id: "nope", old_string: "a", new_string: "b" },
    ]) {
      const r = await callMcpTool(ops, "replace_in_source", args);
      expect(r.isError, JSON.stringify(args)).toBe(true);
    }
  });

  it("check_canvas: reports ok, then a build error with line:col after a bad edit; missing id is an error", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-mcp-check-"));
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });
    await writeFile(path.join(root, "demo.canvas.tsx"), "export default function A() { return <div>hi</div> }\n", "utf8");

    const good = await callMcpTool(ops, "check_canvas", { id: "demo" });
    expect(good.isError).toBe(false);
    expect(JSON.parse(good.content[0]!.text)).toEqual({ ok: true, id: "demo" });

    await callMcpTool(ops, "replace_in_source", { id: "demo", old_string: "</div>", new_string: "" });
    const bad = JSON.parse((await callMcpTool(ops, "check_canvas", { id: "demo" })).content[0]!.text);
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/^\d+:\d+ /);

    expect((await callMcpTool(ops, "check_canvas", { id: "nope" })).isError).toBe(true);
    expect((await callMcpTool(ops, "check_canvas", {})).isError).toBe(true);
  });

  it("@task-2: list_links returns the same JSON as listLinks, errors with the ops message, and describes outgoing canvas ids plus read_source and search_source", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-mcp-links-"));
    const notes = [
      "export default function Notes() {",
      "  return (",
      '    <CanvasLink to="billing">Billing</CanvasLink>',
      "  );",
      "}",
      "",
    ].join("\n");
    await writeFile(path.join(root, "notes.canvas.tsx"), notes, "utf8");
    await writeFile(
      path.join(root, "billing.canvas.tsx"),
      "export default function Billing() { return null }\n",
      "utf8",
    );
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });

    const desc = MCP_TOOL_DEFS.find((t) => t.name === "list_links")?.description ?? "";
    expect(desc).toMatch(/outgoing canvas ids/i);
    expect(desc).toContain("read_source to read one");
    expect(desc).toContain("search_source to search the canvas itself");
    expect(MCP_TOOL_DEFS.find((t) => t.name === "list_links")?.inputSchema).toEqual({
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    });

    const listed = await ops.listLinks("notes");
    const got = await callMcpTool(ops, "list_links", { id: "notes" });
    expect(got.isError).toBeFalsy();
    expect(JSON.parse(got.content[0]!.text)).toEqual(listed);

    let missingMessage = "";
    try {
      await ops.listLinks("absent");
    } catch (err) {
      missingMessage = err instanceof Error ? err.message : String(err);
    }
    expect(missingMessage).toMatch(/ENOENT/);
    const missing = await callMcpTool(ops, "list_links", { id: "absent" });
    expect(missing.isError).toBe(true);
    expect(missing.content[0]!.text).toBe(missingMessage);

    for (const bad of ["", "..", "a\\b"]) {
      let opsMessage = "";
      try {
        await ops.listLinks(bad);
      } catch (err) {
        opsMessage = err instanceof Error ? err.message : String(err);
      }
      expect(opsMessage, bad).toMatch(/Invalid canvas id/);
      const mcp = await callMcpTool(ops, "list_links", { id: bad });
      expect(mcp.isError, bad).toBe(true);
      expect(mcp.content[0]!.text, bad).toBe(opsMessage);
    }

    await writeFile(
      path.join(root, "notes.canvas.tsx"),
      "export default function Notes() { return <div>no links</div> }\n",
      "utf8",
    );
    const empty = await callMcpTool(ops, "list_links", { id: "notes" });
    expect(empty.isError).toBeFalsy();
    expect(JSON.parse(empty.content[0]!.text)).toEqual([]);
  });

  it("@task-3: backlinks returns the same JSON as backlinks, errors with the ops message, and describes who links here plus read_source and search_source", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-mcp-backlinks-"));
    const a = [
      "export default function A() {",
      "  return (",
      "    <div>",
      '      <CanvasLink to="b">First</CanvasLink>',
      '      <CanvasLink to="b">Second</CanvasLink>',
      "    </div>",
      "  );",
      "}",
      "",
    ].join("\n");
    const c = [
      "export default function C() {",
      '  return <CanvasLink to="b">From C</CanvasLink>;',
      "}",
      "",
    ].join("\n");
    await writeFile(path.join(root, "a.canvas.tsx"), a, "utf8");
    await writeFile(
      path.join(root, "b.canvas.tsx"),
      "export default function B() { return null }\n",
      "utf8",
    );
    await writeFile(path.join(root, "c.canvas.tsx"), c, "utf8");
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });

    const desc = MCP_TOOL_DEFS.find((t) => t.name === "backlinks")?.description ?? "";
    expect(desc).toMatch(/lists who links here/i);
    expect(desc).toContain("read_source to read one");
    expect(desc).toContain("search_source to search the canvas itself");
    expect(MCP_TOOL_DEFS.find((t) => t.name === "backlinks")?.inputSchema).toEqual({
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    });

    const listed = await ops.backlinks("b");
    expect(listed.map((row) => row.from).sort()).toEqual(["a", "a", "c"]);
    const got = await callMcpTool(ops, "backlinks", { id: "b" });
    expect(got.isError).toBeFalsy();
    expect(JSON.parse(got.content[0]!.text)).toEqual(listed);

    let missingMessage = "";
    try {
      await ops.backlinks("absent");
    } catch (err) {
      missingMessage = err instanceof Error ? err.message : String(err);
    }
    expect(missingMessage).toMatch(/ENOENT/);
    const missing = await callMcpTool(ops, "backlinks", { id: "absent" });
    expect(missing.isError).toBe(true);
    expect(missing.content[0]!.text).toBe(missingMessage);

    for (const bad of ["", "..", "a\\b"]) {
      let opsMessage = "";
      try {
        await ops.backlinks(bad);
      } catch (err) {
        opsMessage = err instanceof Error ? err.message : String(err);
      }
      expect(opsMessage, bad).toMatch(/Invalid canvas id/);
      const mcp = await callMcpTool(ops, "backlinks", { id: bad });
      expect(mcp.isError, bad).toBe(true);
      expect(mcp.content[0]!.text, bad).toBe(opsMessage);
    }

    const blank = "export default function X() { return null }\n";
    for (const id of ["a", "b", "c"]) {
      await writeFile(path.join(root, `${id}.canvas.tsx`), blank, "utf8");
    }
    const emptyOps = await ops.backlinks("b");
    expect(emptyOps).toEqual([]);
    const empty = await callMcpTool(ops, "backlinks", { id: "b" });
    expect(empty.isError).toBeFalsy();
    expect(JSON.parse(empty.content[0]!.text)).toEqual(emptyOps);
  });

  it("@task-4: search_linked returns the same JSON as searchLinked, errors with the ops message, and describes a substring search of those direct targets", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-mcp-search-linked-"));
    const a = [
      "export default function A() {",
      "  return (",
      "    <div>",
      "      needle on a",
      '      <CanvasLink to="b">B</CanvasLink>',
      '      <CanvasLink to="ghost">Gone</CanvasLink>',
      '      <CanvasLink to="b">Again</CanvasLink>',
      '      <CanvasLink to="e">E</CanvasLink>',
      "    </div>",
      "  );",
      "}",
      "",
    ].join("\n");
    await writeFile(path.join(root, "a.canvas.tsx"), a, "utf8");
    await writeFile(
      path.join(root, "b.canvas.tsx"),
      'const code = "needle";\nexport default function B() {\n  return <span className="needle">x</span>;\n}\n',
      "utf8",
    );
    await writeFile(
      path.join(root, "c.canvas.tsx"),
      'export default function C() {\n  return <CanvasLink to="a">needle</CanvasLink>;\n}\n',
      "utf8",
    );
    await writeFile(
      path.join(root, "d.canvas.tsx"),
      "export default function D() {\n  return <div>needle</div>;\n}\n",
      "utf8",
    );
    await writeFile(
      path.join(root, "e.canvas.tsx"),
      "export default function E() {\n  return <code>needle</code>;\n}\n",
      "utf8",
    );
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });

    const desc = MCP_TOOL_DEFS.find((t) => t.name === "search_linked")?.description ?? "";
    expect(desc).toMatch(/substring search of those direct targets/i);
    expect(desc).toContain("read_source to read one");
    expect(desc).toContain("search_source to search the canvas itself");
    expect(MCP_TOOL_DEFS.find((t) => t.name === "search_linked")?.inputSchema).toEqual({
      type: "object",
      properties: {
        id: { type: "string" },
        query: { type: "string" },
      },
      required: ["id", "query"],
    });

    const hits = await ops.searchLinked("a", "needle");
    expect(hits.map((hit) => hit.id)).toEqual(["b", "b", "e"]);
    const got = await callMcpTool(ops, "search_linked", { id: "a", query: "needle" });
    expect(got.isError).toBeFalsy();
    expect(JSON.parse(got.content[0]!.text)).toEqual(hits);

    await expect(ops.searchLinked("a", "")).rejects.toThrow(
      "Search query must be non-empty",
    );
    const emptyQ = await callMcpTool(ops, "search_linked", { id: "a", query: "" });
    expect(emptyQ.isError).toBe(true);
    expect(emptyQ.content[0]!.text).toBe("Search query must be non-empty");

    const noneOps = await ops.searchLinked("a", "zzzz-no-match");
    expect(noneOps).toEqual([]);
    const none = await callMcpTool(ops, "search_linked", {
      id: "a",
      query: "zzzz-no-match",
    });
    expect(none.isError).toBeFalsy();
    expect(JSON.parse(none.content[0]!.text)).toEqual(noneOps);

    await writeFile(
      path.join(root, "a.canvas.tsx"),
      "export default function A() { return <div>needle</div> }\n",
      "utf8",
    );
    const emptyOps = await ops.searchLinked("a", "needle");
    expect(emptyOps).toEqual([]);
    const empty = await callMcpTool(ops, "search_linked", { id: "a", query: "needle" });
    expect(empty.isError).toBeFalsy();
    expect(JSON.parse(empty.content[0]!.text)).toEqual(emptyOps);

    let missingMessage = "";
    try {
      await ops.searchLinked("absent", "needle");
    } catch (err) {
      missingMessage = err instanceof Error ? err.message : String(err);
    }
    expect(missingMessage).toMatch(/ENOENT/);
    const missing = await callMcpTool(ops, "search_linked", {
      id: "absent",
      query: "needle",
    });
    expect(missing.isError).toBe(true);
    expect(missing.content[0]!.text).toBe(missingMessage);
  });

  it('list_links and backlinks for guides/editing-workflow match ops, and list_canvases ids may contain /', async () => {
    const desc = MCP_TOOL_DEFS.find((t) => t.name === "list_canvases")?.description ?? "";
    expect(desc).toContain("relative to the store root");
    expect(desc).toContain('may contain "/"');

    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-mcp-folder-links-"));
    const workflow = [
      "export default function EditingWorkflow() {",
      '  return <CanvasLink to="reference/mcp-tools">MCP tools</CanvasLink>',
      "}",
      "",
    ].join("\n");
    const ops = createCanvasEditOps(LocalFilesystemCanvasStore(root), { requireLease: false });
    await ops.writeSource("guides/editing-workflow", workflow);
    await ops.writeSource(
      "reference/mcp-tools",
      "export default function McpTools() { return <div>needle</div> }\n",
    );

    const listed = await ops.listLinks("guides/editing-workflow");
    expect(listed).toEqual([
      { to: "reference/mcp-tools", line: 2, label: "MCP tools", exists: true },
    ]);
    const got = await callMcpTool(ops, "list_links", { id: "guides/editing-workflow" });
    expect(got.isError).toBeFalsy();
    expect(JSON.parse(got.content[0]!.text)).toEqual(listed);

    const incoming = await ops.backlinks("reference/mcp-tools");
    expect(incoming).toEqual([
      { from: "guides/editing-workflow", line: 2, label: "MCP tools" },
    ]);
    const back = await callMcpTool(ops, "backlinks", { id: "reference/mcp-tools" });
    expect(back.isError).toBeFalsy();
    expect(JSON.parse(back.content[0]!.text)).toEqual(incoming);
  });
});
