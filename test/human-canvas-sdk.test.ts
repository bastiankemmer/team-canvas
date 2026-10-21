import { realpathSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  startHttpServer,
  type RunningServer,
} from "../src/adapters/http/http-server.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const heading = "Notes from the human layer";

describe("canvas SDK from the human package", () => {
  const servers: RunningServer[] = [];

  afterEach(async () => {
    while (servers.length) {
      await servers.pop()?.close();
    }
  });

  it("serves a canvas that imports team-canvas/canvas and includes its heading, so existing canvases keep rendering from the human package SDK", async () => {
    // Resolve from the root package so Node follows its export map.
    const require = createRequire(path.join(repoRoot, "package.json"));
    expect(realpathSync(require.resolve("team-canvas/canvas"))).toBe(
      realpathSync(require.resolve("@team-canvas/human")),
    );

    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-human-"));
    await writeFile(
      path.join(root, "notes.canvas.tsx"),
      `import { H1 } from "team-canvas/canvas";
export default function Notes() {
  return <H1>${heading}</H1>;
}
`,
      "utf8",
    );

    const server = await startHttpServer({
      root,
      host: "127.0.0.1",
      port: 0,
      requireLease: false,
    });
    servers.push(server);

    const response = await fetch(`${server.url}/canvas/notes`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(heading);
  });
});
