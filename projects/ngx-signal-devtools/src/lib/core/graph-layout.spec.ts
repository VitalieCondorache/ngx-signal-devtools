import { layoutSignalGraph } from './graph-layout';
import type { SignalGraphInput } from './types';

const chain: SignalGraphInput = {
  nodes: [
    { id: 3, name: 'total', kind: 'computed' },
    { id: 1, name: 'todos', kind: 'signal' },
    { id: 2, name: 'count', kind: 'computed' },
  ],
  edges: [
    { from: 1, to: 2 },
    { from: 2, to: 3 },
  ],
};

describe('layoutSignalGraph', () => {
  it('places producers to the left of their consumers', () => {
    const graph = layoutSignalGraph(chain);
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));

    expect(byId.get(1)?.depth).toBe(0);
    expect(byId.get(2)?.depth).toBe(1);
    expect(byId.get(3)?.depth).toBe(2);
    expect(byId.get(2)!.x).toBeGreaterThan(byId.get(1)!.x);
    expect(byId.get(3)!.x).toBeGreaterThan(byId.get(2)!.x);
    expect(graph.maxDepth).toBe(2);
    expect(graph.edges).toHaveLength(2);
    expect(graph.edges[0]!.path.startsWith('M ')).toBe(true);
  });

  it('is deterministic', () => {
    expect(layoutSignalGraph(chain)).toEqual(layoutSignalGraph(chain));
  });

  it('survives cycles and unknown or self edges', () => {
    const graph = layoutSignalGraph({
      nodes: [
        { id: 1, name: 'a', kind: 'signal' },
        { id: 2, name: 'b', kind: 'computed' },
      ],
      edges: [
        { from: 1, to: 2 },
        { from: 2, to: 1 },
        { from: 2, to: 2 },
        { from: 9, to: 1 },
      ],
    });

    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(2);
    expect(graph.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(
      true,
    );
  });

  it('handles an empty graph', () => {
    expect(layoutSignalGraph({ nodes: [], edges: [] })).toEqual({
      nodes: [],
      edges: [],
      width: 0,
      height: 0,
      maxDepth: 0,
    });
  });

  it('grows the canvas when a column holds several nodes', () => {
    const graph = layoutSignalGraph(
      {
        nodes: [
          { id: 1, name: 'a', kind: 'signal' },
          { id: 2, name: 'b', kind: 'signal' },
          { id: 3, name: 'sum', kind: 'computed' },
        ],
        edges: [
          { from: 1, to: 3 },
          { from: 2, to: 3 },
        ],
      },
      { rowHeight: 50, padding: 10 },
    );

    expect(graph.height).toBeGreaterThan(50);
    expect(graph.width).toBeGreaterThan(200);
  });

  it('honours layout options', () => {
    const compact = layoutSignalGraph(chain, {
      columnWidth: 100,
      rowHeight: 20,
      nodeWidth: 80,
      nodeHeight: 16,
      padding: 4,
    });
    const byId = new Map(compact.nodes.map((node) => [node.id, node]));
    expect(byId.get(1)!.x).toBe(4);
    expect(byId.get(2)!.x).toBe(104);
    expect(compact.width).toBe(8 + 2 * 100 + 80);
  });
});
