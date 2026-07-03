import React, { useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  BackgroundVariant,
  MarkerType,
} from '@xyflow/react';
import dagre from 'dagre';
import { nodeTypes } from './CustomNodes';
import type { FlowNode, FlowEdge, FlowNodeData, FlowBlock } from '../types';

interface FlowCanvasProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  blocks?: FlowBlock[];
  /** Single-click: for sync (jump to code line) */
  onNodeClick?: (nodeId: string, nodeData: FlowNodeData) => void;
  /** Double-click: for drill-down (enter function/class) */
  onNodeDoubleClick?: (nodeId: string, nodeData: FlowNodeData) => void;
  /** When set, this node will be highlighted and centered */
  highlightedNodeId?: string | null;
  /** Show/hide the minimap */
  showMinimap?: boolean;
  /** Enable/disable animated loop edges (dashed animation) */
  animatedEdges?: boolean;
}

// ── Dagre layout ──────────────────────────────────────────────────────

const NODE_WIDTH = 200;
const NODE_HEIGHT = 60;

function layoutGraph(
  nodes: FlowNode[],
  edges: FlowEdge[],
  blocks?: FlowBlock[]
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const g = new dagre.graphlib.Graph({ compound: true });
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80, marginx: 40, marginy: 40 });

  // Add regular nodes
  for (const node of nodes) {
    const w = Math.max(NODE_WIDTH, node.data.label.length * 8 + 80);
    g.setNode(node.id, { width: w, height: NODE_HEIGHT });
  }

  // Add block group nodes + set parent-child relationships (dagre compound)
  if (blocks) {
    for (const block of blocks) {
      g.setNode(block.id, { width: 100, height: 60, padding: 30 });
      for (const nodeId of block.nodeIds) {
        if (g.hasNode(nodeId)) {
          g.setParent(nodeId, block.id);
        }
      }
    }
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const laidOutNodes = nodes.map(node => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - (pos.width || NODE_WIDTH) / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: laidOutNodes, edges };
}

// ── Group box creation ─────────────────────────────────────────────────

function createGroupNodes(laidOutNodes: FlowNode[], blocks: FlowBlock[]): FlowNode[] {
  const nodeMap = new Map<string, FlowNode>();
  for (const n of laidOutNodes) {
    nodeMap.set(n.id, n);
  }

  const groupNodes: FlowNode[] = [];
  for (const block of blocks) {
    const members = block.nodeIds.map(id => nodeMap.get(id)).filter(Boolean) as FlowNode[];
    if (members.length < 2) continue;

    // Calculate bounding box
    const PADDING = 20;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const m of members) {
      const w = Math.max(NODE_WIDTH, m.data.label.length * 8 + 80);
      minX = Math.min(minX, m.position.x);
      minY = Math.min(minY, m.position.y);
      maxX = Math.max(maxX, m.position.x + w);
      maxY = Math.max(maxY, m.position.y + NODE_HEIGHT);
    }

    const groupNode: FlowNode = {
      id: block.id,
      type: 'groupBox',
      data: {
        label: block.label,
        nodeType: 'groupBox',
        lineNo: 0,
        // Store block style info
        blockType: block.type,
        blockColor: block.color,
        blockBorder: block.border,
      },
      position: { x: minX - PADDING, y: minY - PADDING },
      style: {
        width: maxX - minX + PADDING * 2,
        height: maxY - minY + PADDING * 2,
        zIndex: -1,
      },
    };
    groupNodes.push(groupNode);
  }

  return groupNodes;
}

// ── Component ─────────────────────────────────────────────────────────

const FlowCanvas: React.FC<FlowCanvasProps> = ({
  nodes: rawNodes,
  edges: rawEdges,
  blocks,
  onNodeClick,
  onNodeDoubleClick,
  highlightedNodeId,
  showMinimap = true,
  animatedEdges = true,
}) => {
  const { fitView, getZoom, setCenter } = useReactFlow();
  const prevHighlighted = useRef<string | null | undefined>(null);

  const [isolatedBlockId, setIsolatedBlockId] = React.useState<string | null>(null);

  // Derive effective nodes/edges: filtered when isolated, full otherwise.
  // Filtering at this level ensures dagre layout runs on every change.
  const effectiveNodes = useMemo(() => {
    if (!isolatedBlockId) return rawNodes;
    // Find all member node IDs for this block (including nested blocks)
    const memberIds = new Set<string>();
    for (const n of rawNodes) {
      const d = n.data as unknown as FlowNodeData;
      const bid = d.blockId || '';
      // Match this block OR any nested block (hierarchical prefix)
      if (bid === isolatedBlockId || bid.startsWith(isolatedBlockId + '_')) {
        memberIds.add(n.id);
      }
    }
    // Also include header nodes (all edge sources pointing into this block)
    for (const e of rawEdges) {
      const target = rawNodes.find(n => n.id === e.target);
      const td = target?.data as unknown as FlowNodeData;
      const tbid = td?.blockId || '';
      if (tbid === isolatedBlockId || tbid.startsWith(isolatedBlockId + '_')) {
        memberIds.add(e.source);
      }
    }
    return rawNodes.filter(n => memberIds.has(n.id));
  }, [rawNodes, rawEdges, isolatedBlockId]);

  const effectiveEdges = useMemo(() => {
    if (!isolatedBlockId) return rawEdges;
    const memberIds = new Set(effectiveNodes.map(n => n.id));
    return rawEdges.filter(e => memberIds.has(e.source) && memberIds.has(e.target));
  }, [rawEdges, isolatedBlockId, effectiveNodes]);

  // Apply dagre layout
  const { nodes: laidOutNodes, edges: laidOutEdges } = useMemo(
    () => layoutGraph(effectiveNodes, effectiveEdges, blocks),
    [effectiveNodes, effectiveEdges, blocks]
  );

  // Create group nodes from blocks
  const groupNodes = useMemo(
    () => blocks && blocks.length > 0 ? createGroupNodes(laidOutNodes, blocks) : [],
    [laidOutNodes, blocks]
  );

  // Combine content nodes with group nodes
  const allNodes = useMemo(
    () => [...laidOutNodes, ...groupNodes],
    [laidOutNodes, groupNodes]
  );

  // Add styling to edges
  const styledEdges = useMemo(() => {
    return laidOutEdges.map(edge => ({
      ...edge,
      animated: animatedEdges && (edge.type === 'loop' || edge.animated),
      style: {
        stroke: edge.type === 'true'
          ? '#4caf50'
          : edge.type === 'false'
          ? '#f44336'
          : edge.type === 'exception'
          ? '#ff9800'
          : edge.type === 'loop'
          ? '#4dd0e1'
          : edge.type === 'call'
          ? '#ce93d8'
          : '#546e7a',
        strokeWidth: edge.type === 'true' || edge.type === 'false' ? 2 : 1.5,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: edge.type === 'true'
          ? '#4caf50'
          : edge.type === 'false'
          ? '#f44336'
          : edge.type === 'exception'
          ? '#ff9800'
          : edge.type === 'loop'
          ? '#4dd0e1'
          : '#546e7a',
        width: 16,
        height: 16,
      },
      labelStyle: {
        fill: edge.type === 'true' ? '#4caf50' : edge.type === 'false' ? '#f44336' : '#aaa',
        fontWeight: 600,
        fontSize: 11,
        fontFamily: 'monospace',
      },
      labelBgStyle: {
        fill: '#1a1a2e',
        fillOpacity: 0.9,
        rx: 3,
      },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 3,
    }));
  }, [laidOutEdges]);

  // Apply "selected" className to the highlighted node
  const styledNodes = useMemo(() => {
    return allNodes.map(node => ({
      ...node,
      className: highlightedNodeId && node.id === highlightedNodeId ? 'flow-node-highlighted' : '',
    }));
  }, [allNodes, highlightedNodeId]);

  const [nodesState, setNodes, onNodesChange] = useNodesState(styledNodes as unknown as Node[]);
  const [edgesState, setEdges, onEdgesChange] = useEdgesState(styledEdges as unknown as Edge[]);

  // Center on a node without changing zoom (pan only)
  const centerOnNode = useCallback((nodeId: string) => {
    const node = (nodesState as unknown as FlowNode[]).find(n => n.id === nodeId);
    if (!node) return;
    const zoom = getZoom();
    // Use setCenter for reliable panning (fitView with locked zoom can be unreliable)
    setCenter(node.position.x + 100, node.position.y + 30, { zoom, duration: 300 });
  }, [nodesState, setCenter, getZoom]);

  // Update when props change — fitView only on very first load
  const initialFitDone = useRef(false);
  useEffect(() => {
    const hasNodes = styledNodes.length > 0;
    setNodes(styledNodes as unknown as Node[]);
    setEdges(styledEdges as unknown as Edge[]);
    if (hasNodes && !initialFitDone.current) {
      initialFitDone.current = true;
      setTimeout(() => fitView({ padding: 0.3, duration: 300 }), 100);
    }
  }, [styledNodes, styledEdges, setNodes, setEdges, fitView]);

  // Center on highlighted node when it changes (sync: code → flow)
  useEffect(() => {
    if (!highlightedNodeId || highlightedNodeId === prevHighlighted.current) return;
    prevHighlighted.current = highlightedNodeId;

    // Use rAF to let React Flow finish layout before centering
    const raf = requestAnimationFrame(() => {
      const target = (nodesState as unknown as FlowNode[]).find(n => n.id === highlightedNodeId);
      if (!target) return;

      centerOnNode(highlightedNodeId);
    });
    return () => cancelAnimationFrame(raf);
  }, [highlightedNodeId, nodesState, centerOnNode]);

  // When entering isolation, center on the structural header (for/while/try/etc.)
  useEffect(() => {
    if (!isolatedBlockId) return;
    const timer = setTimeout(() => {
      const headerNode = effectiveNodes.find(n => {
        const d = n.data as unknown as FlowNodeData;
        return ['loop', 'condition', 'try', 'except', 'entry', 'with'].includes(d.nodeType);
      });
      if (headerNode) {
        centerOnNode(headerNode.id);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [isolatedBlockId, effectiveNodes, centerOnNode]);

  // Single-click: sync only (jump to code line in parent)
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (onNodeClick) {
        const data = node.data as unknown as FlowNodeData;
        if (data.nodeType !== 'groupBox') {
          onNodeClick(node.id, data);
        }
      }
    },
    [onNodeClick]
  );

  // Double-click: drill-down (enter function/class/call)
  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (onNodeDoubleClick) {
        const data = node.data as unknown as FlowNodeData;
        if (data.nodeType !== 'groupBox') {
          onNodeDoubleClick(node.id, data);
        }
      }
    },
    [onNodeDoubleClick]
  );

  // Right-click context menu
  type ContextMenuState = {
    x: number; y: number;
    kind: 'comment' | 'block' | 'functionView' | 'findDef' | 'pane' | 'inspect';
    nodeId: string;
    // comment-specific
    collapsed?: boolean;
    // block-specific
    blockIds?: string[];
    blockTypes?: string[];
    // functionView-specific
    callName?: string;
    // inspect-specific
    inspectData?: Record<string, unknown>;
  } | null;

  const menuItemStyle: React.CSSProperties = {
    padding: '8px 14px', fontSize: 12, color: '#c9d1d9',
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
  };

  const [contextMenu, setContextMenu] = React.useState<ContextMenuState>(null);
  const [inspectPopup, setInspectPopup] = React.useState<{ data: Record<string, unknown> } | null>(null);

  // Build mapping: parentNodeId → [{blockId, blockType}]
  const blockParents = useMemo(() => {
    const map = new Map<string, { blockId: string; blockType: string }[]>();
    for (const edge of rawEdges) {
      const target = rawNodes.find(n => n.id === edge.target);
      if (target?.data?.blockId) {
        const source = rawNodes.find(n => n.id === edge.source);
        if (source && ['loop', 'condition', 'try', 'except', 'statement'].includes(source.data.nodeType)) {
          const entry = { blockId: target.data.blockId, blockType: target.data.blockType || 'block' };
          const existing = map.get(edge.source) || [];
          if (!existing.some(e => e.blockId === entry.blockId)) {
            existing.push(entry);
          }
          map.set(edge.source, existing);
        }
      }
    }
    return map;
  }, [rawNodes, rawEdges]);

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      const data = node.data as unknown as FlowNodeData;

      // Comment nodes: expand/collapse
      if (data.nodeType === 'comment') {
        event.preventDefault();
        setContextMenu({
          x: event.clientX, y: event.clientY, kind: 'comment',
          nodeId: node.id, collapsed: data.collapsed !== false,
        });
        return;
      }

      // Structural nodes with child blocks: view block
      const blocks = blockParents.get(node.id);
      if (blocks && blocks.length > 0) {
        event.preventDefault();
        setContextMenu({
          x: event.clientX, y: event.clientY, kind: 'block',
          nodeId: node.id,
          blockIds: blocks.map(b => b.blockId),
          blockTypes: blocks.map(b => b.blockType),
        });
        return;
      }

      // Expandable function nodes (e.g. class methods): view in isolation
      if (data.expandable && (data.callName || data.funcName) && !data.isClass) {
        event.preventDefault();
        setContextMenu({
          x: event.clientX, y: event.clientY, kind: 'functionView',
          nodeId: node.id,
          callName: data.callName || data.funcName,
        });
        return;
      }

      // Any non-entry node: offer "Find definition"
      if (data.nodeType !== 'entry' && data.nodeType !== 'groupBox') {
        // If node has inspect data, show inspect menu
        const insp = data.inspect as Record<string, unknown> | undefined;
        if (insp) {
          event.preventDefault();
          setContextMenu({
            x: event.clientX, y: event.clientY, kind: 'inspect',
            nodeId: node.id, inspectData: insp,
          });
          return;
        }
        event.preventDefault();
        setContextMenu({
          x: event.clientX, y: event.clientY, kind: 'findDef',
          nodeId: node.id,
        });
      }
    },
    [blockParents]
  );

  // Right-click on pane (background) → "Go to start"
  const handlePaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      const pos = 'clientX' in event ? { x: event.clientX, y: event.clientY } : { x: 0, y: 0 };
      setContextMenu({
        x: pos.x, y: pos.y, kind: 'pane',
        nodeId: '',
      });
    },
    []
  );

  const handleContextMenuAction = useCallback((action: string, blockId?: string) => {
    if (!contextMenu) return;
    setContextMenu(null);

    if (contextMenu.kind === 'comment') {
      const expand = action === 'expand';
      setNodes(nds =>
        (nds as unknown as FlowNode[]).map(n => {
          if (n.id === contextMenu.nodeId) {
            return { ...n, data: { ...n.data, collapsed: !expand } };
          }
          return n;
        }) as unknown as Node[]
      );
    } else if (contextMenu.kind === 'block' && blockId) {
      // Enter isolated block view — the useMemo above filters automatically
      setIsolatedBlockId(blockId);
    } else if (contextMenu.kind === 'functionView') {
      if (onNodeDoubleClick && contextMenu.callName) {
        const nodeData: FlowNodeData = {
          label: '', nodeType: 'function', expandable: true,
          callName: contextMenu.callName,
        };
        onNodeDoubleClick(contextMenu.nodeId, nodeData);
      }
    } else if (contextMenu.kind === 'findDef') {
      // Find the nearest structural parent by traversing block hierarchy
      const targetNode = (nodesState as unknown as FlowNode[]).find(n => n.id === contextMenu.nodeId);
      if (targetNode) {
        const d = targetNode.data as unknown as FlowNodeData;
        const bid = d.blockId;
        if (bid) {
          // Walk up: block_0_1 → block_0
          const parts = bid.split('_');
          while (parts.length > 1) {
            parts.pop();
            const parentBid = parts.join('_');
            const header = (nodesState as unknown as FlowNode[]).find(n => {
              const nd = n.data as unknown as FlowNodeData;
              return ['loop', 'condition', 'try', 'except', 'entry', 'with'].includes(nd.nodeType)
                && rawEdges.some(e => {
                  const t = rawNodes.find(rn => rn.id === e.target);
                  const td = t?.data as unknown as FlowNodeData;
                  return e.source === n.id && td?.blockId === parentBid;
                });
            });
            if (header) {
              centerOnNode(header.id);
              break;
            }
          }
        }
      }
    } else if (contextMenu.kind === 'pane') {
      // Go to start: find entry node and center
      const entryNode = (nodesState as unknown as FlowNode[]).find(n => {
        const d = n.data as unknown as FlowNodeData;
        return d.nodeType === 'entry';
      });
      if (entryNode) {
        centerOnNode(entryNode.id);
      }
    }
  }, [contextMenu, setNodes, rawNodes, rawEdges, onNodeDoubleClick, centerOnNode, nodesState]);

  const handleExitIsolation = useCallback(() => {
    setIsolatedBlockId(null);
  }, []);

  // Close context menu on click elsewhere
  React.useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  return (
    <div style={{ width: '100%', height: '100%', background: '#0d1117' }}>
      <ReactFlow
        nodes={nodesState}
        edges={edgesState}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeContextMenu={handleNodeContextMenu}
        onPaneContextMenu={handlePaneContextMenu}
        nodeTypes={nodeTypes}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
        }}
        proOptions={{ hideAttribution: true }}
        onlyRenderVisibleElements={false}
        elevateNodesOnSelect={false}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#21262d"
        />
        <Controls
          style={{
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: 8,
          }}
          className="flow-controls"
        />
        {showMinimap && (
        <MiniMap
          style={{
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: 8,
          }}
          nodeColor={(node) => {
            const ntype = (node.data as any)?.nodeType;
            if (ntype === 'groupBox') return 'transparent';
            const colors: Record<string, string> = {
              entry: '#4fc3f7',
              exit: '#81c784',
              condition: '#ffb74d',
              loop: '#4dd0e1',
              statement: '#78909c',
              call: '#ce93d8',
              function: '#64b5f6',
              try: '#ef5350',
              except: '#ff7043',
              error: '#f44336',
            };
            return colors[ntype] || '#546e7a';
          }}
          maskColor="rgba(13, 17, 23, 0.7)"
        />
        )}
      </ReactFlow>

      {/* Context menu for comment expand/collapse */}
      {contextMenu && contextMenu.kind === 'comment' && (
        <div
          style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y,
            background: '#161b22', border: '1px solid #30363d', borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 1000, overflow: 'hidden', minWidth: 140,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: '6px 12px', fontSize: 11, color: '#8b949e', borderBottom: '1px solid #21262d' }}>Comment</div>
          <div onClick={() => handleContextMenuAction('expand')} style={menuItemStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#1f2937')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
            <span>📖</span> Expand
          </div>
          <div onClick={() => handleContextMenuAction('collapse')} style={menuItemStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#1f2937')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
            <span>📕</span> Collapse
          </div>
        </div>
      )}

      {contextMenu && contextMenu.kind === 'block' && contextMenu.blockIds && (
        <div
          style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y,
            background: '#161b22', border: '1px solid #30363d', borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 1000, overflow: 'hidden', minWidth: 160,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: '6px 12px', fontSize: 11, color: '#8b949e', borderBottom: '1px solid #21262d' }}>View block</div>
          {contextMenu.blockIds.map((bid, i) => {
            const btype = (contextMenu.blockTypes || [])[i] || 'block';
            const labelMap: Record<string, string> = {
              'while': 'while body', 'for': 'for body', 'if': 'if body',
              'else': 'else body', 'try': 'try body', 'except': 'except handler',
              'finally': 'finally', 'with': 'with block', 'match_case': 'case body',
            };
            return (
              <div key={bid}
                onClick={() => handleContextMenuAction('view', bid)}
                style={menuItemStyle}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#1f2937')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                <span>🔍</span> View {labelMap[btype] || btype}
              </div>
            );
          })}
        </div>
      )}

      {contextMenu && contextMenu.kind === 'functionView' && (
        <div
          style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y,
            background: '#161b22', border: '1px solid #30363d', borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 1000, overflow: 'hidden', minWidth: 160,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: '6px 12px', fontSize: 11, color: '#8b949e', borderBottom: '1px solid #21262d' }}>Method</div>
          <div onClick={() => handleContextMenuAction('view')} style={menuItemStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#1f2937')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
            <span>🔍</span> View method
          </div>
        </div>
      )}

      {contextMenu && contextMenu.kind === 'findDef' && (
        <div
          style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y,
            background: '#161b22', border: '1px solid #30363d', borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 1000, overflow: 'hidden', minWidth: 160,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: '6px 12px', fontSize: 11, color: '#8b949e', borderBottom: '1px solid #21262d' }}>Navigate</div>
          <div onClick={() => handleContextMenuAction('findDef')} style={menuItemStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#1f2937')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
            <span>📍</span> Find definition
          </div>
        </div>
      )}

      {contextMenu && contextMenu.kind === 'inspect' && contextMenu.inspectData && (
        <div
          style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y,
            background: '#161b22', border: '1px solid #30363d', borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 1000, overflow: 'hidden', minWidth: 160,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: '6px 12px', fontSize: 11, color: '#8b949e', borderBottom: '1px solid #21262d' }}>Inspect</div>
          <div onClick={() => { setInspectPopup({ data: contextMenu.inspectData! }); setContextMenu(null); }} style={menuItemStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#1f2937')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
            <span>🔍</span> Inspect value
          </div>
        </div>
      )}

      {/* Inspect popup overlay */}
      {inspectPopup && (
        <div
          onClick={() => setInspectPopup(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#161b22', border: '1px solid #30363d', borderRadius: 12,
              padding: 20, maxWidth: 560, maxHeight: '70vh', overflow: 'auto',
              boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ color: '#58a6ff', fontWeight: 700, fontSize: 14 }}>🔍 Inspect</span>
              <span onClick={() => setInspectPopup(null)}
                style={{ color: '#8b949e', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</span>
            </div>
            <pre style={{
              color: '#c9d1d9', fontSize: 12, fontFamily: "'JetBrains Mono', 'Consolas', monospace",
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
              background: '#0d1117', borderRadius: 8, padding: 12,
            }}>
              {JSON.stringify(inspectPopup.data, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {contextMenu && contextMenu.kind === 'pane' && (
        <div
          style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y,
            background: '#161b22', border: '1px solid #30363d', borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 1000, overflow: 'hidden', minWidth: 160,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: '6px 12px', fontSize: 11, color: '#8b949e', borderBottom: '1px solid #21262d' }}>Navigate</div>
          <div onClick={() => handleContextMenuAction('goStart')} style={menuItemStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#1f2937')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
            <span>📍</span> Go to start
          </div>
        </div>
      )}

      {/* Back button when isolated */}
      {isolatedBlockId && (
        <div style={{
          position: 'absolute', top: 10, left: 10, zIndex: 10,
        }}>
          <button onClick={handleExitIsolation} style={{
            background: '#238636', color: '#fff', border: 'none', borderRadius: 6,
            padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}>
            ← Back to full view
          </button>
        </div>
      )}
    </div>
  );
};

export type { FlowNodeData };
export default FlowCanvas;
