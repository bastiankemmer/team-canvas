/**
 * Pure hierarchical DAG layout. Ranking ignores back-edges so
 * cycles still produce usable positions; callers style `isBackEdge` edges.
 */

export type DAGLayoutOptions = {
  nodes: Array<{ id: string }>;
  edges: Array<{ from: string; to: string }>;
  direction?: "vertical" | "horizontal";
  nodeWidth?: number;
  nodeHeight?: number;
  rankGap?: number;
  nodeGap?: number;
  padding?: number;
};

export type DAGLayoutNode = {
  id: string;
  x: number;
  y: number;
  rank: number;
  order: number;
};

export type DAGLayoutEdge = {
  from: string;
  to: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  isBackEdge: boolean;
};

export type DAGLayoutRank = {
  rank: number;
  x: number;
  y: number;
  width: number;
  height: number;
  nodeIds: string[];
};

export type DAGLayoutResult = {
  nodes: DAGLayoutNode[];
  edges: DAGLayoutEdge[];
  ranks: DAGLayoutRank[];
  direction: "vertical" | "horizontal";
  width: number;
  height: number;
};

type Edge = { from: string; to: string };

/** DFS back-edge set; tree/forward/cross edges remain for ranking. */
function findBackEdges(nodeIds: string[], edges: Edge[]): Set<string> {
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const e of edges) {
    if (!adj.has(e.from) || !adj.has(e.to)) continue;
    adj.get(e.from)!.push(e.to);
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of nodeIds) color.set(id, WHITE);
  const back = new Set<string>();

  function dfs(u: string): void {
    color.set(u, GRAY);
    for (const v of adj.get(u) ?? []) {
      const c = color.get(v) ?? WHITE;
      if (c === GRAY) {
        back.add(`${u}\0${v}`);
      } else if (c === WHITE) {
        dfs(v);
      }
    }
    color.set(u, BLACK);
  }

  for (const id of nodeIds) {
    if (color.get(id) === WHITE) dfs(id);
  }
  return back;
}

function buildRankGraph(
  nodeIds: string[],
  forwardEdges: Edge[],
): {
  preds: Map<string, string[]>;
  succs: Map<string, string[]>;
  indeg: Map<string, number>;
} {
  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const id of nodeIds) {
    preds.set(id, []);
    succs.set(id, []);
    indeg.set(id, 0);
  }
  for (const e of forwardEdges) {
    if (!indeg.has(e.from) || !indeg.has(e.to)) continue;
    preds.get(e.to)!.push(e.from);
    succs.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  return { preds, succs, indeg };
}

function seedRankZero(
  nodeIds: string[],
  indeg: Map<string, number>,
): { queue: string[]; rank: Map<string, number> } {
  const rank = new Map<string, number>();
  const queue: string[] = [];
  for (const id of nodeIds) {
    if ((indeg.get(id) ?? 0) === 0) {
      queue.push(id);
      rank.set(id, 0);
    }
  }
  return { queue, rank };
}

function relaxLongestPath(
  queue: string[],
  rank: Map<string, number>,
  succs: Map<string, string[]>,
  indeg: Map<string, number>,
): void {
  // ponytail: Kahn + longest-path; ceiling = disconnected components get rank 0
  let qi = 0;
  while (qi < queue.length) {
    const u = queue[qi++]!;
    const ru = rank.get(u)!;
    for (const v of succs.get(u)!) {
      const next = ru + 1;
      if ((rank.get(v) ?? -1) < next) rank.set(v, next);
      const d = indeg.get(v)! - 1;
      indeg.set(v, d);
      if (d === 0) queue.push(v);
    }
  }
}

function longestPathRanks(
  nodeIds: string[],
  forwardEdges: Edge[],
): Map<string, number> {
  const { succs, indeg } = buildRankGraph(nodeIds, forwardEdges);
  const { queue, rank } = seedRankZero(nodeIds, indeg);
  relaxLongestPath(queue, rank, succs, indeg);
  for (const id of nodeIds) {
    if (!rank.has(id)) rank.set(id, 0);
  }
  return rank;
}

function groupIdsByRank(
  nodeIds: string[],
  ranks: Map<string, number>,
): { byRank: Map<number, string[]>; rankIndexes: number[] } {
  const byRank = new Map<number, string[]>();
  for (const id of nodeIds) {
    const r = ranks.get(id) ?? 0;
    const list = byRank.get(r) ?? [];
    list.push(id);
    byRank.set(r, list);
  }
  return { byRank, rankIndexes: [...byRank.keys()].sort((a, b) => a - b) };
}

function crossSpanFor(
  count: number,
  direction: "vertical" | "horizontal",
  nodeWidth: number,
  nodeHeight: number,
  nodeGap: number,
): number {
  const size = direction === "vertical" ? nodeWidth : nodeHeight;
  return count * size + Math.max(0, count - 1) * nodeGap;
}

function placeRank(
  r: number,
  ids: string[],
  opts: {
    direction: "vertical" | "horizontal";
    nodeWidth: number;
    nodeHeight: number;
    rankGap: number;
    nodeGap: number;
    padding: number;
    maxCross: number;
    pos: Map<string, DAGLayoutNode>;
    rankBoxes: DAGLayoutRank[];
  },
): void {
  const crossSpan = crossSpanFor(
    ids.length,
    opts.direction,
    opts.nodeWidth,
    opts.nodeHeight,
    opts.nodeGap,
  );
  const crossOffset = opts.padding + (opts.maxCross - crossSpan) / 2;
  if (opts.direction === "vertical") {
    const y = opts.padding + r * (opts.nodeHeight + opts.rankGap);
    ids.forEach((id, order) => {
      const x = crossOffset + order * (opts.nodeWidth + opts.nodeGap);
      opts.pos.set(id, { id, x, y, rank: r, order });
    });
    opts.rankBoxes.push({
      rank: r,
      x: crossOffset,
      y,
      width: crossSpan,
      height: opts.nodeHeight,
      nodeIds: ids,
    });
    return;
  }
  const x = opts.padding + r * (opts.nodeWidth + opts.rankGap);
  ids.forEach((id, order) => {
    const y = crossOffset + order * (opts.nodeHeight + opts.nodeGap);
    opts.pos.set(id, { id, x, y, rank: r, order });
  });
  opts.rankBoxes.push({
    rank: r,
    x,
    y: crossOffset,
    width: opts.nodeWidth,
    height: crossSpan,
    nodeIds: ids,
  });
}

function layoutEdgeGeometry(
  from: DAGLayoutNode,
  to: DAGLayoutNode,
  direction: "vertical" | "horizontal",
  nodeWidth: number,
  nodeHeight: number,
  isBackEdge: boolean,
  e: Edge,
): DAGLayoutEdge {
  if (direction === "vertical") {
    return {
      from: e.from,
      to: e.to,
      sourceX: from.x + nodeWidth / 2,
      sourceY: from.y + nodeHeight,
      targetX: to.x + nodeWidth / 2,
      targetY: to.y,
      isBackEdge,
    };
  }
  return {
    from: e.from,
    to: e.to,
    sourceX: from.x + nodeWidth,
    sourceY: from.y + nodeHeight / 2,
    targetX: to.x,
    targetY: to.y + nodeHeight / 2,
    isBackEdge,
  };
}

type LayoutMetrics = {
  direction: "vertical" | "horizontal";
  nodeWidth: number;
  nodeHeight: number;
  rankGap: number;
  nodeGap: number;
  padding: number;
};

function resolveLayoutMetrics(options: DAGLayoutOptions): LayoutMetrics {
  return {
    direction: options.direction ?? "vertical",
    nodeWidth: options.nodeWidth ?? 160,
    nodeHeight: options.nodeHeight ?? 40,
    rankGap: options.rankGap ?? 64,
    nodeGap: options.nodeGap ?? 48,
    padding: options.padding ?? 24,
  };
}

function knownEdges(nodeIds: string[], edges: Edge[]): Edge[] {
  const idSet = new Set(nodeIds);
  return edges.filter((e) => idSet.has(e.from) && idSet.has(e.to));
}

function maxCrossSpan(
  rankIndexes: number[],
  byRank: Map<number, string[]>,
  m: LayoutMetrics,
): number {
  let maxCross = 0;
  for (const r of rankIndexes) {
    maxCross = Math.max(
      maxCross,
      crossSpanFor(
        byRank.get(r)!.length,
        m.direction,
        m.nodeWidth,
        m.nodeHeight,
        m.nodeGap,
      ),
    );
  }
  return maxCross;
}

function placeRanks(
  rankIndexes: number[],
  byRank: Map<number, string[]>,
  m: LayoutMetrics,
  maxCross: number,
): { pos: Map<string, DAGLayoutNode>; rankBoxes: DAGLayoutRank[] } {
  const pos = new Map<string, DAGLayoutNode>();
  const rankBoxes: DAGLayoutRank[] = [];
  for (const r of rankIndexes) {
    placeRank(r, byRank.get(r)!, {
      direction: m.direction,
      nodeWidth: m.nodeWidth,
      nodeHeight: m.nodeHeight,
      rankGap: m.rankGap,
      nodeGap: m.nodeGap,
      padding: m.padding,
      maxCross,
      pos,
      rankBoxes,
    });
  }
  return { pos, rankBoxes };
}

function buildLayoutEdges(
  edges: Edge[],
  pos: Map<string, DAGLayoutNode>,
  backKeys: Set<string>,
  m: LayoutMetrics,
): DAGLayoutEdge[] {
  return edges.map((e) =>
    layoutEdgeGeometry(
      pos.get(e.from)!,
      pos.get(e.to)!,
      m.direction,
      m.nodeWidth,
      m.nodeHeight,
      backKeys.has(`${e.from}\0${e.to}`),
      e,
    ),
  );
}

function canvasExtent(
  layoutNodes: DAGLayoutNode[],
  nodeWidth: number,
  nodeHeight: number,
  padding: number,
): { width: number; height: number } {
  let maxX = padding;
  let maxY = padding;
  for (const n of layoutNodes) {
    maxX = Math.max(maxX, n.x + nodeWidth);
    maxY = Math.max(maxY, n.y + nodeHeight);
  }
  return { width: maxX + padding, height: maxY + padding };
}

export function computeDAGLayout(options: DAGLayoutOptions): DAGLayoutResult {
  const m = resolveLayoutMetrics(options);
  const nodeIds = options.nodes.map((n) => n.id);
  const edges = knownEdges(nodeIds, options.edges);
  const backKeys = findBackEdges(nodeIds, edges);
  const forward = edges.filter((e) => !backKeys.has(`${e.from}\0${e.to}`));
  const ranks = longestPathRanks(nodeIds, forward);
  const { byRank, rankIndexes } = groupIdsByRank(nodeIds, ranks);
  const maxCross = maxCrossSpan(rankIndexes, byRank, m);
  const { pos, rankBoxes } = placeRanks(rankIndexes, byRank, m, maxCross);
  const layoutNodes = nodeIds.map((id) => pos.get(id)!);
  const layoutEdges = buildLayoutEdges(edges, pos, backKeys, m);
  const { width, height } = canvasExtent(
    layoutNodes,
    m.nodeWidth,
    m.nodeHeight,
    m.padding,
  );

  return {
    nodes: layoutNodes,
    edges: layoutEdges,
    ranks: rankBoxes,
    direction: m.direction,
    width,
    height,
  };
}
