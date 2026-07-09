import React, { useMemo, useEffect, useRef, useCallback, useState } from 'react';
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import type { FlowNode, FlowEdge, FlowBlock, FlowNodeData } from '../types';
import { nodeTypes } from './CustomNodes';

// ── Props ─────────────────────────────────────────────────────
interface FlowCanvasProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  blocks?: FlowBlock[];
  onNodeClick?: (nodeId: string, data: FlowNodeData) => void;
  onNodeDoubleClick?: (nodeId: string, data: FlowNodeData) => void;
  highlightedNodeId?: string | null;
  showMinimap?: boolean;
  animatedEdges?: boolean;
}

// ── Dagre Layout ──────────────────────────────────────────────
const NODE_WIDTH = 180;
const NODE_HEIGHT = 56;

function layoutGraph(
  nodes: FlowNode[],
  edges: FlowEdge[],
  blocks?: FlowBlock[]
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const g = new dagre.graphlib.Graph({ compound: true });
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 70, marginx: 30, marginy: 30 });

  for (const node of nodes) {
    const w = Math.max(NODE_WIDTH, (node.data.label?.length || 0) * 7.5 + 60);
    g.setNode(node.id, { width: w, height: NODE_HEIGHT });
  }

  if (blocks) {
    for (const block of blocks) {
      g.setNode(block.id, { width: 100, height: 60, padding: 25 });
      for (const nid of block.nodeIds) {
        if (g.hasNode(nid)) g.setParent(nid, block.id);
      }
    }
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const laidOut = nodes.map(node => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - (pos.width || NODE_WIDTH) / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: laidOut, edges };
}

// ── Edge Coloring ─────────────────────────────────────────────
function edgeColor(type?: string) {
  switch (type) {
    case 'true': return '#22c55e';
    case 'false': return '#ef4444';
    case 'exception': return '#f59e0b';
    case 'loop': return '#06b6d4';
    case 'call': return '#a855f7';
    default: return '#484858';
  }
}

// ── Component ─────────────────────────────────────────────────
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
  const initialFitDone = useRef(false);

  const [isolatedBlockId, setIsolatedBlockId] = useState<string | null>(null);

  // ── Filter nodes for block isolation view ────────────────
  const effectiveNodes = useMemo(() => {
    if (!isolatedBlockId) return rawNodes;
    return rawNodes.filter(n => {
      const bid = n.data.blockId || '';
      return bid === isolatedBlockId || bid.startsWith(isolatedBlockId + '_') || bid.startsWith(isolatedBlockId + '-');
    });
  }, [rawNodes, isolatedBlockId]);
  const effectiveEdges = useMemo(() => {
    if (!isolatedBlockId) return rawEdges;
    const validIds = new Set(effectiveNodes.map(n => n.id));
    return rawEdges.filter(e => validIds.has(e.source) && validIds.has(e.target));
  }, [rawEdges, effectiveNodes]);

  // ── Dagre layout ──────────────────────────────────────────
  const { nodes: laidOutNodes, edges: laidOutEdges } = useMemo(
    () => layoutGraph(effectiveNodes, effectiveEdges, blocks),
    [effectiveNodes, effectiveEdges, blocks]
  );

  // ── Style edges ──────────────────────────────────────────
  const styledEdges = useMemo(() =>
    laidOutEdges.map(e => ({
      ...e,
      animated: animatedEdges && (e.type === 'loop' || e.animated),
      style: {
        stroke: e.type === 'loop' ? '#06b6d4' : edgeColor(e.type),
        strokeWidth: e.type === 'loop' ? 2 : e.type ? 2.5 : 1.5,
        strokeDasharray: e.type === 'loop' ? '6 3' : undefined,
      },
      labelStyle: { fill: '#686880', fontSize: 10 },
    })),
    [laidOutEdges, animatedEdges]
  );

  // ── Style nodes with highlight ───────────────────────────
  const styledNodes = useMemo(() =>
    laidOutNodes.map(n => ({
      ...n,
      className: highlightedNodeId && n.id === highlightedNodeId ? 'flow-node-highlighted' : '',
    })),
    [laidOutNodes, highlightedNodeId]
  );

  const [nodesState, setNodes, onNodesChange] = useNodesState(styledNodes as unknown as Node[]);
  const [edgesState, setEdges, onEdgesChange] = useEdgesState(styledEdges as unknown as Edge[]);

  // ── Sync props → state, fitView once ─────────────────────
  useEffect(() => {
    const hasNodes = styledNodes.length > 0;
    setNodes(styledNodes as unknown as Node[]);
    setEdges(styledEdges as unknown as Edge[]);
    if (hasNodes && !initialFitDone.current) {
      initialFitDone.current = true;
      setTimeout(() => fitView({ padding: 0.3, duration: 300 }), 50);
    }
  }, [styledNodes, styledEdges, setNodes, setEdges, fitView]);

  // ── Center on highlighted node ───────────────────────────
  useEffect(() => {
    if (!highlightedNodeId || highlightedNodeId === prevHighlighted.current) return;
    prevHighlighted.current = highlightedNodeId;
    const raf = requestAnimationFrame(() => {
      const target = (nodesState as unknown as FlowNode[]).find(n => n.id === highlightedNodeId);
      if (!target || !target.position) return;
      const zoom = getZoom();
      setCenter(target.position.x + 90, target.position.y + 28, { zoom, duration: 250 });
    });
    return () => cancelAnimationFrame(raf);
  }, [highlightedNodeId, nodesState, setCenter, getZoom]);

  // ── Click handlers ───────────────────────────────────────
  const handleNodeClick = useCallback(
    (_e: React.MouseEvent, node: Node) => onNodeClick?.(node.id, node.data as unknown as FlowNodeData),
    [onNodeClick]
  );

  const handleNodeDoubleClick = useCallback(
    (_e: React.MouseEvent, node: Node) => onNodeDoubleClick?.(node.id, node.data as unknown as FlowNodeData),
    [onNodeDoubleClick]
  );

  // ── Context Menu ─────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; kind: string; nodeId?: string;
    inspectData?: Record<string, unknown>; blockIds?: string[];
    collapsed?: boolean; callName?: string; funcName?: string;
  } | null>(null);
  const [inspectPopup, setInspectPopup] = useState<{ data: any } | null>(null);

  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    const data = node.data as unknown as FlowNodeData;
    if (data.isGroupBox) return;

    if (data.nodeType === 'comment') {
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY, kind: 'comment', nodeId: node.id, collapsed: data.collapsed });
      return;
    }

    // Expandable function/method nodes → "View function" option
    if (data.expandable && (data.callName || data.funcName) && !data.isClass) {
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY, kind: 'functionView', nodeId: node.id, callName: data.callName || data.funcName });
      return;
    }

    // Class nodes → "View class" option
    if (data.isClass && data.funcName) {
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY, kind: 'functionView', nodeId: node.id, callName: data.funcName, funcName: data.funcName });
      return;
    }

    // Function call nodes → "View definition" (drill-down to the function definition)
    if (data.callName && !data.isClass) {
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY, kind: 'callDef', nodeId: node.id, callName: data.callName });
      return;
    }

    // Block context: nodes inside structural blocks → "View block"
    if (data.blockId && data.nodeType !== 'entry' && data.nodeType !== 'groupBox') {
      const blockList = blocks
        ? blocks.filter(b => b.nodeIds.includes(node.id) && b.type !== 'comment' && b.type !== 'chunk')
        : [];
      if (blockList.length > 0) {
        event.preventDefault();
        setContextMenu({ x: event.clientX, y: event.clientY, kind: 'block', nodeId: node.id, blockIds: blockList.map(b => b.id) });
        return;
      }
      // Any node with a blockId can show its containing block
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY, kind: 'block', nodeId: node.id, blockIds: [data.blockId] });
      return;
    }

    // Inspect data
    if (data.inspect) {
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY, kind: 'inspect', nodeId: node.id, inspectData: data.inspect as Record<string, unknown> });
      return;
    }

    // Default: Find definition
    if (data.nodeType !== 'entry' && data.nodeType !== 'groupBox') {
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY, kind: 'findDef', nodeId: node.id });
    }
  }, [blocks]);

  const clearMenu = () => setContextMenu(null);

  const handleContextAction = useCallback((action: string, blockId?: string) => {
    if (!contextMenu) return;

    if (action === 'findDef') {
      const node = (nodesState as unknown as FlowNode[]).find(n => n.id === contextMenu.nodeId);
      if (!node) { clearMenu(); return; }
      const bid = node.data.blockId;
      // Walk up blockId hierarchy to find the parent structural header
      if (bid) {
        const parts = bid.split('_');
        while (parts.length > 0) {
          parts.pop();
          const parentBid = parts.join('_');
          if (!parentBid || parts.length === 0) break;
          const hdr = rawEdges.find(e => {
            const t = rawNodes.find(nd => nd.id === e.target);
            return t?.data?.blockId === parentBid;
          });
          if (hdr) {
            const zoom = getZoom();
            const tgt = (nodesState as unknown as FlowNode[]).find(nd => nd.id === hdr.source);
            if (tgt && tgt.position) setCenter(tgt.position.x + 90, tgt.position.y + 28, { zoom, duration: 250 });
            break;
          }
        }
      }
      clearMenu();
      return;
    }

    if (action === 'viewBlock' && blockId) {
      setIsolatedBlockId(blockId);
      clearMenu();
      return;
    }

    if (action === 'exitIsolation') {
      setIsolatedBlockId(null);
      clearMenu();
      return;
    }

    if (action === 'functionView' && contextMenu.callName && onNodeDoubleClick) {
      onNodeDoubleClick(contextMenu.nodeId || '', {
        label: '', nodeType: 'function', expandable: true,
        callName: contextMenu.callName,
        funcName: contextMenu.funcName || contextMenu.callName,
      });
      clearMenu();
      return;
    }

    // Toggle comment collapse/expand
    if (action === 'toggleComment') {
      setNodes(prev => prev.map(n => {
        if (n.id === contextMenu.nodeId) {
          const d = { ...n.data as any, collapsed: !contextMenu.collapsed };
          return { ...n, data: d };
        }
        return n;
      }));
      clearMenu();
      return;
    }

    // View function definition (call node → navigate to function body)
    if (action === 'callDef' && contextMenu.callName && onNodeDoubleClick) {
      onNodeDoubleClick(contextMenu.nodeId || '', {
        label: '', nodeType: 'function', expandable: true, callName: contextMenu.callName,
        funcName: contextMenu.funcName || contextMenu.callName,
      });
      clearMenu();
      return;
    }

    clearMenu();
  }, [contextMenu, nodesState, rawEdges, rawNodes, setCenter, getZoom, onNodeDoubleClick, setNodes]);

  // Fit view when isolation changes
  useEffect(() => {
    if (isolatedBlockId) {
      const timer = setTimeout(() => fitView({ padding: 0.3, duration: 300 }), 80);
      return () => clearTimeout(timer);
    }
  }, [isolatedBlockId, fitView]);

  const paneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
    event.preventDefault();
    const pos = 'clientX' in event ? { x: event.clientX, y: event.clientY } : { x: 0, y: 0 };
    setContextMenu({ x: pos.x, y: pos.y, kind: 'pane' });
  }, []);

  // ── Render ─────────────────────────────────────────────
  const buttonStyle: React.CSSProperties = {
    position: 'absolute', top: 10, left: 10, zIndex: 10,
    background: '#1a1a28', color: '#e8e8f0', border: '1px solid #2a2a3e',
    borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: "'Inter', sans-serif",
    transition: 'background 0.15s',
  };
  const menuItemStyle: React.CSSProperties = {
    padding: '7px 14px', fontSize: 12, color: '#e8e8f0', cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.1s',
  };

  return (
    <>
      <ReactFlow
        nodes={nodesState}
        edges={edgesState}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeContextMenu={handleNodeContextMenu}
        onPaneContextMenu={paneContextMenu}
        nodeTypes={nodeTypes}
        minZoom={0.08}
        maxZoom={2.5}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        proOptions={{ hideAttribution: true }}
        fitView={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1a1a28" />
        <Controls className="flow-controls" />
        {showMinimap && (
          <MiniMap
            style={{ background: '#1e1e30', border: '1px solid #2a2a3e', borderRadius: 10 }}
            maskColor="rgba(10, 10, 15, 0.7)"
            nodeColor={(n) => {
              const d = (n as unknown as { data?: { nodeType?: string } })?.data;
              switch (d?.nodeType) {
                case 'entry': return '#22c55e';
                case 'exit': return '#ef4444';
                case 'condition': return '#f59e0b';
                case 'loop': return '#06b6d4';
                case 'call': return '#a855f7';
                default: return '#3b82f6';
              }
            }}
          />
        )}
      </ReactFlow>

      {/* Isolation back button */}
      {isolatedBlockId && (
        <div
          onClick={() => setIsolatedBlockId(null)}
          style={{ ...buttonStyle, top: 10, left: 10 }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#2a2a4a')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#1a1a28')}
        >
          ← Back to full view
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (contextMenu.kind === 'comment') && (
        <div className="context-menu" onClick={(e) => e.stopPropagation()}
          style={{ left: contextMenu.x, top: contextMenu.y }}>
          <div className="context-menu-header">Comment</div>
          <div className="context-menu-item" onClick={() => handleContextAction('toggleComment')}>
            {contextMenu.collapsed ? '📖 Expand' : '📕 Collapse'}
          </div>
        </div>
      )}
      {contextMenu && contextMenu.kind === 'block' && contextMenu.blockIds && (
        <div className="context-menu" onClick={(e) => e.stopPropagation()}
          style={{ left: contextMenu.x, top: contextMenu.y }}>
          <div className="context-menu-header">Navigate</div>
          {contextMenu.blockIds.map((bid, i) => (
            <div key={bid} className="context-menu-item" onClick={() => handleContextAction('viewBlock', bid)}>
              <span>⊞</span> View block {i + 1}
            </div>
          ))}
        </div>
      )}
      {contextMenu && contextMenu.kind === 'functionView' && (
        <div className="context-menu" onClick={(e) => e.stopPropagation()}
          style={{ left: contextMenu.x, top: contextMenu.y }}>
          <div className="context-menu-header">Navigate</div>
          <div className="context-menu-item" onClick={() => handleContextAction('functionView')}>
            <span>🔍</span> View {contextMenu.callName}
          </div>
        </div>
      )}
      {contextMenu && contextMenu.kind === 'callDef' && (
        <div className="context-menu" onClick={(e) => e.stopPropagation()}
          style={{ left: contextMenu.x, top: contextMenu.y }}>
          <div className="context-menu-header">Navigate</div>
          <div className="context-menu-item" onClick={() => handleContextAction('callDef')}>
            <span>📄</span> View definition of {contextMenu.callName}
          </div>
        </div>
      )}
      {contextMenu && contextMenu.kind === 'inspect' && contextMenu.inspectData && (
        <div className="context-menu" onClick={(e) => e.stopPropagation()}
          style={{ left: contextMenu.x, top: contextMenu.y }}>
          <div className="context-menu-header">Inspect</div>
          <div className="context-menu-item" onClick={() => { setInspectPopup({ data: contextMenu.inspectData! as any }); clearMenu(); }}>
            <span>🔍</span> Inspect value
          </div>
        </div>
      )}
      {contextMenu && contextMenu.kind === 'findDef' && (
        <div className="context-menu" onClick={(e) => e.stopPropagation()}
          style={{ left: contextMenu.x, top: contextMenu.y }}>
          <div className="context-menu-header">Navigate</div>
          <div className="context-menu-item" onClick={() => handleContextAction('findDef')}>
            <span>📍</span> Find definition
          </div>
        </div>
      )}
      {contextMenu && contextMenu.kind === 'pane' && (
        <div className="context-menu" onClick={(e) => e.stopPropagation()}
          style={{ left: contextMenu.x, top: contextMenu.y }}>
          <div className="context-menu-header">Navigate</div>
          <div className="context-menu-item" onClick={() => {
            const entry = (nodesState as unknown as FlowNode[]).find(n => n.data.nodeType === 'entry');
            if (entry && entry.position) setCenter(entry.position.x + 90, entry.position.y + 28, { zoom: getZoom(), duration: 250 });
            clearMenu();
          }}>
            <span>📍</span> Go to start
          </div>
        </div>
      )}

      {!contextMenu && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 998, display: 'none' }}
          onClick={clearMenu}
        />
      )}
      {contextMenu && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 998, background: 'transparent' }}
          onClick={clearMenu}
        />
      )}

      {/* Inspect Popup */}
      {inspectPopup && (
        <div className="inspect-overlay" onClick={() => setInspectPopup(null)}>
          <div className="inspect-modal" onClick={(e) => e.stopPropagation()}>
            <div className="inspect-header">
              <span className="inspect-title">🔍 Inspect</span>
              <span className="inspect-close" onClick={() => setInspectPopup(null)}>✕</span>
            </div>
            <pre className="inspect-content">
              {JSON.stringify(inspectPopup.data, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </>
  );
};

export default FlowCanvas;
