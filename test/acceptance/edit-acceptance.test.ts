import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createCanvasEditOps } from "../../src/app/edit/canvas-edit-ops.js";
import { callMcpTool } from "../../src/adapters/mcp/mcp-server.js";
import {
  startHttpServer,
  type RunningServer,
} from "../../src/adapters/http/http-server.js";
import { LocalFilesystemCanvasStore } from "../../src/adapters/store/local-fs-canvas-store.js";

const examplesRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../examples",
);
const FIXTURE_FILE = "oriented-cards-smoke.canvas.tsx";
const FIXTURE_ID = "oriented-cards-smoke";
const KNOWN_STRING = "Body alpha";

describe("edit acceptance", () => {
  const servers: RunningServer[] = [];

  afterEach(async () => {
    while (servers.length) {
      const s = servers.pop();
      await s?.close().catch(() => undefined);
    }
  });

  it("@task-6: edit-path add→fill shows filled card via store/viewer; MCP search returns line+snippet; MCP add/fill goes through shared ops", async () => {
    const fixtureSrc = await readFile(
      path.join(examplesRoot, FIXTURE_FILE),
      "utf8",
    );
    // Literal sibling Cards + shared Button — not a data-array .map list.
    expect(fixtureSrc.match(/<Card>/g)?.length).toBeGreaterThanOrEqual(2);
    expect(fixtureSrc).toMatch(/<Button\s+onClick=\{onAct\}/);
    expect(fixtureSrc).not.toMatch(/\.map\s*\(/);
    expect(fixtureSrc).toContain(KNOWN_STRING);

    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-accept-edit-"));
    await cp(path.join(examplesRoot, FIXTURE_FILE), path.join(root, FIXTURE_FILE));

    const server = await startHttpServer({
      root,
      host: "127.0.0.1",
      port: 0,
    });
    servers.push(server);

    const edit = await fetch(
      `${server.url}/canvas/${encodeURIComponent(FIXTURE_ID)}/edit`,
    );
    expect(edit.status).toBe(200);
    expect(await edit.text()).toContain('data-shell="edit"');

    const added = await fetch(
      `${server.url}/api/canvas/${encodeURIComponent(FIXTURE_ID)}/add-oriented`,
      { method: "POST" },
    );
    expect(added.status).toBe(200);
    const { slots } = (await added.json()) as { slots: { id: string }[] };
    expect(slots.length).toBeGreaterThan(0);

    const store = LocalFilesystemCanvasStore(root);
    const afterAdd = await store.readSource(FIXTURE_ID);
    for (const s of slots) {
      expect(afterAdd).toContain(`__tc_slot_${s.id}__`);
    }

    // Edit chrome rehydrates slot inputs from source tokens (SSE reload contract).
    const editAfterAdd = await fetch(
      `${server.url}/canvas/${encodeURIComponent(FIXTURE_ID)}/edit`,
    );
    expect(editAfterAdd.status).toBe(200);
    const editHtml = await editAfterAdd.text();
    expect(editHtml).toContain("orientInfo.slots");
    // Leftover slots are served with labels, in document order.
    const orientBody = (await (
      await fetch(`${server.url}/api/canvas/${encodeURIComponent(FIXTURE_ID)}/orientation`)
    ).json()) as { slots: { id: string; label: string }[] };
    expect(orientBody.slots).toEqual(slots);

    // Fresh ops (empty process memory) can fill without re-add — source tokens are known.
    const restarted = createCanvasEditOps(LocalFilesystemCanvasStore(root));
    const fills: Record<string, string> = {};
    const values = ["Gamma accept", "Body gamma accept", "Go gamma accept"];
    slots.forEach((s, i) => {
      fills[s.id] = values[i] ?? `accept-${i}`;
    });
    await restarted.fillSlots(FIXTURE_ID, fills);

    const afterHuman = await store.readSource(FIXTURE_ID);
    expect(afterHuman.match(/<Card>/g)?.length).toBe(3);
    expect(afterHuman).toContain("Gamma accept");
    expect(afterHuman).toContain("Body gamma accept");
    for (const s of slots) {
      expect(afterHuman).not.toContain(`__tc_slot_${s.id}__`);
    }

    // Viewer rebuild path (HTTP+bundle) shows the filled card without a browser.
    const viewer = await fetch(
      `${server.url}/canvas/${encodeURIComponent(FIXTURE_ID)}`,
    );
    expect(viewer.status).toBe(200);
    const viewerHtml = await viewer.text();
    expect(viewerHtml).toContain('data-shell="viewer"');
    expect(viewerHtml).toContain("Gamma accept");
    expect(viewerHtml).toContain("Body gamma accept");

    // Fresh copy for MCP path so search hits the pristine known string + add/fill is independent.
    const mcpRoot = await mkdtemp(path.join(tmpdir(), "team-canvas-accept-mcp-"));
    await cp(
      path.join(examplesRoot, FIXTURE_FILE),
      path.join(mcpRoot, FIXTURE_FILE),
    );
    const mcpStore = LocalFilesystemCanvasStore(mcpRoot);
    const baseOps = createCanvasEditOps(mcpStore);
    let addCalls = 0;
    let fillCalls = 0;
    const ops = {
      ...baseOps,
      async addOriented(id: string) {
        addCalls += 1;
        return baseOps.addOriented(id);
      },
      async fillSlots(id: string, slotMap: Record<string, string>) {
        fillCalls += 1;
        return baseOps.fillSlots(id, slotMap);
      },
    };

    const search = await callMcpTool(ops, "search_source", {
      id: FIXTURE_ID,
      query: KNOWN_STRING,
    });
    expect(search.isError).toBeFalsy();
    const hits = JSON.parse(search.content[0]!.text) as Array<{
      line: number;
      snippet: string;
    }>;
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.line).toBeGreaterThan(0);
    expect(hits[0]!.snippet).toContain(KNOWN_STRING);

    const mcpAdd = await callMcpTool(ops, "add_oriented", { id: FIXTURE_ID });
    expect(mcpAdd.isError).toBeFalsy();
    expect(addCalls).toBe(1);
    const { slots: mcpSlots } = JSON.parse(mcpAdd.content[0]!.text) as {
      slots: { id: string }[];
    };
    const mcpFills: Record<string, string> = {};
    mcpSlots.forEach((s, i) => {
      mcpFills[s.id] = `mcp-fill-${i}`;
    });
    const mcpFill = await callMcpTool(ops, "fill_slots", {
      id: FIXTURE_ID,
      slots: mcpFills,
    });
    expect(mcpFill.isError).toBeFalsy();
    expect(fillCalls).toBe(1);

    const afterMcp = await mcpStore.readSource(FIXTURE_ID);
    expect(afterMcp.match(/<Card>/g)?.length).toBe(3);
    expect(afterMcp).toContain("mcp-fill-0");
  });
});
