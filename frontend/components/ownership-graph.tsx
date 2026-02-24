"use client";

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  Position,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";

const DEFAULT_WIDTH = 180;
const DEFAULT_HEIGHT = 40;
const HORIZONTAL_GAP = 80;
const VERTICAL_GAP = 60;

function assignPositions(
  apiNodes: Array<{ id: string; type: string; data: Record<string, unknown> }>,
  apiEdges: Array<{ id: string; source: string; target: string }>
): { nodes: Node[]; edges: Edge[] } {
  const nodeMap = new Map(apiNodes.map((n) => [n.id, n]));
  const outEdges = new Map<string, string[]>();
  for (const e of apiEdges) {
    const list = outEdges.get(e.source) ?? [];
    list.push(e.target);
    outEdges.set(e.source, list);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const visited = new Set<string>();
  let rootId: string | null = null;
  for (const n of apiNodes) {
    const hasIncoming = apiEdges.some((e) => e.target === n.id);
    if (!hasIncoming) {
      rootId = n.id;
      break;
    }
  }
  if (!rootId && apiNodes.length > 0) rootId = apiNodes[0].id;

  const layout = (id: string, x: number, y: number) => {
    if (visited.has(id)) return;
    visited.add(id);
    positions.set(id, { x, y });
    const children = outEdges.get(id) ?? [];
    children.forEach((child, i) => {
      layout(child, x + HORIZONTAL_GAP, y + i * (DEFAULT_HEIGHT + VERTICAL_GAP));
    });
  };
  if (rootId) layout(rootId, 0, 0);

  const nodes: Node[] = apiNodes.map((n) => {
    const pos = positions.get(n.id) ?? { x: 0, y: 0 };
    return {
      id: n.id,
      type: "default",
      position: pos,
      data: { label: (n.data?.label as string) ?? n.id },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });

  const edges: Edge[] = apiEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed },
  }));

  return { nodes, edges };
}

interface OwnershipGraphProps {
  nodes: Array<{ id: string; type: string; data: Record<string, unknown> }>;
  edges: Array<{ id: string; source: string; target: string }>;
}

export function OwnershipGraph({ nodes: apiNodes, edges: apiEdges }: OwnershipGraphProps) {
  const { nodes: initialNodes, edges: initialEdges } = assignPositions(apiNodes, apiEdges);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      fitView
      className="bg-gray-50"
      proOptions={{ hideAttribution: true }}
    >
      <Background />
      <Controls />
      <MiniMap />
    </ReactFlow>
  );
}
