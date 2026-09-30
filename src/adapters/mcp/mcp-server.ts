import type { Readable, Writable } from "node:stream";
import {
  createCanvasEditOps,
  type CanvasEditOps,
} from "../../app/edit/canvas-edit-ops.js";
import { LocalFilesystemCanvasStore } from "../store/local-fs-canvas-store.js";

/** ponytail: hand-roll tools-only JSON-RPC+stdio; upgrade to an MCP SDK only if framing needs grow. */

export const MCP_PROTOCOL_VERSION = "2024-11-05";

export type McpToolDef = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export const MCP_TOOL_DEFS: McpToolDef[] = [
  {
    name: "list_canvases",
    description: "List canvas ids in the store root",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "create_canvas",
    description:
      "Create a new canvas. Optional source; without it a starter canvas is written. Fails if the id already exists",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        source: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "read_source",
    description: "Read full .canvas.tsx source for an id",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "write_source",
    description:
      "Replace the ENTIRE .canvas.tsx source for an id. For a change to part of a canvas use replace_in_source instead",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        source: { type: "string" },
      },
      required: ["id", "source"],
    },
  },
  {
    name: "replace_in_source",
    description:
      "Replace exact text in a canvas without rewriting the file. Fails if old_string is not found, or matches more than once unless replace_all is true. Use search_source to find the text; prefer this over write_source for changes to large canvases",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        old_string: { type: "string" },
        new_string: { type: "string" },
        replace_all: { type: "boolean" },
      },
      required: ["id", "old_string", "new_string"],
    },
  },
  {
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
  },
  {
    name: "inspect_orientation",
    description:
      "Describe the repeating sibling pattern, whether Add is available, and the blank slots still in the file (id, label)",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "add_oriented",
    description:
      "Clone the repeating sibling with blank slots; returns the new slots (id, label) in document order",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "fill_slots",
    description:
      "Fill blank slots by id (see add_oriented or inspect_orientation); returns the slots still blank",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        slots: {
          type: "object",
          additionalProperties: { type: "string" },
        },
      },
      required: ["id", "slots"],
    },
  },
];

export type McpToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function textResult(value: unknown, isError = false): McpToolResult {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }], isError };
}

function requireString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== "string") {
    throw new Error(`Missing or invalid argument: ${key}`);
  }
  return v;
}

function requireSlotRecord(args: Record<string, unknown>): Record<string, string> {
  const slots = args.slots;
  if (!slots || typeof slots !== "object" || Array.isArray(slots)) {
    throw new Error("Missing or invalid argument: slots");
  }
  const record: Record<string, string> = {};
  for (const [k, v] of Object.entries(slots as Record<string, unknown>)) {
    if (typeof v !== "string") {
      throw new Error(`Slot value for "${k}" must be a string`);
    }
    record[k] = v;
  }
  return record;
}

type ToolHandler = (
  ops: CanvasEditOps,
  args: Record<string, unknown>,
) => Promise<unknown>;

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  list_canvases: (ops) => ops.listCanvases(),
  create_canvas: (ops, args) =>
    ops.createCanvas(
      requireString(args, "id"),
      typeof args.source === "string" ? args.source : undefined,
    ),
  read_source: (ops, args) => ops.readSource(requireString(args, "id")),
  write_source: async (ops, args) => {
    const id = requireString(args, "id");
    await ops.writeSource(id, requireString(args, "source"));
    return { ok: true, id };
  },
  replace_in_source: (ops, args) =>
    ops.replaceInSource(
      requireString(args, "id"),
      requireString(args, "old_string"),
      requireString(args, "new_string"),
      args.replace_all === true,
    ),
  search_source: (ops, args) =>
    ops.searchSource(requireString(args, "id"), requireString(args, "query")),
  inspect_orientation: (ops, args) =>
    ops.inspectOrientation(requireString(args, "id")),
  add_oriented: async (ops, args) => {
    const id = requireString(args, "id");
    return ops.addOriented(id);
  },
  fill_slots: async (ops, args) => {
    const id = requireString(args, "id");
    return ops.fillSlots(id, requireSlotRecord(args));
  },
};

/** Invoke shared edit ops by MCP tool name. */
export async function callMcpTool(
  ops: CanvasEditOps,
  name: string,
  args: Record<string, unknown> = {},
): Promise<McpToolResult> {
  const handler = TOOL_HANDLERS[name];
  if (!handler) return textResult(`Unknown tool: ${name}`, true);
  try {
    return textResult(await handler(ops, args));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return textResult(message, true);
  }
}

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

type RpcHandler = (
  ops: CanvasEditOps,
  id: JsonRpcId,
  params: unknown,
) => Promise<JsonRpcResponse>;

const RPC_HANDLERS: Record<string, RpcHandler> = {
  initialize: async (_ops, id) => ({
    jsonrpc: "2.0",
    id,
    result: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "team-canvas", version: "1.0.0" },
    },
  }),
  "tools/list": async (_ops, id) => ({
    jsonrpc: "2.0",
    id,
    result: { tools: MCP_TOOL_DEFS },
  }),
  "tools/call": async (ops, id, params) => {
    const p = (params ?? {}) as {
      name?: string;
      arguments?: Record<string, unknown>;
    };
    if (!p.name) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: "tools/call requires name" },
      };
    }
    return {
      jsonrpc: "2.0",
      id,
      result: await callMcpTool(ops, p.name, p.arguments ?? {}),
    };
  },
  ping: async (_ops, id) => ({ jsonrpc: "2.0", id, result: {} }),
};

export async function handleMcpJsonRpc(
  ops: CanvasEditOps,
  request: JsonRpcRequest,
): Promise<JsonRpcResponse | null> {
  const id = request.id ?? null;
  const method = request.method;

  if (method?.startsWith("notifications/") || request.id === undefined) {
    return null;
  }

  const handler = method ? RPC_HANDLERS[method] : undefined;
  if (!handler) {
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    };
  }
  // Tool errors are isError payloads from callMcpTool; unexpected throws abort stdio.
  return handler(ops, id, request.params);
}

export function encodeMcpMessage(msg: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(msg), "utf8");
  const header = Buffer.from(
    `Content-Length: ${body.length}\r\n\r\n`,
    "utf8",
  );
  return Buffer.concat([header, body]);
}

/** Parse Content-Length framed or newline-delimited JSON from a string buffer. */
export function extractMcpMessages(buffer: string): {
  messages: JsonRpcRequest[];
  rest: string;
} {
  const messages: JsonRpcRequest[] = [];
  let rest = buffer;

  while (rest.length > 0) {
    const trimmedStart = rest.trimStart();
    if (trimmedStart.startsWith("{")) {
      const lead = rest.length - trimmedStart.length;
      const from = lead > 0 ? rest.slice(lead) : rest;
      const nl = from.indexOf("\n");
      if (nl === -1) break;
      const line = from.slice(0, nl).trim();
      rest = from.slice(nl + 1);
      // ponytail: trim already dropped blank lines via trimStart on next iter; parse non-empty only
      if (line.length > 0) messages.push(JSON.parse(line) as JsonRpcRequest);
      continue;
    }

    const headerEnd = rest.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;
    const header = rest.slice(0, headerEnd);
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) {
      throw new Error("MCP framing missing Content-Length");
    }
    const len = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + len;
    if (rest.length < bodyEnd) break;
    const body = rest.slice(bodyStart, bodyEnd);
    rest = rest.slice(bodyEnd);
    messages.push(JSON.parse(body) as JsonRpcRequest);
  }

  return { messages, rest };
}

export type StartMcpStdioOptions = {
  root: string;
  stdin?: Readable;
  stdout?: Writable;
  ops?: CanvasEditOps;
};

/**
 * Start stdio MCP against a canvases root. Does not start HTTP.
 * Tools call createCanvasEditOps(LocalFilesystemCanvasStore(root)).
 */
export async function startMcpStdioServer(
  options: StartMcpStdioOptions,
): Promise<void> {
  const ops =
    options.ops ??
    createCanvasEditOps(LocalFilesystemCanvasStore(options.root));
  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;

  let pending = "";
  let framed: boolean | null = null;

  const write = (msg: unknown) => {
    if (framed === false) {
      stdout.write(`${JSON.stringify(msg)}\n`);
    } else {
      stdout.write(encodeMcpMessage(msg));
      framed = true;
    }
  };

  const processPending = async () => {
    if (framed === null) {
      const t = pending.trimStart();
      if (t.startsWith("{")) framed = false;
      else if (/Content-Length:/i.test(pending)) framed = true;
      else return;
    }
    const { messages, rest } = extractMcpMessages(pending);
    pending = rest;
    for (const req of messages) {
      const res = await handleMcpJsonRpc(ops, req);
      if (res) write(res);
    }
  };

  return new Promise<void>((resolve, reject) => {
    stdin.on("error", reject);
    stdin.on("data", (chunk: Buffer | string) => {
      pending += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      void processPending().catch(reject);
    });
    stdin.on("end", () => resolve());
    if (stdin.readableEnded) resolve();
  });
}
