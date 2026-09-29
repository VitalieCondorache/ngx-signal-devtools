import type {
  SignalGraph,
  SignalGraphEdge,
  SignalGraphInput,
  SignalGraphLayoutOptions,
  SignalGraphNode,
} from './types';

const DEFAULT_OPTIONS: Required<SignalGraphLayoutOptions> = {
  columnWidth: 230,
  rowHeight: 46,
  nodeWidth: 180,
  nodeHeight: 30,
  padding: 20,
};

/**
 * Layered ("Sugiyama-lite") layout for the signal graph.
 *
 * Producers are always placed in a column left of their consumers, which mirrors the data flow of
 * a reactive graph: `signal` → `computed` → `template`. The function is pure and cycle safe, so
 * it is cheap to call on every refresh and trivial to unit test.
 */
export function layoutSignalGraph(
  input: SignalGraphInput,
  options: SignalGraphLayoutOptions = {},
): SignalGraph {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const nodes = input.nodes ?? [];
  const edges = dedupeEdges(input.edges ?? [], new Set(nodes.map((node) => node.id)));

  if (nodes.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0, maxDepth: 0 };
  }

  const ids = new Set(nodes.map((node) => node.id));
  const outgoing = new Map<number, number[]>();
  const incoming = new Map<number, number[]>();
  for (const id of ids) {
    outgoing.set(id, []);
    incoming.set(id, []);
  }
  for (const edge of edges) {
    outgoing.get(edge.from)?.push(edge.to);
    incoming.get(edge.to)?.push(edge.from);
  }

  const depths = computeDepths(
    nodes.map((node) => node.id),
    outgoing,
    incoming,
  );

  const columns = new Map<number, number[]>();
  for (const node of nodes) {
    const depth = depths.get(node.id) ?? 0;
    const column = columns.get(depth) ?? [];
    column.push(node.id);
    columns.set(depth, column);
  }

  const positions = new Map<number, SignalGraphNode>();
  let maxRows = 1;
  const maxDepth = columns.size === 0 ? 0 : Math.max(...columns.keys());

  for (const [depth, columnIds] of [...columns.entries()].sort((a, b) => a[0] - b[0])) {
    maxRows = Math.max(maxRows, columnIds.length);
    columnIds.forEach((id, index) => {
      const node = nodes.find((candidate) => candidate.id === id);
      if (!node) {
        return;
      }
      positions.set(id, {
        ...node,
        depth,
        x: config.padding + depth * config.columnWidth,
        y: config.padding + index * config.rowHeight,
        width: config.nodeWidth,
        height: config.nodeHeight,
      });
    });
  }

  const layoutEdges: SignalGraphEdge[] = [];
  for (const edge of edges) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) {
      continue;
    }
    layoutEdges.push({ ...edge, path: edgePath(from, to, config) });
  }

  return {
    nodes: nodes.map((node) => positions.get(node.id)).filter(isNode),
    edges: layoutEdges,
    width: config.padding * 2 + maxDepth * config.columnWidth + config.nodeWidth,
    height: config.padding * 2 + (maxRows - 1) * config.rowHeight + config.nodeHeight,
    maxDepth,
  };
}

function isNode(node: SignalGraphNode | undefined): node is SignalGraphNode {
  return node !== undefined;
}

function dedupeEdges(edges: readonly { from: number; to: number }[], ids: Set<number>) {
  const seen = new Set<string>();
  const result: { from: number; to: number }[] = [];
  for (const edge of edges) {
    if (edge.from === edge.to || !ids.has(edge.from) || !ids.has(edge.to)) {
      continue;
    }
    const key = `${edge.from}->${edge.to}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({ from: edge.from, to: edge.to });
  }
  return result;
}

/**
 * Longest-path layering: a node sits one column right of its deepest producer. Roots (no
 * producers) are placed in column 0 and back edges caused by cycles are ignored.
 */
function computeDepths(
  nodeIds: readonly number[],
  outgoing: Map<number, number[]>,
  incoming: Map<number, number[]>,
): Map<number, number> {
  const depths = new Map<number, number>();
  const visiting = new Set<number>();

  const resolve = (id: number): number => {
    const known = depths.get(id);
    if (known !== undefined) {
      return known;
    }
    if (visiting.has(id)) {
      // Cycle: fall back to this node's current column instead of recursing forever.
      return depths.get(id) ?? 0;
    }

    visiting.add(id);
    const producers = incoming.get(id) ?? [];
    const depth = producers.length === 0 ? 0 : Math.max(...producers.map(resolve)) + 1;
    visiting.delete(id);
    depths.set(id, depth);
    return depth;
  };

  for (const id of nodeIds) {
    resolve(id);
  }
  return depths;
}

function edgePath(
  from: SignalGraphNode,
  to: SignalGraphNode,
  config: Required<SignalGraphLayoutOptions>,
): string {
  const startX = from.x + config.nodeWidth;
  const startY = from.y + config.nodeHeight / 2;
  const endX = to.x;
  const endY = to.y + config.nodeHeight / 2;

  if (endX > startX) {
    const control = (endX - startX) / 2;
    return `M ${startX} ${startY} C ${startX + control} ${startY}, ${endX - control} ${endY}, ${endX} ${endY}`;
  }

  // Back edge (cycle) or same column: route around the gap so the arrow stays visible.
  const loop = Math.max(config.rowHeight / 2, 18);
  return `M ${startX} ${startY} C ${startX + loop} ${startY + loop}, ${endX - loop} ${endY + loop}, ${endX} ${endY}`;
}
