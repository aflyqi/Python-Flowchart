import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import CodeEditor, { DEFAULT_CODE } from './components/CodeEditor';
import ControlPanel from './components/ControlPanel';
import FlowCanvas from './components/FlowCanvas';
import { parseCode, parseFunction, parseClass } from './api';
import type { FlowNode, FlowEdge, FunctionInfo, BreadcrumbItem, FlowBlock, FlowNodeData, ViewMode } from './types';
import './styles.css';

const LS_KEY = 'better-ui-editor-code';

function loadSaved(): string {
  try { return localStorage.getItem(LS_KEY) || DEFAULT_CODE; }
  catch { return DEFAULT_CODE; }
}

function persistCode(code: string) {
  try { localStorage.setItem(LS_KEY, code); }
  catch { /* ignore */ }
}

const App: React.FC = () => {
  // ── State ─────────────────────────────────────────────────
  const [code, setCode] = useState(loadSaved);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [blocks, setBlocks] = useState<FlowBlock[]>([]);
  const [functions, setFunctions] = useState<FunctionInfo[]>([]);
  const [selectedFunction, setSelectedFunction] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('file');
  const [maxDepth, setMaxDepth] = useState(0);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Toggles (all default OFF)
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [autoJumpEnabled, setAutoJumpEnabled] = useState(false);
  const [searchDepth, setSearchDepth] = useState(1);
  const [structGroupsEnabled, setStructGroupsEnabled] = useState(false);
  const [chunkGroupsEnabled, setChunkGroupsEnabled] = useState(false);
  const [showMinimap, setShowMinimap] = useState(true);
  const [animatedEdges, setAnimatedEdges] = useState(true);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);

  // Refs
  const monacoRef = useRef<any>(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const functionsRef = useRef(functions);
  functionsRef.current = functions;
  const syncEnabledRef = useRef(syncEnabled);
  syncEnabledRef.current = syncEnabled;
  const autoJumpRef = useRef(autoJumpEnabled);
  autoJumpRef.current = autoJumpEnabled;
  const selectFnRef = useRef<(name: string) => Promise<void>>(async () => {});
  // selectFnRef.current updated below after handleSelectFunction is defined

  // ── Persist code ─────────────────────────────────────────
  useEffect(() => { persistCode(code); }, [code]);

  // ── Parse ─────────────────────────────────────────────────
  const handleParse = useCallback(async () => {
    setLoading(true);
    setError('');
    setHighlightedNodeId(null);
    try {
      const result = await parseCode(code, '', structGroupsEnabled, chunkGroupsEnabled);
      setNodes(result.nodes);
      setEdges(result.edges);
      setBlocks(result.blocks || []);
      const fns = result.defined_functions || result.functions || [];
      setFunctions(fns);
      setBreadcrumbs([{ label: 'File' }]);
      setViewMode('file');
      setSelectedFunction('');
    } catch (err: any) {
      setError(err.message || 'Parse failed');
    } finally {
      setLoading(false);
    }
  }, [code, structGroupsEnabled, chunkGroupsEnabled]);

  // ── Cursor → highlight / auto-jump ────────────────────────
  const handleCursorLineChange = useCallback((line: number) => {
    if (!syncEnabledRef.current && !autoJumpRef.current) return;

    const match = nodesRef.current.find(n => n.data.lineNo === line);
    if (match) {
      setHighlightedNodeId(match.id);
      return;
    }

    if (!autoJumpRef.current) return;

    // Auto-jump: find containing function
    const funcs = functionsRef.current;
    let bestMatch: { name: string; range: number } | null = null;
    for (const fn of funcs) {
      const endRaw = fn.end_lineno;
      const end = (endRaw && endRaw > fn.lineno) ? endRaw : fn.lineno + 10;
      if (line >= fn.lineno && line <= end) {
        const range = end - fn.lineno;
        if (!bestMatch || range < bestMatch.range) {
          bestMatch = { name: fn.name, range };
        }
      }
    }
    if (!bestMatch) return;

    setLoading(true);
    parseFunction(code, bestMatch.name, '', maxDepth, structGroupsEnabled, chunkGroupsEnabled)
      .then(result => {
        setNodes(result.nodes);
        setEdges(result.edges);
        setBlocks(result.blocks || []);
        setSelectedFunction(bestMatch!.name);
        setViewMode('function');
        setBreadcrumbs([{ label: 'File' }, { label: bestMatch!.name, funcName: bestMatch!.name }]);
        const m = result.nodes.find((n: FlowNode) => n.data.lineNo === line);
        setHighlightedNodeId(m?.id ?? null);
        setLoading(false);
      })
      .catch(async (err) => {
        // If parse_function fails with "not found", fallback: find matching
        // function by name prefix and use selectFunction instead
        const msg = err?.message || '';
        if (msg.includes('not found') || msg.includes('not found')) {
          const fallback = functionsRef.current.find(fn =>
            fn.name.endsWith(bestMatch!.name) || fn.name === bestMatch!.name
          );
          if (fallback) {
            // Inline selectFunction logic to avoid stale closure issues
            try {
              const r = await parseFunction(code, fallback.name, '', maxDepth, structGroupsEnabled, chunkGroupsEnabled);
              setNodes(r.nodes);
              setEdges(r.edges);
              setBlocks(r.blocks || []);
              setSelectedFunction(fallback.name);
              setViewMode('function');
              setBreadcrumbs([{ label: 'File' }, { label: fallback.name, funcName: fallback.name }]);
              const m = r.nodes.find((n: FlowNode) => n.data.lineNo === line);
              setHighlightedNodeId(m?.id ?? null);
            } catch {}
            setLoading(false);
            return;
          }
        }
        setError(msg);
        setLoading(false);
      });
  }, [code, maxDepth, structGroupsEnabled, chunkGroupsEnabled]);

  // ── Node click → sync (Flow → Code) ──────────────────────
  const handleNodeClick = useCallback((_id: string, data: FlowNodeData) => {
    if (!syncEnabledRef.current || !data.lineNo) return;
    const ed = monacoRef.current;
    if (ed) {
      ed.revealLineInCenter(data.lineNo);
      ed.setPosition({ lineNumber: data.lineNo, column: 1 });
      ed.focus();
    }
  }, []);

  // ── Node double-click → drill-down ────────────────────────
  const handleNodeDoubleClick = useCallback(async (_id: string, data: FlowNodeData) => {
    if (!data.expandable) return;

    const callName = data.callName || data.funcName;
    if (data.isClass && callName) {
      setLoading(true);
      try {
        const r = await parseClass(code, callName, '', structGroupsEnabled, chunkGroupsEnabled);
        setNodes(r.nodes);
        setEdges(r.edges);
        setBlocks(r.blocks || []);
        setSelectedFunction(callName);
        setViewMode('function');
        setBreadcrumbs(prev => [...prev, { label: callName, funcName: callName, isClass: true }]);
      } catch (err: any) {
        setError(err.message);
      } finally { setLoading(false); }
      return;
    }

    if (callName) {
      setLoading(true);
      try {
        const r = await parseFunction(code, callName, '', maxDepth, structGroupsEnabled, chunkGroupsEnabled);
        setNodes(r.nodes);
        setEdges(r.edges);
        setBlocks(r.blocks || []);
        setSelectedFunction(callName);
        setBreadcrumbs(prev => prev.length ? [...prev, { label: callName, funcName: callName }] : [{ label: 'File' }, { label: callName, funcName: callName }]);
      } catch (err: any) {
        setError(err.message);
      } finally { setLoading(false); }
      return;
    }
  }, [code, maxDepth, structGroupsEnabled, chunkGroupsEnabled]);

  useEffect(() => { selectFnRef.current = handleSelectFunction; });

  // ── Breadcrumb ────────────────────────────────────────────
  const handleBreadcrumbClick = useCallback((index: number) => {
    const target = breadcrumbs[index];
    if (!target) return;

    const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(newBreadcrumbs);

    if (index === 0) {
      handleParse();
      return;
    }

    if (target.funcName) {
      handleNodeDoubleClick('', { expandable: true, callName: target.funcName, isClass: target.isClass, nodeType: '', label: '' });
    }
  }, [breadcrumbs, handleParse, handleNodeDoubleClick]);

  // ── Function selector ─────────────────────────────────────
  const handleSelectFunction = useCallback(async (name: string) => {
    if (!name) return;
    setSelectedFunction(name);
    setLoading(true);
    try {
      const r = await parseFunction(code, name, '', maxDepth, structGroupsEnabled, chunkGroupsEnabled);
      setNodes(r.nodes);
      setEdges(r.edges);
      setBlocks(r.blocks || []);
      setViewMode('function');
      setBreadcrumbs([{ label: 'File' }, { label: name, funcName: name }]);
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  }, [code, maxDepth, structGroupsEnabled, chunkGroupsEnabled]);

  // ── View mode ─────────────────────────────────────────────
  const handleViewModeChange = useCallback(async (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'file') handleParse();
    if (mode === 'project') {
      // Project view placeholder
    }
  }, [handleParse]);

  // ── Export PNG ────────────────────────────────────────────
  const handleExportPNG = useCallback(() => {
    const flowEl = document.querySelector('.react-flow__viewport') as HTMLElement;
    if (!flowEl) return;
    import('html-to-image').then(({ toPng }) => {
      toPng(flowEl, { backgroundColor: '#0a0a0f', pixelRatio: 2 })
        .then((dataUrl: string) => {
          const link = document.createElement('a');
          link.download = 'flowchart.png';
          link.href = dataUrl;
          link.click();
        })
        .catch(() => {});
    }).catch(() => {});
  }, []);

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-title">
          Python Flowchart <span>| Beautiful Code Visualization</span>
        </div>
      </header>

      <div className="app-body">
        {/* Left panel: code editor */}
        <div className="panel panel-left" style={{ width: 420, minWidth: 240, flexShrink: 0 }}>
          <div className="code-panel-header">
            <span className="code-panel-title">📝 Code Editor</span>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <CodeEditor
              value={code}
              onChange={setCode}
              onCursorLineChange={handleCursorLineChange}
              onEditorMount={(ed) => { monacoRef.current = ed; }}
            />
          </div>
        </div>

        {/* Right panel: flowchart */}
        <div className="panel panel-right">
          <ControlPanel
            functions={functions}
            selectedFunction={selectedFunction}
            onSelectFunction={handleSelectFunction}
            maxDepth={maxDepth}
            onDepthChange={setMaxDepth}
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
            breadcrumbs={breadcrumbs}
            onBreadcrumbClick={handleBreadcrumbClick}
            onExportPNG={handleExportPNG}
            onPopout={undefined}
            loading={loading}
            syncEnabled={syncEnabled}
            onSyncToggle={() => setSyncEnabled(p => !p)}
            structGroupsEnabled={structGroupsEnabled}
            onStructGroupsToggle={() => setStructGroupsEnabled(p => !p)}
            chunkGroupsEnabled={chunkGroupsEnabled}
            onChunkGroupsToggle={() => setChunkGroupsEnabled(p => !p)}
            showMinimap={showMinimap}
            onMinimapToggle={() => setShowMinimap(p => !p)}
            animatedEdges={animatedEdges}
            onAnimatedEdgesToggle={() => setAnimatedEdges(p => !p)}
            autoJumpEnabled={autoJumpEnabled}
            onAutoJumpToggle={() => setAutoJumpEnabled(p => !p)}
            searchDepth={searchDepth}
            onSearchDepthChange={setSearchDepth}
            onParse={handleParse}
          />

          {error && (
            <div style={{
              color: '#ef4444', padding: '8px 14px', background: '#1a1a28',
              border: '1px solid #7f1d1d', borderRadius: 6, margin: '6px 10px',
              fontSize: 12, flexShrink: 0,
            }}>
              ⚠ {error}
            </div>
          )}

          <div className="flow-container">
            {loading && nodes.length === 0 ? (
              <div className="loading-overlay">
                <div className="spinner" />
              </div>
            ) : nodes.length > 0 ? (
              <ReactFlowProvider>
                <FlowCanvas
                  nodes={nodes}
                  edges={edges}
                  blocks={blocks}
                  onNodeClick={handleNodeClick}
                  onNodeDoubleClick={handleNodeDoubleClick}
                  highlightedNodeId={highlightedNodeId}
                  showMinimap={showMinimap}
                  animatedEdges={animatedEdges}
                />
              </ReactFlowProvider>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">📊</div>
                <div className="empty-title">No Flow Graph Yet</div>
                <div className="empty-desc">
                  Paste Python code in the editor and click <strong>Parse</strong> to generate an interactive flowchart.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
