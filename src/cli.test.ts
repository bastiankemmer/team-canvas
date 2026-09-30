import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseConvertArgs, parseServeArgs, runCli, runConvert } from "./cli.js";

describe("parseServeArgs edge paths", () => {
  it("crap:parseServeArgs: rejects missing serve, root, flag values, and bad port", () => {
    expect(() => parseServeArgs([])).toThrow(/Usage: team-canvas serve/);
    expect(() => parseServeArgs(["serve"])).toThrow(/Usage: team-canvas serve/);
    expect(() => parseServeArgs(["other", "/tmp/x"])).toThrow(
      /Usage: team-canvas serve/,
    );
    expect(() => parseServeArgs(["serve", "--host"])).toThrow(
      /--host requires a value/,
    );
    // Root already set: missing flag values must still throw (not fall through).
    expect(() => parseServeArgs(["serve", "/tmp/x", "--host"])).toThrow(
      /--host requires a value/,
    );
    expect(() => parseServeArgs(["serve", "/tmp/x", "--port"])).toThrow(
      /--port requires a value/,
    );
    expect(() => parseServeArgs(["serve", "/tmp/x", "--port", "nope"])).toThrow(
      /Invalid --port/,
    );
    expect(() => parseServeArgs(["serve", "/tmp/x", "--port", "-1"])).toThrow(
      /Invalid --port/,
    );
    expect(() => parseServeArgs(["serve", "/tmp/x", "--port", "0"])).toThrow(
      /Invalid --port/,
    );
    expect(() => parseServeArgs(["serve", "/tmp/x", "--weird"])).toThrow(
      /Unknown flag/,
    );
    expect(() =>
      parseServeArgs(["serve", "/tmp/a", "/tmp/b"]),
    ).toThrow(/Unexpected extra argument/);
  });

  it("crap:parseServeArgs: accepts root with host and port flags", () => {
    expect(
      parseServeArgs(["serve", "/tmp/root", "--host", "127.0.0.1", "--port", "9"]),
    ).toEqual({ root: "/tmp/root", host: "127.0.0.1", port: 9 });
  });

  it("mutation: rejects port 0; runCli entry guard runs on direct invocation", async () => {
    expect(() => parseServeArgs(["serve", "/tmp/x", "--port", "0"])).toThrow(
      /Invalid --port: 0/,
    );
    await expect(runCli(["serve"])).rejects.toThrow(/Usage: team-canvas serve/);

    const cliJs = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../dist/cli.js",
    );
    const result = spawnSync(process.execPath, [cliJs, "serve"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(`${result.stderr}${result.stdout}`).toMatch(/Usage: team-canvas serve/);
  });
});

describe("convert CLI", () => {
  it("rewrites canvases in place, prints summary, rejects missing path", async () => {
    expect(() => parseConvertArgs(["convert"])).toThrow(/team-canvas convert/);
    expect(() => parseConvertArgs(["serve", "x"])).toThrow(/team-canvas convert/);
    expect(() => parseConvertArgs(["convert", "x"])).toThrow(/--from/);
    expect(() => parseConvertArgs(["convert", "--from", "m"])).toThrow(/team-canvas convert/);
    expect(parseConvertArgs(["convert", "--from", "m", "a", "b"])).toEqual({
      from: "m",
      paths: ["a", "b"],
    });

    const root = mkdtempSync(path.join(tmpdir(), "team-canvas-convert-cli-"));
    const nested = path.join(root, "nested");
    mkdirSync(nested);
    const legacy = "some-lib/canvas";
    const needsConvert = path.join(root, "a.canvas.tsx");
    const already = path.join(nested, "b.canvas.tsx");
    writeFileSync(
      needsConvert,
      `import { Text } from "${legacy}";\nexport default function A(){return null}\n`,
    );
    writeFileSync(
      already,
      `import { Text } from "team-canvas/canvas";\nexport default function B(){return null}\n`,
    );

    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    try {
      const result = await runConvert(legacy, [root]);
      expect(result).toEqual({ converted: 1, unchanged: 1 });
    } finally {
      console.log = orig;
    }
    expect(readFileSync(needsConvert, "utf8")).toContain("team-canvas/canvas");
    expect(readFileSync(needsConvert, "utf8")).not.toContain(legacy);
    expect(
      logs.some((l) => l.startsWith("converted ") && l.includes("a.canvas.tsx")),
    ).toBe(true);
    expect(logs.some((l) => l === "1 converted, 1 unchanged")).toBe(true);

    await expect(runConvert(legacy, [path.join(root, "missing-dir")])).rejects.toThrow(
      /Path not found/,
    );
  });
});
