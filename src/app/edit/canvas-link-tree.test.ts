import { describe, expect, it } from "vitest";
import type { CanvasStore } from "../../ports/canvas-store.js";
import { buildLinkTree, loadLinkTree, type LinkTreeNode } from "./canvas-link-tree.js";

function node(id: string, children: LinkTreeNode[] = [], missing = false): LinkTreeNode {
  return { id, missing, children };
}

function store(opts: {
  ids: string[];
  readSource: (id: string) => Promise<string>;
  onList?: () => void;
}): CanvasStore {
  return {
    list: async () => {
      opts.onList?.();
      return opts.ids;
    },
    readSource: opts.readSource,
    writeSource: async () => {},
    readState: async () => null,
    writeState: async () => {},
  };
}

describe("canvas link tree", () => {
  it("@task-1: index last-segment roots walk breadth-first with per-root seen-sets, broken and cycle ids appear once, Unlinked is the leftover ids, and load reads each canvas once", async () => {
    const ids = [
      "proj/index",
      "notes",
      "index",
      "index",
      "z/index",
      "a",
      "c",
      "b",
      "shared",
      "my-index",
      "Index",
      "z-orphan",
      "m-only",
      "b-orphan",
      "secret",
      "Team/index",
      "Team/index",
      "notes",
    ];
    const tree = buildLinkTree(ids, {
      index: ["a", "b", "a", "index", "gone", "gone", "shared"],
      a: ["c"],
      c: ["b", "a"],
      b: ["index"],
      "proj/index": ["shared"],
      "z/index": ["shared"],
      "z-orphan": ["m-only", "ghost"],
      "m-only": ["a"],
      "my-index": ["b"],
      gone: ["secret"],
    });

    expect(tree).toEqual({
      roots: [
        node("Team/index"),
        node("index", [
          node("a", [node("c")]),
          node("b"),
          node("gone", [], true),
          node("shared"),
        ]),
        node("proj/index", [node("shared")]),
        node("z/index", [node("shared")]),
      ],
      unlinked: ["Index", "b-orphan", "m-only", "my-index", "notes", "secret", "z-orphan"],
    });

    const indexSource = [
      "export default function Index() {",
      "  return (",
      "    <div>",
      '      <CanvasLink to="../x">Bad</CanvasLink>',
      "      <CanvasLink to={id}>Dyn</CanvasLink>",
      "      <CanvasLink to={`nope`}>Tpl</CanvasLink>",
      '      <CanvasLink to={"no" + "pe"}>Cat</CanvasLink>',
      '      <X to="aliased">Alias</X>',
      '      <CanvasLink to="real">Real</CanvasLink>',
      '      <CanvasLink to="missing-id">Gone</CanvasLink>',
      "    </div>",
      "  );",
      "}",
      "",
    ].join("\n");
    const sources: Record<string, string> = {
      index: indexSource,
      real: "export default function Real() { return <CanvasLink to={id}>Dyn</CanvasLink> }\n",
      "skip-me": 'export default function Skip() { return <CanvasLink to="orphan-target">O</CanvasLink> }\n',
    };
    const listed = ["proj/index", "index", "real", "skip-me"];
    const reads: string[] = [];
    let lists = 0;
    const loaded = await loadLinkTree(
      store({
        ids: listed,
        onList: () => {
          lists += 1;
        },
        readSource: async (id) => {
          reads.push(id);
          if (id === "proj/index") {
            const err = new Error("gone") as NodeJS.ErrnoException;
            err.code = "ENOENT";
            throw err;
          }
          return sources[id] ?? "";
        },
      }),
    );

    expect(lists).toBe(1);
    expect(reads).toEqual(listed);
    expect(loaded).toEqual({
      roots: [
        node("index", [node("real"), node("missing-id", [], true)]),
        node("proj/index"),
      ],
      unlinked: ["skip-me"],
    });

    const badReads: string[] = [];
    const failed = loadLinkTree(
      store({
        ids: ["index", "real"],
        readSource: async (id) => {
          badReads.push(id);
          if (id === "real") {
            const err = new Error("read failed") as NodeJS.ErrnoException;
            err.code = "EIO";
            throw err;
          }
          return indexSource;
        },
      }),
    );
    await expect(failed).rejects.toMatchObject({ code: "EIO", message: "read failed" });
    expect(badReads).toEqual(["index", "real"]);
    await expect(failed).rejects.toThrow("read failed");

    const rejectRead = (thrown: unknown) =>
      loadLinkTree(
        store({
          ids: ["notes"],
          readSource: async () => {
            throw thrown;
          },
        }),
      );
    await expect(rejectRead("disk")).rejects.toBe("disk");
    await expect(rejectRead(null)).rejects.toBeNull();
    await expect(rejectRead({ code: "ENOENT" })).rejects.toEqual({ code: "ENOENT" });

    let duplicateReads = 0;
    const duplicated = await loadLinkTree(
      store({
        ids: ["index", "index"],
        readSource: async () => {
          duplicateReads += 1;
          return "";
        },
      }),
    );
    expect(duplicateReads).toBe(1);
    expect(duplicated).toEqual({ roots: [node("index")], unlinked: [] });
  });
});
