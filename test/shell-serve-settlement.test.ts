import { realpathSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { startHttpServer } from "../src/adapters/http/http-server.js";
import { LocalFilesystemCanvasStore } from "../src/adapters/store/local-fs-canvas-store.js";
import { createSettlement } from "../src/app/settle/settlement.js";
import { runCli, type ServedDirectory } from "../src/cli.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// The modules this test runs. A realpath under packages/ would mean the split moved them.
const shellModules = {
  "../src/cli.ts": runCli,
  "../src/adapters/http/http-server.ts": startHttpServer,
  "../src/adapters/store/local-fs-canvas-store.ts": LocalFilesystemCanvasStore,
  "../src/app/settle/settlement.ts": createSettlement,
} as const;

describe("shell serve, store, and settlement", () => {
  it("serves a directory from the CLI, returns the canvas an HTTP client wrote, and keeps that agent's lease, so serve, the filesystem store, and settlement stay in the shell", async () => {
    const require = createRequire(fileURLToPath(import.meta.url));
    const srcRoot = realpathSync(path.join(repoRoot, "src"));
    const packagesRoot = realpathSync(path.join(repoRoot, "packages"));
    for (const [specifier, fn] of Object.entries(shellModules)) {
      expect(typeof fn).toBe("function");
      const file = realpathSync(require.resolve(specifier));
      expect(file.startsWith(srcRoot + path.sep)).toBe(true);
      expect(file.startsWith(packagesRoot + path.sep)).toBe(false);
    }

    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-shell-"));
    const canvasFile = path.join(root, "notes.canvas.tsx");
    const written =
      "export default function Written() { return <p>held by ada</p> }\n";
    await writeFile(
      canvasFile,
      "export default function Stub() { return null }\n",
      "utf8",
    );

    let served: ServedDirectory | undefined;
    try {
      // Port 0 is listen(0), so this never binds the dev port. The CLI is what listens.
      const started = await runCli([
        "serve",
        root,
        "--host",
        "127.0.0.1",
        "--port",
        "0",
      ]);
      if (!started) throw new Error("CLI serve did not keep the server open");
      served = started;

      // A write is refused until this agent holds the lease, and the lease must still be theirs after the file lands.
      const acquire = await fetch(`${served.url}/api/settlement/leases/acquire`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actor: "ada", canvas: "notes" }),
      });
      expect(acquire.status).toBe(200);
      expect(await acquire.json()).toMatchObject({
        acquired: true,
        holder: "ada",
        canvas: "notes",
      });

      const put = await fetch(`${served.url}/api/canvas/notes/source`, {
        method: "PUT",
        headers: { "x-canvas-actor": "ada" },
        body: written,
      });
      expect(put.status).toBe(204);

      const read = await fetch(`${served.url}/api/canvas/notes/source`);
      expect(read.status).toBe(200);
      expect(await read.text()).toBe(written);
      expect(await readFile(canvasFile, "utf8")).toBe(written);

      const leases = await fetch(`${served.url}/api/settlement/leases`);
      expect(leases.status).toBe(200);
      expect(await leases.json()).toEqual([
        expect.objectContaining({ canvas: "notes", actor: "ada" }),
      ]);
    } finally {
      await served?.close();
    }
  });
});
