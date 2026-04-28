// ═══════════════════════════════════════════════════════════════════
//  MINDMAP MODULE — UTILITIES
//  Auto-layout, JSON→ReactFlow conversion, LaTeX detection
//  Collapsible tree: chỉ hiện nhánh đang mở, click để xổ/co
// ═══════════════════════════════════════════════════════════════════

import type { Node, Edge } from '@xyflow/react';
import type { MindmapChapter, MindmapNodeData } from './types';
import { NODE_COLORS } from './types';

// ── Build adjacency list from flat node array ─────────────────────
export function buildTree(nodes: MindmapNodeData[]): Map<string, MindmapNodeData[]> {
  const childrenMap = new Map<string, MindmapNodeData[]>();
  for (const node of nodes) {
    const parentId = node.parent || '__ROOT__';
    if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
    childrenMap.get(parentId)!.push(node);
  }
  return childrenMap;
}

// ── Check which nodes have children ───────────────────────────────
export function getNodesWithChildren(nodes: MindmapNodeData[]): Set<string> {
  const parentIds = new Set<string>();
  for (const node of nodes) {
    if (node.parent) parentIds.add(node.parent);
  }
  return parentIds;
}

// ── Get visible nodes based on expanded set ───────────────────────
// A node is visible if ALL ancestors in its chain are expanded.
// Root is always visible.
export function getVisibleNodeIds(
  nodes: MindmapNodeData[],
  expandedIds: Set<string>,
): Set<string> {
  const childrenMap = buildTree(nodes);
  const rootNode = nodes.find(n => !n.parent || n.type === 'root');
  if (!rootNode) return new Set();

  const visible = new Set<string>();
  visible.add(rootNode.id);

  function walk(nodeId: string) {
    // If this node is expanded, its direct children become visible
    if (expandedIds.has(nodeId)) {
      const children = childrenMap.get(nodeId) || [];
      for (const child of children) {
        visible.add(child.id);
        walk(child.id); // recurse for deeper expanded nodes
      }
    }
  }

  walk(rootNode.id);
  return visible;
}

// ── Horizontal tree layout for VISIBLE nodes only ─────────────────
interface LayoutResult {
  positions: Map<string, { x: number; y: number }>;
}

export function calculateTreeLayout(
  nodes: MindmapNodeData[],
  rootId: string,
  visibleIds: Set<string>,
): LayoutResult {
  const childrenMap = buildTree(nodes);
  const positions = new Map<string, { x: number; y: number }>();

  const LEVEL_GAP_X = 450;
  const NODE_GAP_Y = 240;

  function layoutSubtree(
    nodeId: string,
    depth: number,
    yStart: number,
  ): number {
    if (!visibleIds.has(nodeId)) return yStart;

    const allChildren = childrenMap.get(nodeId) || [];
    // Only layout visible children
    const visibleChildren = allChildren.filter(c => visibleIds.has(c.id));
    const x = depth * LEVEL_GAP_X;

    if (visibleChildren.length === 0) {
      positions.set(nodeId, { x, y: yStart });
      return yStart + NODE_GAP_Y;
    }

    let currentY = yStart;
    for (const child of visibleChildren) {
      currentY = layoutSubtree(child.id, depth + 1, currentY);
    }

    // Center parent vertically among its visible children
    const firstChildY = positions.get(visibleChildren[0].id)?.y || yStart;
    const lastChildY = positions.get(visibleChildren[visibleChildren.length - 1].id)?.y || yStart;
    const centerY = (firstChildY + lastChildY) / 2;

    positions.set(nodeId, { x, y: centerY });
    return currentY;
  }

  layoutSubtree(rootId, 0, 0);
  return { positions };
}

// ── Convert MindmapChapter JSON → React Flow (collapsible) ────────
export function parseChapterToFlow(
  chapter: MindmapChapter,
  expandedIds: Set<string>,
): {
  nodes: Node[];
  edges: Edge[];
} {
  const rootNode = chapter.nodes.find(n => !n.parent || n.type === 'root');
  if (!rootNode) return { nodes: [], edges: [] };

  const visibleIds = getVisibleNodeIds(chapter.nodes, expandedIds);
  const layout = calculateTreeLayout(chapter.nodes, rootNode.id, visibleIds);
  const nodesWithChildren = getNodesWithChildren(chapter.nodes);

  // Count direct children for badge
  const childrenMap = buildTree(chapter.nodes);

  const rfNodes: Node[] = chapter.nodes
    .filter(node => visibleIds.has(node.id))
    .map(node => {
      const pos = layout.positions.get(node.id) || { x: 0, y: 0 };
      const colors = NODE_COLORS[node.type] || NODE_COLORS.note;
      const hasChildren = nodesWithChildren.has(node.id);
      const isExpanded = expandedIds.has(node.id);
      const childCount = (childrenMap.get(node.id) || []).length;

      return {
        id: node.id,
        type: 'physicsNode',
        position: pos,
        data: {
          ...node,
          colors,
          hasChildren,
          isExpanded,
          childCount,
        },
      };
    });

  const rfEdges: Edge[] = chapter.nodes
    .filter(n => n.parent && visibleIds.has(n.id) && visibleIds.has(n.parent!))
    .map(node => {
      const parentNode = chapter.nodes.find(n => n.id === node.parent);
      const parentColors = parentNode ? NODE_COLORS[parentNode.type] : NODE_COLORS.theory;

      return {
        id: `e-${node.parent}-${node.id}`,
        source: node.parent!,
        target: node.id,
        type: 'smoothstep',
        animated: false,
        style: {
          stroke: parentColors.border,
          strokeWidth: 2,
          opacity: 0.4,
        },
      };
    });

  return { nodes: rfNodes, edges: rfEdges };
}

// ── Detect and split LaTeX segments from text ─────────────────────
export interface TextSegment {
  type: 'text' | 'math';
  content: string;
}

export function extractLatex(text: string): TextSegment[] {
  if (!text) return [];
  
  const segments: TextSegment[] = [];
  const regex = /\$([^$]+)\$/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'math', content: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: 'text', content: text }];
}

// ── Validate mindmap JSON structure ───────────────────────────────
export function validateMindmapJSON(json: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!json || typeof json !== 'object') {
    return { valid: false, errors: ['JSON không hợp lệ'] };
  }

  if (!json.grade || !['10', '11', '12'].includes(String(json.grade))) {
    errors.push('Thiếu hoặc sai trường "grade" (phải là "10", "11", hoặc "12")');
  }

  if (!json.chapter || typeof json.chapter !== 'string') {
    errors.push('Thiếu trường "chapter" (tên chương)');
  }

  if (!Array.isArray(json.nodes) || json.nodes.length === 0) {
    errors.push('Thiếu hoặc rỗng trường "nodes" (mảng node)');
  } else {
    const ids = new Set<string>();
    let hasRoot = false;

    for (let i = 0; i < json.nodes.length; i++) {
      const node = json.nodes[i];
      if (!node.id) errors.push(`Node[${i}]: Thiếu "id"`);
      if (!node.type) errors.push(`Node[${i}]: Thiếu "type"`);
      if (!node.label) errors.push(`Node[${i}]: Thiếu "label"`);

      if (node.id) {
        if (ids.has(node.id)) errors.push(`Node[${i}]: ID "${node.id}" bị trùng`);
        ids.add(node.id);
      }

      if (node.type === 'root') hasRoot = true;

      if (node.parent && !json.nodes.find((n: any) => n.id === node.parent)) {
        errors.push(`Node[${i}]: parent "${node.parent}" không tồn tại`);
      }
    }

    if (!hasRoot) errors.push('Phải có ít nhất 1 node type="root"');
  }

  return { valid: errors.length === 0, errors };
}

// ── Slug-ify chapter name for Firestore document ID ───────────────
export function chapterToSlug(grade: string, chapter: string): string {
  const slug = chapter
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return `${grade}_${slug}`;
}
