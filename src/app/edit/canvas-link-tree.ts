import type { CanvasStore } from "../../ports/canvas-store.js";
import { extractCanvasLinks } from "./canvas-links.js";

/** One node in a knowledge tree. `missing` targets are not listed and have no children. */
export type LinkTreeNode = {
  id: string;
  missing: boolean;
  children: LinkTreeNode[];
};

/** Index roots in id order, plus listed ids no root placed. */
export type LinkTree = {
  roots: LinkTreeNode[];
  unlinked: string[];
};

function isIndexRoot(id: string): boolean {
  return id.slice(id.lastIndexOf("/") + 1) === "index";
}

function isEnoent(err: unknown): boolean {
  return err instanceof Error && (err as { code?: unknown }).code === "ENOENT";
}

/**
 * Pure link tree. `outgoing` is source order for each existing id.
 * Existence is membership in `ids`. A repeated id is ignored.
 */
export function buildLinkTree(
  ids: readonly string[],
  outgoing: Readonly<Record<string, readonly string[]>>,
): LinkTree {
  const listed = new Set(ids);
  const placed = new Set<string>();
  const roots = [...listed].filter(isIndexRoot).sort().map((root) => {
    const seen = new Set<string>([root]);
    placed.add(root);
    const rootNode: LinkTreeNode = { id: root, missing: false, children: [] };
    const queue: LinkTreeNode[] = [rootNode];
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i]!;
      for (const to of outgoing[current.id] ?? []) {
        if (seen.has(to)) continue;
        seen.add(to);
        const missing = !listed.has(to);
        const child: LinkTreeNode = { id: to, missing, children: [] };
        current.children.push(child);
        if (missing) continue;
        placed.add(to);
        queue.push(child);
      }
    }
    return rootNode;
  });

  const unlinked = [...listed].filter((id) => !placed.has(id)).sort();
  return { roots, unlinked };
}

/** List once, read each id once, then {@link buildLinkTree}. */
export async function loadLinkTree(store: CanvasStore): Promise<LinkTree> {
  const ids = await store.list();
  const outgoing: Record<string, string[]> = {};
  // ponytail: one full read and one JSX parse of every canvas per library load. Ceiling is total source size.
  // Upgrade path: a cache keyed by source, or an index beside the store, only if a library load shows up in real use.
  for (const id of new Set(ids)) {
    try {
      outgoing[id] = extractCanvasLinks(await store.readSource(id)).map((link) => link.to);
    } catch (err) {
      if (!isEnoent(err)) throw err;
      outgoing[id] = [];
    }
  }
  return buildLinkTree(ids, outgoing);
}
