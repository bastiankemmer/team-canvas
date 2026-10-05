import { lstatSync } from "node:fs";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractCanvasLinks } from "../../app/edit/canvas-links.js";
import { LocalFilesystemCanvasStore } from "./local-fs-canvas-store.js";

const CANVAS_SUFFIX = ".canvas.tsx";

/** Directory order, skipping symlink dirs and symlink files. Not sorted. */
async function directoryCanvasIds(root: string): Promise<string[]> {
  const ids: string[] = [];
  const walk = async (dir: string, prefix: string): Promise<void> => {
    for (const ent of await readdir(dir, { withFileTypes: true })) {
      if (ent.isSymbolicLink()) continue;
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      if (ent.isDirectory()) await walk(path.join(dir, ent.name), rel);
      else if (ent.isFile() && ent.name.endsWith(CANVAS_SUFFIX)) {
        ids.push(rel.slice(0, -CANVAS_SUFFIX.length));
      }
    }
  };
  await walk(root, "");
  return ids;
}

describe("LocalFilesystemCanvasStore", () => {
  it("@task-1: lists canvas ids, reads source, and round-trips sidecar state without HTTP", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-"));
    const source = "export default function Demo() { return null }\n";
    await writeFile(path.join(root, "demo.canvas.tsx"), source, "utf8");
    await writeFile(
      path.join(root, "other.canvas.tsx"),
      "export default function Other() { return null }\n",
      "utf8",
    );

    const store = LocalFilesystemCanvasStore(root);

    const ids = await store.list();
    expect(ids).toEqual(expect.arrayContaining(["demo", "other"]));
    expect(ids).toHaveLength(2);

    expect(await store.readSource("demo")).toBe(source);

    const state = { count: 3, label: "ok" };
    await store.writeState("demo", state);
    expect(await store.readState("demo")).toEqual(state);
  });

  it("rejects canvas ids that escape the store root via ..", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-"));
    const store = LocalFilesystemCanvasStore(root);
    await expect(store.readSource("../etc/passwd")).rejects.toThrow(/Invalid canvas id/);
    await expect(store.writeState("a/../b", {})).rejects.toThrow(/Invalid canvas id/);
    await expect(store.readState("..\\windows")).rejects.toThrow(/Invalid canvas id/);
    await expect(store.readSource("")).rejects.toThrow(/Invalid canvas id/);
  });

  it('@task-1: ids include "demo" and "notes/demo" with "/" in directory order, nested state round-trips, and unsafe or symlink ids throw Invalid canvas id', async () => {
    const made = await mkdtemp(path.join(tmpdir(), "team-canvas-nested-"));
    const madeReal = await realpath(made);
    const root = madeReal.startsWith("/private/")
      ? madeReal.slice("/private".length)
      : made;
    if (process.platform === "darwin") {
      expect(root.startsWith("/var/")).toBe(true);
      expect(await realpath(root)).toBe(madeReal);
      expect(root).not.toBe(madeReal);
    }

    const store = LocalFilesystemCanvasStore(root);
    const nested = "export default function Demo() { return null }\n";
    await store.writeSource("notes/demo", nested);
    expect(await store.readSource("notes/demo")).toBe(nested);

    const state = { count: 3, label: "ok" };
    await store.writeState("notes/demo", state);
    expect(await store.readState("notes/demo")).toEqual(state);
    expect(
      await readFile(path.join(root, "notes/demo.canvas.data.json"), "utf8"),
    ).toBe(JSON.stringify(state));

    await store.writeState("fresh/solo", { n: 1 });
    expect(await store.readState("fresh/solo")).toEqual({ n: 1 });
    expect((await stat(path.join(root, "fresh"))).isDirectory()).toBe(true);

    await writeFile(path.join(root, "demo.canvas.tsx"), nested, "utf8");
    await writeFile(path.join(root, "demo.canvas.data.json"), "{}", "utf8");
    await writeFile(path.join(root, "weird.canvas.data.json"), "{}", "utf8");
    await mkdir(path.join(root, "a/b/c"), { recursive: true });
    await writeFile(
      path.join(root, "a/b/c/leaf.canvas.tsx"),
      "export default function Leaf() { return null }\n",
      "utf8",
    );
    await mkdir(path.join(root, "node_modules"), { recursive: true });
    await writeFile(
      path.join(root, "node_modules/pkg.canvas.tsx"),
      "export default function Pkg() { return null }\n",
      "utf8",
    );
    const editSource = "export default function Edit() { return null }\n";
    await writeFile(path.join(root, "notes/edit.canvas.tsx"), editSource, "utf8");
    await writeFile(path.join(root, "notes/readme.txt"), "ignore", "utf8");

    const outside = await mkdtemp(path.join(path.dirname(root), "outside-"));
    const hidden = "hidden\n";
    await writeFile(path.join(outside, "hidden.canvas.tsx"), hidden, "utf8");
    await symlink(outside, path.join(root, "linked"));
    await symlink(
      path.join(outside, "hidden.canvas.tsx"),
      path.join(root, "hidden.canvas.tsx"),
    );

    const ids = await store.list();
    expect(ids).toContain("demo");
    expect(ids).toContain("notes/demo");
    expect(ids).toContain("notes/edit");
    expect(ids).toContain("a/b/c/leaf");
    expect(ids).toContain("node_modules/pkg");
    expect(ids).not.toContain("fresh/solo");
    expect(ids).not.toContain("weird.canvas.data");
    expect(ids).not.toContain("linked/hidden");
    expect(ids).not.toContain("hidden");
    for (const id of ids) {
      expect(id.includes("\\"), id).toBe(false);
      expect(id.split("/").every((segment) => segment.length > 0), id).toBe(true);
    }
    expect(ids).toEqual(await directoryCanvasIds(root));
    expect([...ids].sort()).toEqual(
      ["a/b/c/leaf", "demo", "node_modules/pkg", "notes/demo", "notes/edit"].sort(),
    );
    expect(await store.readSource("notes/edit")).toBe(editSource);
    expect(await store.readSource("notes/demo")).toBe(nested);

    const parent = path.dirname(root);
    const parentBefore = await readdir(parent);
    const rootBefore = await readdir(root);
    const absolute = path.join(parent, "abs-escape");
    const badIds = [
      "../etc/passwd",
      "a/../b",
      "a//b",
      "a/./b",
      "notes/",
      "/notes",
      "foo..bar",
      "..\\windows",
      "../should-not-exist",
      absolute,
    ];
    for (const id of badIds) {
      await expect(store.readSource(id), id).rejects.toThrow(/Invalid canvas id/);
      await expect(store.writeSource(id, "no"), id).rejects.toThrow(/Invalid canvas id/);
      await expect(store.readState(id), id).rejects.toThrow(/Invalid canvas id/);
      await expect(store.writeState(id, { n: 1 }), id).rejects.toThrow(
        /Invalid canvas id/,
      );
    }
    expect([...(await readdir(parent))].sort()).toEqual([...parentBefore].sort());
    expect([...(await readdir(root))].sort()).toEqual([...rootBefore].sort());
    await expect(stat(path.join(root, "b.canvas.tsx"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(path.join(root, "a/b.canvas.tsx"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(absolute)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(path.join(parent, "should-not-exist"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    await expect(store.readSource("linked/hidden")).rejects.toThrow(/Invalid canvas id/);
    await expect(store.writeSource("linked/hidden", "pwn")).rejects.toThrow(
      /Invalid canvas id/,
    );
    await expect(store.writeState("linked/hidden", {})).rejects.toThrow(
      /Invalid canvas id/,
    );
    await expect(store.readSource("hidden")).rejects.toThrow(/Invalid canvas id/);
    await expect(store.writeSource("hidden", "pwn")).rejects.toThrow(/Invalid canvas id/);
    expect(await readdir(outside)).toEqual(["hidden.canvas.tsx"]);
    expect(await readFile(path.join(outside, "hidden.canvas.tsx"), "utf8")).toBe(hidden);

    expect(
      extractCanvasLinks(
        'export default function N() { return <CanvasLink to="notes/demo">Demo</CanvasLink> }\n',
      ),
    ).toEqual([{ to: "notes/demo", line: 1, label: "Demo" }]);
    expect(
      extractCanvasLinks(
        [
          "export default function N() {",
          "  return (",
          "    <div>",
          '      <CanvasLink to="../x">Bad</CanvasLink>',
          '      <CanvasLink to="a\\b">Back</CanvasLink>',
          "    </div>",
          "  );",
          "}",
          "",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("mutation: each unsafe id arm throws, and realpath escapes throw without reading outside", async () => {
    const nest = await mkdtemp(path.join(tmpdir(), "team-canvas-arms-"));
    const root = path.join(nest, "store");
    await mkdir(root);
    const source = "export default function Ok() { return null }\n";
    await writeFile(path.join(root, "ok.canvas.tsx"), source, "utf8");
    const store = LocalFilesystemCanvasStore(root);

    expect(await store.readSource("ok")).toBe(source);

    const absolute = path.join(nest, "abs-escape");
    for (const id of ["", "foo..bar", "a\\b", absolute, "a//b", "a/./b", ".", "x/../y"]) {
      await expect(store.readSource(id), id).rejects.toThrow(/Invalid canvas id/);
    }

    const parentSecret = "parent-secret\n";
    await writeFile(path.join(nest, "parent-secret.canvas.tsx"), parentSecret, "utf8");
    await symlink(nest, path.join(root, "up"));
    await expect(store.readSource("up/parent-secret")).rejects.toThrow(/Invalid canvas id/);
    await expect(store.writeSource("up/parent-secret", "pwn")).rejects.toThrow(
      /Invalid canvas id/,
    );
    expect(await readFile(path.join(nest, "parent-secret.canvas.tsx"), "utf8")).toBe(
      parentSecret,
    );

    const sibling = path.join(nest, "sibling");
    await mkdir(sibling);
    const siblingSecret = "sibling-secret\n";
    await writeFile(path.join(sibling, "secret.canvas.tsx"), siblingSecret, "utf8");
    await symlink(sibling, path.join(root, "side"));
    await expect(store.readSource("side/secret")).rejects.toThrow(/Invalid canvas id/);
    await expect(store.writeSource("side/secret", "pwn")).rejects.toThrow(
      /Invalid canvas id/,
    );
    expect(await readFile(path.join(sibling, "secret.canvas.tsx"), "utf8")).toBe(
      siblingSecret,
    );

    await symlink("/etc", path.join(root, "abs"));
    await expect(store.readSource("abs/passwd")).rejects.toThrow(/Invalid canvas id/);
  });

  it("mutation: list keeps only *.canvas.tsx ids; readSource is utf8", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-utf8-"));
    const source = 'export default function Demo() { return "café 🎨" }\n';
    await writeFile(path.join(root, "demo.canvas.tsx"), source, "utf8");
    await writeFile(path.join(root, "demo.canvas.data.json"), '{"x":1}', "utf8");
    await writeFile(path.join(root, "notes.txt"), "ignore", "utf8");
    await writeFile(path.join(root, "almost.canvas.ts"), "nope", "utf8");

    const store = LocalFilesystemCanvasStore(root);
    expect(await store.list()).toEqual(["demo"]);
    expect(await store.readSource("demo")).toBe(source);
    expect(await store.readSource("demo")).toContain("café");
  });

  it("mutation: a symlink that leaves the store and points back is rejected", async () => {
    const nest = await mkdtemp(path.join(tmpdir(), "team-canvas-bounce-"));
    const root = path.join(nest, "store");
    const outside = path.join(nest, "outside");
    await mkdir(root);
    await mkdir(outside);
    const secret = "inside-secret\n";
    await writeFile(path.join(root, "secret.canvas.tsx"), secret, "utf8");
    await symlink(
      path.join(root, "secret.canvas.tsx"),
      path.join(outside, "back.canvas.tsx"),
    );
    await symlink(outside, path.join(root, "link"));

    const store = LocalFilesystemCanvasStore(root);
    await expect(store.readSource("link/back")).rejects.toThrow(/Invalid canvas id/);
    await expect(store.writeSource("link/back", "pwn")).rejects.toThrow(
      /Invalid canvas id/,
    );
    expect(await readFile(path.join(root, "secret.canvas.tsx"), "utf8")).toBe(secret);
  });

  it("mutation: a non-ENOENT lstat error propagates", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-eacces-"));
    const locked = path.join(root, "locked");
    await mkdir(locked);
    await writeFile(path.join(locked, "secret.canvas.tsx"), "hidden\n", "utf8");
    await chmod(locked, 0o000);
    try {
      let blocked = false;
      try {
        lstatSync(path.join(locked, "secret.canvas.tsx"));
      } catch (err) {
        expect(err).toMatchObject({ code: "EACCES" });
        blocked = true;
      }
      if (!blocked) return;

      const store = LocalFilesystemCanvasStore(root);
      await expect(store.readSource("locked/secret")).rejects.toMatchObject({
        code: "EACCES",
        message: expect.stringMatching(/lstat/),
      });
    } finally {
      await chmod(locked, 0o755);
    }
  });

  it("mutation: writeSource and sidecar state round-trip café", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "team-canvas-cafe-"));
    const store = LocalFilesystemCanvasStore(root);
    const source = 'export default function Cafe() { return "café" }\n';
    await store.writeSource("cafe", source);
    expect(await store.readSource("cafe")).toBe(source);
    expect(await readFile(path.join(root, "cafe.canvas.tsx"), "utf8")).toBe(source);

    const state = { word: "café" };
    await store.writeState("cafe", state);
    expect(await store.readState("cafe")).toEqual(state);
    expect(await readFile(path.join(root, "cafe.canvas.data.json"), "utf8")).toBe(
      JSON.stringify(state),
    );
  });
});
