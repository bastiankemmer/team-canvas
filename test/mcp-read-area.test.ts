import { spawnSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { encodeMcpMessage, extractMcpMessages } from "@team-canvas/mcp";
import { collect } from "../packages/ontology/index.js";
import { startHttpServer } from "../src/adapters/http/http-server.js";
import { LocalFilesystemCanvasStore } from "../src/adapters/store/local-fs-canvas-store.js";

const id = "notes/weekly";

const source = [
  'import { Fact, H1, H2, H3, Stack, Text } from "team-canvas/canvas";',
  "",
  'const skipped = "source-only-marker";',
  "",
  "export default function Weekly() {",
  "  return (",
  "    <Stack>",
  '      <Fact id="layer-fact" subject="knowledge-layers" claim="Facts render as Turtle." area="notes/weekly" heading="Weekly" />',
  "      <H1>Weekly</H1>",
  "      <Text>Shipped the store.</Text>",
  "      <H2>Done</H2>",
  "      <Text>Notes stayed.</Text>",
  "      <H3>Blockers</H3>",
  "      <Text>None.</Text>",
  "      <Text>{skipped}</Text>",
  "      <Text>area-tail</Text>",
  "    </Stack>",
  "  );",
  "}",
  "",
].join("\n");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("MCP read-area", () => {
  it("returns the whole derived file for a canvas id, so the client gets every heading in that file and the read leaves the canvas and the markdown unchanged", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-mcp-read-area-"));
    const store = LocalFilesystemCanvasStore(root);
    await store.writeSource(id, source);

    const canvasPath = path.join(root, "notes", "weekly.canvas.tsx");
    const mdPath = path.join(root, "notes", "weekly.md");
    const sourceBytes = await readFile(canvasPath);
    const mdBytes = await readFile(mdPath);
    const derived = mdBytes.toString("utf8");

    expect(sourceBytes.toString("utf8")).toContain("source-only-marker");
    expect(derived).not.toContain("source-only-marker");
    expect(derived).toContain("Weekly");
    expect(derived).toContain("Done");
    expect(derived).toContain("Blockers");
    expect(derived.indexOf("area-tail")).toBeGreaterThan(derived.indexOf("Blockers"));

    const payload = Buffer.concat([
      encodeMcpMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      encodeMcpMessage({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "read-area", arguments: { id } },
      }),
      encodeMcpMessage({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "collect", arguments: { fact_id: "layer-fact" } },
      }),
    ]).toString("utf8");
    const shell = spawnSync(
      process.execPath,
      [path.join(repoRoot, "dist/cli.js"), "mcp", root],
      { input: payload, encoding: "utf8" },
    );
    expect(shell.status, shell.stderr).toBe(0);

    const { messages } = extractMcpMessages(shell.stdout);
    const listed = messages[0] as { result?: { tools?: { name: string }[] } };
    expect(listed.result?.tools?.map((tool) => tool.name)).toContain("read-area");
    expect(listed.result?.tools?.map((tool) => tool.name)).toContain("collect");

    const called = messages[1] as {
      result?: { content?: { type: string; text: string }[]; isError?: boolean };
    };
    const text = called.result?.content?.[0]?.text ?? "";
    expect(called.result?.isError).toBe(false);
    expect(text).toBe(derived);
    const afterWeekly = text.slice(text.indexOf("Weekly") + "Weekly".length);
    expect(afterWeekly).toContain("Done");
    expect(afterWeekly).toContain("Blockers");
    expect(afterWeekly).toContain("area-tail");
    expect(text).not.toContain("source-only-marker");

    const collected = messages[2] as {
      result?: { content?: { text: string }[]; isError?: boolean };
    };
    expect(collected.result?.isError).toBe(false);
    expect(collected.result?.content?.[0]?.text).toBe(collect([source], "layer-fact"));

    expect(await readFile(canvasPath)).toEqual(sourceBytes);
    expect(await readFile(mdPath)).toEqual(mdBytes);

    const server = await startHttpServer({ root, host: "127.0.0.1", port: 0 });
    try {
      for (const route of ["/read-area", "/api/read-area"]) {
        for (const method of ["GET", "POST"] as const) {
          const response = await fetch(`${server.url}${route}`, { method });
          expect(response.status, `${method} ${route}`).toBe(404);
          expect(await response.text()).not.toContain("area-tail");
        }
      }
    } finally {
      await server.close();
    }

    expect(await readFile(canvasPath)).toEqual(sourceBytes);
    expect(await readFile(mdPath)).toEqual(mdBytes);
  });
});
