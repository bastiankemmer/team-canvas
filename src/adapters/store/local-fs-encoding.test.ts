import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readCalls: unknown[][] = [];
const writeCalls: unknown[][] = [];

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readFile: async (...args: Parameters<typeof actual.readFile>) => {
      readCalls.push([...args]);
      return actual.readFile(...args);
    },
    writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
      writeCalls.push([...args]);
      return actual.writeFile(...args);
    },
  };
});

describe("LocalFilesystemCanvasStore utf8 encoding", () => {
  beforeEach(() => {
    readCalls.length = 0;
    writeCalls.length = 0;
  });

  it("mutation: readState/writeState pass utf8 encoding to fs", async () => {
    vi.resetModules();
    readCalls.length = 0;
    writeCalls.length = 0;

    const { writeFile } = await import("node:fs/promises");
    const { LocalFilesystemCanvasStore } = await import(
      "./local-fs-canvas-store.js"
    );
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-enc-"));
    await writeFile(
      path.join(root, "demo.canvas.tsx"),
      "export default function D(){return null}\n",
      "utf8",
    );
    const store = LocalFilesystemCanvasStore(root);

    writeCalls.length = 0;
    await store.writeState("demo", { n: 1, label: "café" });
    const writeStateCall = writeCalls.find((c) =>
      String(c[0]).endsWith("demo.canvas.data.json"),
    );
    expect(writeStateCall?.[2]).toBe("utf8");

    readCalls.length = 0;
    expect(await store.readState("demo")).toEqual({ n: 1, label: "café" });
    const readStateCall = readCalls.find((c) =>
      String(c[0]).endsWith("demo.canvas.data.json"),
    );
    expect(readStateCall?.[1]).toBe("utf8");
  });
});
