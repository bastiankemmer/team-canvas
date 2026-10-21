import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const children: ChildProcess[] = [];
const dirs: string[] = [];

function stop(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGKILL");
}

function run(command: string, args: string[], cwd: string): { stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: 120_000,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status}):\n${stdout}${stderr}`,
    );
  }
  return { stdout, stderr };
}

function packFilename(stdout: string): string {
  const start = stdout.indexOf("[");
  if (start < 0) throw new Error(`npm pack did not return JSON:\n${stdout}`);
  const parsed: unknown = JSON.parse(stdout.slice(start));
  const filename =
    Array.isArray(parsed) &&
    parsed[0] &&
    typeof parsed[0] === "object" &&
    "filename" in parsed[0] &&
    typeof parsed[0].filename === "string"
      ? parsed[0].filename
      : "";
  if (!filename) throw new Error(`npm pack JSON missing filename:\n${stdout}`);
  return filename;
}

/** Resolves once `pattern` appears. Exit before that is a failed start. */
function waitForMatch(
  child: ChildProcess,
  pattern: RegExp,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let out = "";
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      finish(() => reject(new Error(`timed out waiting for ${pattern}. output:\n${out}`)));
    }, timeoutMs);
    const onData = (chunk: Buffer | string) => {
      out += chunk.toString();
      if (pattern.test(out)) finish(() => resolve(out));
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", (err) => finish(() => reject(err)));
    child.on("exit", (code, signal) => {
      finish(() =>
        reject(
          new Error(
            `exited code=${code} signal=${signal} before ${pattern}. output:\n${out}`,
          ),
        ),
      );
    });
  });
}

describe("packed team-canvas bin", () => {
  afterEach(async () => {
    for (const child of children.splice(0)) stop(child);
    await Promise.all(
      dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("starts serve and mcp from a packed install in a clean directory, so the published bin does not die on a missing package name", async () => {
    const scratch = await mkdtemp(path.join(tmpdir(), "team-canvas-pack-"));
    dirs.push(scratch);

    // prepublishOnly runs the suite; packing from this test must not re-enter it.
    run("npm", ["run", "build"], repoRoot);
    const packed = run(
      "npm",
      ["pack", "--ignore-scripts", "--json", "--pack-destination", scratch],
      repoRoot,
    );
    const filename = packFilename(packed.stdout);
    const tarball = path.isAbsolute(filename) ? filename : path.join(scratch, filename);

    const installDir = path.join(scratch, "app");
    const canvases = path.join(installDir, "canvases");
    await mkdir(canvases, { recursive: true });
    await writeFile(
      path.join(installDir, "package.json"),
      JSON.stringify({ name: "pack-check", private: true }),
    );
    run("npm", ["install", "--no-fund", "--no-audit", tarball], installDir);

    const bin = path.join(installDir, "node_modules", "team-canvas", "dist", "cli.js");
    const serve = spawn(
      process.execPath,
      [bin, "serve", canvases, "--host", "127.0.0.1", "--port", "0"],
      { cwd: installDir, stdio: ["ignore", "pipe", "pipe"] },
    );
    children.push(serve);
    const serveOut = await waitForMatch(serve, /team-canvas listening on http:\/\//, 15_000);
    expect(serveOut).not.toMatch(/Cannot find package|ERR_MODULE_NOT_FOUND/);
    stop(serve);

    const mcp = spawn(process.execPath, [bin, "mcp", canvases], {
      cwd: installDir,
      stdio: ["pipe", "pipe", "pipe"],
    });
    children.push(mcp);
    const mcpOut = await waitForMatch(mcp, /team-canvas mcp stdio/, 15_000);
    expect(mcpOut).not.toMatch(/Cannot find package|ERR_MODULE_NOT_FOUND/);
    stop(mcp);
  }, 180_000);
});
