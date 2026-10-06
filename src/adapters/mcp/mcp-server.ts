import type { Readable, Writable } from "node:stream";
import {
  createCanvasEditOps,
  type CanvasEditOps,
} from "../../app/edit/canvas-edit-ops.js";
import type { TopicStatus, WriteMeta } from "../../app/settle/settlement.js";
import { LocalFilesystemCanvasStore } from "../store/local-fs-canvas-store.js";

const TOPIC_STATUSES: TopicStatus[] = ["open", "escalated", "settled"];

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

/**
 * Who/why/topic for the change log. A write needs an `actor` that holds the canvas
 * lease (acquire_lease). Pass the same `actor` on every call: pending notices
 * (conflicts, escalations, decisions, leases) for that actor ride along on the reply.
 */
export const META_PROPS = {
  actor: {
    type: "string",
    description:
      "Your stable agent or chat id. Required for writes, which also need the canvas lease. Pass it on every call to receive notices",
  },
  reason: { type: "string", description: "Why you are making this change (kept in the change log)" },
  topic: {
    type: "string",
    description:
      "Decision topic this change belongs to (lowercase, e.g. auth-session-storage), see declare_intent",
  },
};

export const MCP_TOOL_DEFS: McpToolDef[] = [
  {
    name: "list_canvases",
    description:
      'List canvas ids in the store root. Ids are relative to the store root and may contain "/".',
    inputSchema: { type: "object", properties: {} },
  },
  {
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
        ...META_PROPS,
        id: { type: "string" },
        source: { type: "string" },
      },
      required: ["id", "source", "actor"],
    },
  },
  {
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
  },
  {
    name: "check_canvas",
    description:
      "Check that a canvas still builds. Returns { ok: true } or { ok: false, error } with line:col messages. Call it after write_source, replace_in_source or fill_slots to catch syntax errors, bad imports and a missing default export",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
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
    name: "list_links",
    description:
      "Lists outgoing canvas ids. Use read_source to read one and search_source to search the canvas itself",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "backlinks",
    description:
      "Lists who links here. Use read_source to read one and search_source to search the canvas itself",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "search_linked",
    description:
      "Substring search of those direct targets. Use read_source to read one and search_source to search the canvas itself",
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
      properties: {
        ...META_PROPS, id: { type: "string" } },
      required: ["id", "actor"],
    },
  },
  {
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
  },
  {
    name: "acquire_lease",
    description:
      "Take the write lease on a canvas before writing it (also for a canvas you are about to create). Returns { acquired, holder, expiresAt }. acquired:false means another agent holds it: they are told you wait, and you get a notice when it is released. Call again to renew; the lease expires on its own after ttl_seconds",
    inputSchema: {
      type: "object",
      properties: {
        actor: { type: "string" },
        canvas: { type: "string" },
        ttl_seconds: { type: "number", description: "How long the lease holds (default 300, max 3600)" },
      },
      required: ["actor", "canvas"],
    },
  },
  {
    name: "release_lease",
    description:
      "Give the write lease on a canvas back when you are done, so others can write. Only the holder can release",
    inputSchema: {
      type: "object",
      properties: { actor: { type: "string" }, canvas: { type: "string" } },
      required: ["actor", "canvas"],
    },
  },
  {
    name: "list_leases",
    description: "List the live write leases: canvas, holder, expiry and who is waiting",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "declare_intent",
    description:
      "Before you decide or build something other agents might also decide, claim a topic with your plan. Returns conflict:true when another agent holds a different plan (or the topic is settled differently), plus related topics on the same canvas. Call it again to concede (same plan as theirs settles it) or insist; after 2 insisted rounds it goes to a human. Use list_topics first to reuse an existing topic name",
    inputSchema: {
      type: "object",
      properties: {
        actor: { type: "string" },
        topic: { type: "string", description: "Lowercase letters, digits, . _ - (max 80)" },
        plan: { type: "string", description: "What you will do / have decided, in one sentence" },
        reason: { type: "string" },
        canvas: { type: "string", description: "Canvas id this is about, to detect overlap" },
        ttl_seconds: { type: "number", description: "How long your claim holds (default 1800)" },
      },
      required: ["actor", "topic", "plan"],
    },
  },
  {
    name: "list_topics",
    description:
      "List decision topics with every agent's plan and any settled decision. Optional status filter: open, escalated, settled",
    inputSchema: { type: "object", properties: { status: { type: "string" } } },
  },
  {
    name: "escalate_topic",
    description:
      "Hand an open conflict to a human now instead of waiting out the rounds. Do not change your plan until it is settled",
    inputSchema: {
      type: "object",
      properties: { actor: { type: "string" }, topic: { type: "string" } },
      required: ["actor", "topic"],
    },
  },
  {
    name: "list_changes",
    description:
      "Change log: who changed which canvas, with the reason and topic. Filter by canvas, topic or actor; newest last",
    inputSchema: {
      type: "object",
      properties: {
        canvas: { type: "string" },
        topic: { type: "string" },
        actor: { type: "string" },
        limit: { type: "number" },
      },
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

function metaFrom(args: Record<string, unknown>): WriteMeta {
  const { actor, reason, topic } = args;
  return { actor: actor as string, reason: reason as string, topic: topic as string };
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  if (v === undefined) return undefined;
  if (typeof v !== "string") throw new Error(`Invalid argument: ${key}`);
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
      metaFrom(args),
    ),
  read_source: (ops, args) => ops.readSource(requireString(args, "id")),
  write_source: async (ops, args) => {
    const id = requireString(args, "id");
    await ops.writeSource(id, requireString(args, "source"), metaFrom(args));
    return { ok: true, id };
  },
  replace_in_source: (ops, args) =>
    ops.replaceInSource(
      requireString(args, "id"),
      requireString(args, "old_string"),
      requireString(args, "new_string"),
      args.replace_all === true,
      metaFrom(args),
    ),
  check_canvas: (ops, args) => ops.checkCanvas(requireString(args, "id")),
  search_source: (ops, args) =>
    ops.searchSource(requireString(args, "id"), requireString(args, "query")),
  list_links: (ops, args) => ops.listLinks(requireString(args, "id")),
  backlinks: (ops, args) => ops.backlinks(requireString(args, "id")),
  search_linked: (ops, args) =>
    ops.searchLinked(requireString(args, "id"), requireString(args, "query")),
  inspect_orientation: (ops, args) =>
    ops.inspectOrientation(requireString(args, "id")),
  add_oriented: async (ops, args) => {
    const id = requireString(args, "id");
    return ops.addOriented(id, metaFrom(args));
  },
  fill_slots: async (ops, args) => {
    const id = requireString(args, "id");
    return ops.fillSlots(id, requireSlotRecord(args), metaFrom(args));
  },
  acquire_lease: (ops, args) =>
    ops.settlement.acquireLease({
      actor: args.actor,
      canvas: args.canvas,
      ttlSeconds: args.ttl_seconds,
    }),
  release_lease: (ops, args) =>
    ops.settlement.releaseLease({ actor: args.actor, canvas: args.canvas }),
  list_leases: (ops) => ops.settlement.listLeases(),
  declare_intent: (ops, args) =>
    ops.settlement.declareIntent({
      actor: args.actor,
      topic: args.topic,
      plan: args.plan,
      reason: args.reason,
      canvas: args.canvas,
      ttlSeconds: args.ttl_seconds,
    }),
  list_topics: (ops, args) => {
    const status = optionalString(args, "status");
    if (status !== undefined && !TOPIC_STATUSES.includes(status as TopicStatus)) {
      throw new Error(`status must be one of: ${TOPIC_STATUSES.join(", ")}`);
    }
    return ops.settlement.listTopics(status as TopicStatus | undefined);
  },
  escalate_topic: (ops, args) => ops.settlement.escalate(args.actor, args.topic),
  list_changes: (ops, args) =>
    ops.settlement.listChanges({
      canvas: optionalString(args, "canvas"),
      topic: optionalString(args, "topic"),
      actor: optionalString(args, "actor"),
      limit: typeof args.limit === "number" ? args.limit : undefined,
    }),
};

/** Invoke shared edit ops by MCP tool name. */
export async function callMcpTool(
  ops: CanvasEditOps,
  name: string,
  args: Record<string, unknown> = {},
): Promise<McpToolResult> {
  const handler = TOOL_HANDLERS[name];
  if (!handler) return textResult(`Unknown tool: ${name}`, true);
  let result: McpToolResult;
  try {
    result = textResult(await handler(ops, args));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result = textResult(message, true);
  }
  return withNotices(ops, args, result);
}

/**
 * Notices for the calling actor ride along as a second content item, so the tool's own
 * result keeps its shape. Delivered once. A failing notice read never fails the tool.
 */
async function withNotices(
  ops: CanvasEditOps,
  args: Record<string, unknown>,
  result: McpToolResult,
): Promise<McpToolResult> {
  if (typeof args.actor !== "string" || !args.actor.trim()) return result;
  try {
    const notices = await ops.settlement.takeNotices(args.actor.trim());
    if (notices.length === 0) return result;
    const extra = textResult({ notices });
    return { ...result, content: [...result.content, ...extra.content] };
  } catch (err) {
    console.error("[team-canvas] notices:", err instanceof Error ? err.message : err);
    return result;
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
    // One request at a time, in order; "end" waits for the ones still running so a
    // client that closes stdin right after its last request still gets it applied.
    let queue: Promise<void> = Promise.resolve();
    stdin.on("error", reject);
    stdin.on("data", (chunk: Buffer | string) => {
      pending += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      queue = queue.then(processPending).catch(reject);
    });
    stdin.on("end", () => void queue.then(() => resolve()));
    if (stdin.readableEnded) resolve();
  });
}
