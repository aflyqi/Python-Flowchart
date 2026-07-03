import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import type { editor } from 'monaco-editor';
import FlowCanvas from './components/FlowCanvas';
import type { FlowNodeData } from './components/FlowCanvas';
import ControlPanel from './components/ControlPanel';
import CodeEditor, { DEFAULT_CODE } from './components/CodeEditor';
import { parseCode, parseFunction, parseProject, parseClass } from './api';
import type { FlowNode, FlowEdge, FunctionInfo, BreadcrumbItem, FlowBlock } from './types';
import { openPopout, sendToPopout, isPopout, sendToOpener, onOpenerMessage } from './popout-sync';
import './App.css';

type ViewMode = 'file' | 'function' | 'project';

// Save + restore state between hot reloads
const SAVED_KEY = 'python-flowchart-state';

function loadState() {
  try {
    const saved = sessionStorage.getItem(SAVED_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return null;
}

function saveState(state: any) {
  try {
    sessionStorage.setItem(SAVED_KEY, JSON.stringify(state));
  } catch {}
}

const App: React.FC = () => {
  // Restore session state
  const initialState = loadState();

  const [code, setCode] = useState(initialState?.code || DEFAULT_CODE);
  const [nodes, setNodes] = useState<FlowNode[]>(initialState?.nodes || []);
  const [edges, setEdges] = useState<FlowEdge[]>(initialState?.edges || []);
  const [functions, setFunctions] = useState<FunctionInfo[]>(initialState?.functions || []);
  const [selectedFunction, setSelectedFunction] = useState(initialState?.selectedFunction || '');
  const [maxDepth, setMaxDepth] = useState(initialState?.maxDepth ?? 0);
  const [viewMode, setViewMode] = useState<ViewMode>(initialState?.viewMode || 'file');
  const [projectPath, setProjectPath] = useState(initialState?.projectPath || '');
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>(initialState?.breadcrumbs || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Sync feature: default OFF
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);

  // Grouping features: default OFF
  const [structGroupsEnabled, setStructGroupsEnabled] = useState(false);
  const [chunkGroupsEnabled, setChunkGroupsEnabled] = useState(false);
  const [blocks, setBlocks] = useState<FlowBlock[]>([]);
  const [showMinimap, setShowMinimap] = useState(true);
  const [animatedEdges, setAnimatedEdges] = useState(true);
  const [autoJumpEnabled, setAutoJumpEnabled] = useState(false);
  const [searchDepth, setSearchDepth] = useState(1);
  const [leftPanelWidth, setLeftPanelWidth] = useState(420);
  const [popoutWin, setPopoutWin] = useState<Window | null>(null);
  const isPopup = isPopout();
  const popoutRef = useRef<Window | null>(null);
  popoutRef.current = popoutWin;
  const flowRef = useRef<HTMLDivElement>(null);
  const monacoRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const draggingRef = useRef(false);

  // Resize handler for left/right panels
  const handleResizeStart = useCallback(() => {
    draggingRef.current = true;
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const w = Math.max(240, Math.min(e.clientX, window.innerWidth * 0.6));
      setLeftPanelWidth(w);
    };
    const onUp = () => {
      draggingRef.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  // Refs for values read inside the cursor callback (which is captured once by Monaco)
  const syncEnabledRef = useRef(syncEnabled);
  syncEnabledRef.current = syncEnabled;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const functionsRef = useRef(functions);
  functionsRef.current = functions;
  const autoJumpRef = useRef(autoJumpEnabled);
  autoJumpRef.current = autoJumpEnabled;
  const codeRef = useRef(code);
  codeRef.current = code;
  const structGroupsRef = useRef(structGroupsEnabled);
  structGroupsRef.current = structGroupsEnabled;
  const chunkGroupsRef = useRef(chunkGroupsEnabled);
  chunkGroupsRef.current = chunkGroupsEnabled;
  const maxDepthRef = useRef(maxDepth);
  maxDepthRef.current = maxDepth;

  // Persist state (skip sync settings — they always reset to off)
  const persist = useCallback((updates: Record<string, any>) => {
    saveState({
      code, nodes, edges, functions, selectedFunction, maxDepth, viewMode,
      projectPath, breadcrumbs,
      ...updates,
    });
  }, [code, nodes, edges, functions, selectedFunction, maxDepth, viewMode, projectPath, breadcrumbs]);

  // ── Monaco editor mount ──────────────────────────────────────────────

  const handleEditorMount = useCallback((editor: editor.IStandaloneCodeEditor) => {
    monacoRef.current = editor;
  }, []);

  // ── Cursor → highlight node (Code → Flow) ────────────────────────────
  // Uses refs (not closure) because Monaco captures this callback once at mount

  const handleCursorLineChange = useCallback((line: number) => {
    // Forward to popout
    if (popoutRef.current) {
      sendToPopout(popoutRef.current, { type: 'cursorMove', line });
    }

    if (!syncEnabledRef.current && !autoJumpRef.current) return;

    // Check if line is in current view
    const match = nodesRef.current.find(n => n.data.lineNo === line);
    if (match) {
      // Case 2: node IS in current view → just center
      setHighlightedNodeId(match.id);
      return;
    }

    // Case 1: node NOT in current view → auto-jump to containing function
    if (!autoJumpRef.current) return;
    const funcs = functionsRef.current;
    let targetFn = '';
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
    if (bestMatch) targetFn = bestMatch.name;
    if (!targetFn) return;

    setLoading(true);
    parseFunction(codeRef.current, targetFn, '', maxDepthRef.current, structGroupsRef.current, chunkGroupsRef.current)
      .then(result => {
        setNodes(result.nodes);
        setEdges(result.edges);
        setBlocks(result.blocks || []);
        setSelectedFunction(targetFn);
        setViewMode('function');
        setBreadcrumbs([{ label: 'File' }, { label: targetFn, funcName: targetFn }]);
        // Highlight node in new view
        const match2 = result.nodes.find((n: FlowNode) => n.data.lineNo === line);
        setHighlightedNodeId(match2?.id ?? null);
        persist({ nodes: result.nodes, edges: result.edges, selectedFunction: targetFn, viewMode: 'function' });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // ── Single click → jump to code (Flow → Code, sync only) ──────────────

  const handleNodeClick = useCallback((_nodeId: string, nodeData: FlowNodeData) => {
    // Sync: jump to the corresponding code line
    if (syncEnabled && nodeData.lineNo && nodeData.lineNo > 0) {
      const ed = monacoRef.current;
      if (ed) {
        ed.revealLineInCenter(nodeData.lineNo);
        ed.setPosition({ lineNumber: nodeData.lineNo, column: 1 });
        ed.focus();
      }
    }
  }, [syncEnabled]);

  // ── Double click → drill-down (enter function/class/call) ──────────────

  const handleNodeDoubleClick = useCallback((_nodeId: string, nodeData: FlowNodeData) => {
    // Drill-down: if expandable function/call/class node
    if (!nodeData.expandable) return;

    // Class drill-down
    if (nodeData.isClass) {
      const className = nodeData.funcName;
      if (!className) return;
      const base = breadcrumbs.length === 0
        ? [{ label: 'File', funcName: undefined as string | undefined }]
        : breadcrumbs;
      const newBcs = [...base, { label: `class ${className}`, funcName: className }];
      setBreadcrumbs(newBcs);
      setSelectedFunction(className);
      setLoading(true);
      setHighlightedNodeId(null);
      parseClass(code, className, '', structGroupsEnabled, chunkGroupsEnabled)
        .then(result => {
          setNodes(result.nodes);
          setEdges(result.edges);
          setBlocks(result.blocks || []);
          setViewMode('function');
          persist({ nodes: result.nodes, edges: result.edges, breadcrumbs: newBcs, selectedFunction: className, viewMode: 'function' });
          setLoading(false);
        })
        .catch(e => {
          setError(e.message || 'Parse class error');
          setLoading(false);
        });
      return;
    }

    const callName = nodeData.callName || nodeData.funcName;
    if (!callName) return;

    if (functions.some(f => f.name === callName)) {
      const base = breadcrumbs.length === 0
        ? [{ label: 'File', funcName: undefined as string | undefined }]
        : breadcrumbs;
      const newBcs = [...base, { label: callName, funcName: callName }];
      setBreadcrumbs(newBcs);
      setSelectedFunction(callName);
      setLoading(true);
      setHighlightedNodeId(null);
      parseFunction(code, callName, '', maxDepth, structGroupsEnabled, chunkGroupsEnabled)
        .then(result => {
          setNodes(result.nodes);
          setEdges(result.edges);
          setBlocks(result.blocks || []);
          persist({ nodes: result.nodes, edges: result.edges, breadcrumbs: newBcs, selectedFunction: callName });
          setLoading(false);
        })
        .catch(e => {
          setError(e.message || 'Parse error');
          setLoading(false);
        });
    }
  }, [code, maxDepth, functions, breadcrumbs, structGroupsEnabled, chunkGroupsEnabled, persist]);

  // ── Parse full file ──────────────────────────────────────────────────

  const handleParseFile = useCallback(async () => {
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
      setBreadcrumbs([]);
      setViewMode('file');
      setSelectedFunction('');
      persist({ nodes: result.nodes, edges: result.edges, functions: fns, viewMode: 'file', breadcrumbs: [], selectedFunction: '' });
    } catch (e: any) {
      setError(e.message || 'Parse error');
    } finally {
      setLoading(false);
    }
  }, [code, structGroupsEnabled, chunkGroupsEnabled, persist]);

  // ── Parse specific function ──────────────────────────────────────────

  const handleParseFunction = useCallback(async (funcName?: string) => {
    const fn = funcName || selectedFunction;
    if (!fn) return;

    setLoading(true);
    setError('');
    setHighlightedNodeId(null);
    try {
      const result = await parseFunction(code, fn, '', maxDepth, structGroupsEnabled, chunkGroupsEnabled);
      setNodes(result.nodes);
      setEdges(result.edges);
      setBlocks(result.blocks || []);
      const bcs: BreadcrumbItem[] = [
        { label: 'File', funcName: undefined },
        { label: fn, funcName: fn },
      ];
      setBreadcrumbs(bcs);
      setViewMode('function');
      setSelectedFunction(fn);
      persist({ nodes: result.nodes, edges: result.edges, breadcrumbs: bcs, viewMode: 'function', selectedFunction: fn });
    } catch (e: any) {
      setError(e.message || 'Parse error');
    } finally {
      setLoading(false);
    }
  }, [code, selectedFunction, maxDepth, structGroupsEnabled, chunkGroupsEnabled, persist]);

  // ── Parse project ────────────────────────────────────────────────────

  const handleProjectLoad = useCallback(async () => {
    if (!projectPath.trim()) return;
    setLoading(true);
    setError('');
    setHighlightedNodeId(null);
    try {
      const result = await parseProject(projectPath.trim());
      setNodes(result.nodes);
      setEdges(result.edges);
      setFunctions(result.functions || []);
      setBreadcrumbs([{ label: `Project: ${projectPath.trim()}` }]);
      setViewMode('project');
      persist({
        nodes: result.nodes, edges: result.edges,
        functions: result.functions || [],
        breadcrumbs: [{ label: `Project: ${projectPath.trim()}` }],
        viewMode: 'project',
      });
    } catch (e: any) {
      setError(e.message || 'Project load error');
    } finally {
      setLoading(false);
    }
  }, [projectPath, persist]);

  // ── Breadcrumb navigation ────────────────────────────────────────────

  const handleBreadcrumbClick = useCallback((index: number) => {
    if (index >= breadcrumbs.length - 1) return;

    const newBcs = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(newBcs);
    setHighlightedNodeId(null);

    if (index === 0) {
      handleParseFile();
    } else {
      const funcName = newBcs[index].funcName;
      if (funcName) {
        setSelectedFunction(funcName);
        setLoading(true);
        parseFunction(code, funcName, '', maxDepth, structGroupsEnabled, chunkGroupsEnabled)
          .then(result => {
            setNodes(result.nodes);
            setEdges(result.edges);
            setBlocks(result.blocks || []);
            persist({ nodes: result.nodes, edges: result.edges, breadcrumbs: newBcs, selectedFunction: funcName });
            setLoading(false);
          })
          .catch(e => {
            setError(e.message || 'Parse error');
            setLoading(false);
          });
      }
    }
  }, [breadcrumbs, code, maxDepth, structGroupsEnabled, chunkGroupsEnabled, handleParseFile, persist]);

  // ── Other handlers ────────────────────────────────────────────────────

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    persist({ viewMode: mode });
    if (mode === 'file' && nodes.length === 0) {
      handleParseFile();
    }
  }, [nodes.length, handleParseFile, persist]);

  const handleSelectFunction = useCallback((name: string) => {
    setSelectedFunction(name);
    persist({ selectedFunction: name });
    if (name) {
      handleParseFunction(name);
    }
  }, [handleParseFunction, persist]);

  const handleExportPNG = useCallback(() => {
    const flowEl = document.querySelector('.react-flow__viewport') as HTMLElement;
    if (!flowEl) return;
    try {
      import('html-to-image').then(({ toPng }) => {
        toPng(flowEl, { backgroundColor: '#0d1117', pixelRatio: 2 })
          .then((dataUrl: string) => {
            const link = document.createElement('a');
            link.download = 'flowchart.png';
            link.href = dataUrl;
            link.click();
          })
          .catch((err: Error) => {
            console.error('Export failed:', err);
            alert('Export failed: ' + err.message);
          });
      }).catch(() => {
        alert('Export requires the html-to-image package.\nInstall with: npm install html-to-image');
      });
    } catch {
      alert('Export not available. Install html-to-image: npm install html-to-image');
    }
  }, []);

  // ── Popout (dual-screen) ─────────────────────────────────────────────

  const handlePopout = useCallback(() => {
    const w = openPopout((msg) => {
      if (msg.type === 'nodeClick' && msg.lineNo) {
        const ed = monacoRef.current;
        if (ed) {
          ed.revealLineInCenter(msg.lineNo);
          ed.setPosition({ lineNumber: msg.lineNo, column: 1 });
          ed.focus();
        }
      } else if (msg.type === 'toggleSync') {
        setSyncEnabled(p => !p);
      } else if (msg.type === 'toggleStruct') {
        setStructGroupsEnabled(p => !p);
      } else if (msg.type === 'toggleChunk') {
        setChunkGroupsEnabled(p => !p);
      } else if (msg.type === 'toggleMinimap') {
        setShowMinimap(p => !p);
      } else if (msg.type === 'parseFile') {
        handleParseFile();
      } else if (msg.type === 'selectFunction') {
        setSelectedFunction(msg.name);
        handleParseFunction(msg.name);
      } else if (msg.type === 'drillDown') {
        // Forward as a double-click action — call internal handler
        if (msg.isClass) {
          parseClass(code, msg.callName, '', structGroupsEnabled, chunkGroupsEnabled)
            .then(r => { setNodes(r.nodes); setEdges(r.edges); setBlocks(r.blocks || []); setBreadcrumbs([{label:'File'},{label:`class ${msg.callName}`}]); setSelectedFunction(msg.callName); setViewMode('function'); })
            .catch(e => setError(e.message));
        } else {
          parseFunction(code, msg.callName, '', maxDepth, structGroupsEnabled, chunkGroupsEnabled)
            .then(r => { setNodes(r.nodes); setEdges(r.edges); setBlocks(r.blocks || []); setBreadcrumbs(prev => prev.length ? [...prev, {label:msg.callName}] : [{label:'File'},{label:msg.callName}]); setSelectedFunction(msg.callName); })
            .catch(e => setError(e.message));
        }
      } else if (msg.type === 'breadcrumbClick') {
        handleBreadcrumbClick(msg.index);
      } else if (msg.type === 'depthChange') {
        setMaxDepth(msg.depth);
      } else if (msg.type === 'viewModeChange') {
        setViewMode(msg.mode as ViewMode);
      }
    });
    if (w) {
      setPopoutWin(w);
      // Send initial UI state immediately
      sendToPopout(w, { type: 'uiState', syncEnabled, structGroupsEnabled, chunkGroupsEnabled, showMinimap, highlightedNodeId, code, functions, viewMode, selectedFunction, breadcrumbs, maxDepth });
      sendToPopout(w, { type: 'graphState', nodes, edges, blocks });
    }
  }, [syncEnabled, structGroupsEnabled, chunkGroupsEnabled, showMinimap, highlightedNodeId, nodes, edges, blocks]);

  // Send graph + UI state to popout on every change
  const uiStateRef = useRef({ syncEnabled, structGroupsEnabled, chunkGroupsEnabled, showMinimap, highlightedNodeId, code, functions, viewMode, selectedFunction, breadcrumbs, maxDepth });
  uiStateRef.current = { syncEnabled, structGroupsEnabled, chunkGroupsEnabled, showMinimap, highlightedNodeId, code, functions, viewMode, selectedFunction, breadcrumbs, maxDepth };
  useEffect(() => {
    if (!popoutWin) return;
    sendToPopout(popoutWin, { type: 'graphState', nodes, edges, blocks });
    sendToPopout(popoutWin, { type: 'uiState', ...uiStateRef.current });
  }, [nodes, edges, blocks, syncEnabled, structGroupsEnabled, chunkGroupsEnabled, showMinimap, highlightedNodeId, code, functions, viewMode, selectedFunction, breadcrumbs, maxDepth, popoutWin]);

  // In popout window: receive graph state + ui state + cursor moves
  const [popSyncEnabled, setPopSyncEnabled] = useState(false);
  const [popStructGroups, setPopStructGroups] = useState(false);
  const [popChunkGroups, setPopChunkGroups] = useState(false);
  const [popShowMinimap, setPopShowMinimap] = useState(true);

  useEffect(() => {
    if (!isPopup) return;
    return onOpenerMessage((msg) => {
      if (msg.type === 'graphState') {
        setNodes((msg.nodes as FlowNode[]) || []);
        setEdges((msg.edges as FlowEdge[]) || []);
        setBlocks((msg.blocks as FlowBlock[]) || []);
      } else if (msg.type === 'uiState') {
        setPopSyncEnabled(msg.syncEnabled);
        setPopStructGroups(msg.structGroupsEnabled);
        setPopChunkGroups(msg.chunkGroupsEnabled);
        setPopShowMinimap(msg.showMinimap);
        setHighlightedNodeId(msg.highlightedNodeId);
        setCode(msg.code || '');
        setFunctions((msg.functions as FunctionInfo[]) || []);
        setViewMode((msg.viewMode as ViewMode) || 'file');
        setSelectedFunction(msg.selectedFunction || '');
        setBreadcrumbs((msg.breadcrumbs as BreadcrumbItem[]) || []);
        setMaxDepth(msg.maxDepth || 0);
      } else if (msg.type === 'cursorMove') {
        const line = msg.line;
        setHighlightedNodeId(prev => {
          const match = nodes.find(n => n.data.lineNo === line);
          return match?.id ?? prev;
        });
      }
    });
  }, [isPopup, nodes]);

  // Popout node click: only forward if sync is enabled in popout
  const handlePopoutNodeClick = useCallback((_id: string, data: FlowNodeData) => {
    if (!popSyncEnabled) return;
    if (data.lineNo) sendToOpener({ type: 'nodeClick', lineNo: data.lineNo });
  }, [popSyncEnabled]);

  // Popout toggle callbacks: send action to main window
  const popToggleSync = useCallback(() => sendToOpener({ type: 'toggleSync' }), []);
  const popToggleStruct = useCallback(() => sendToOpener({ type: 'toggleStruct' }), []);
  const popToggleChunk = useCallback(() => sendToOpener({ type: 'toggleChunk' }), []);
  const popToggleMinimap = useCallback(() => sendToOpener({ type: 'toggleMinimap' }), []);
  const popParseFile = useCallback(() => sendToOpener({ type: 'parseFile' }), []);
  const popSelectFunction = useCallback((fn: string) => sendToOpener({ type: 'selectFunction', name: fn }), []);
  const popDepthChange = useCallback((d: number) => sendToOpener({ type: 'depthChange', depth: d }), []);
  const popViewModeChange = useCallback((m: string) => sendToOpener({ type: 'viewModeChange', mode: m }), []);
  const popBreadcrumbClick = useCallback((i: number) => sendToOpener({ type: 'breadcrumbClick', index: i }), []);
  const popDrillDown = useCallback((callName: string, isClass?: boolean) => sendToOpener({ type: 'drillDown', callName, isClass }), []);

  const handleCodeChange = useCallback((newCode: string) => {
    setCode(newCode);
    persist({ code: newCode });
  }, [persist]);

  const handleSyncToggle = useCallback(() => {
    setSyncEnabled(prev => {
      if (prev) {
        // Turning off: clear highlight
        setHighlightedNodeId(null);
      }
      return !prev;
    });
  }, []);

  // ── Render ────────────────────────────────────────────────────────────

  // ── Popout-only render ──────────────────────────────────────────────
  if (isPopup) {
    return (
      <div className="app-container">
        <div className="app-body" style={{ height: '100%' }}>
          <div className="panel panel-right" style={{ width: '100%' }}>
            <ControlPanel
              functions={functions}
              selectedFunction={selectedFunction}
              onSelectFunction={popSelectFunction}
              maxDepth={maxDepth}
              onDepthChange={popDepthChange}
              viewMode={viewMode}
              onViewModeChange={popViewModeChange}
              projectPath={projectPath}
              onProjectPathChange={setProjectPath}
              onProjectLoad={handleProjectLoad}
              breadcrumbs={breadcrumbs}
              onBreadcrumbClick={popBreadcrumbClick}
              onExportPNG={handleExportPNG}
              loading={loading}
              syncEnabled={popSyncEnabled}
              onSyncToggle={popToggleSync}
              structGroupsEnabled={popStructGroups}
              onStructGroupsToggle={popToggleStruct}
              chunkGroupsEnabled={popChunkGroups}
              onChunkGroupsToggle={popToggleChunk}
              showMinimap={popShowMinimap}
              onMinimapToggle={popToggleMinimap}
              isPopup={true}
            />
            {error && (
              <div className="flow-error" style={{
                color: '#f85149', padding: '10px 16px', background: '#2d1216',
                border: '1px solid #da3633', borderRadius: 6, margin: '0 10px 10px',
                fontSize: 12, flexShrink: 0,
              }}>
                ⚠ {error}
              </div>
            )}
            <div className="flow-container" ref={flowRef} style={{ flex: 1 }}>
              {nodes.length > 0 ? (
                <ReactFlowProvider>
                  <FlowCanvas
                    key={`${selectedFunction || 'file'}-${viewMode}`}
                    nodes={nodes}
                    edges={edges}
                    blocks={blocks}
                    onNodeClick={handlePopoutNodeClick}
                    onNodeDoubleClick={handleNodeDoubleClick}
                    highlightedNodeId={highlightedNodeId}
                    showMinimap={showMinimap}
                  />
                </ReactFlowProvider>
              ) : (
                <div className="empty-state" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e' }}>
                  <div className="empty-icon">📊</div>
                  <div className="empty-title">No flow graph yet</div>
                  <div className="empty-desc">Parse code in the main window to generate a flowchart.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Detect popout window closed
  useEffect(() => {
    if (!popoutWin) return;
    const timer = setInterval(() => {
      if (popoutWin.closed) setPopoutWin(null);
    }, 500);
    return () => clearInterval(timer);
  }, [popoutWin]);

  // ── Full render (main window) ────────────────────────────────────────

  return (
    <div className="app-container">
      <div className="app-header">
        <div className="app-title">
          Python Flowchart <span>| Visualize code as interactive flow graphs</span>
        </div>
      </div>

      <div className="app-body">
        {/* Left panel: code editor — full width if popout is open */}
        <div className="panel panel-left" style={popoutWin ? { width: '100%', borderRight: 'none' } : { width: leftPanelWidth, minWidth: 240, flexShrink: 0 }}>
          <CodeEditor
            value={code}
            onChange={handleCodeChange}
            onParse={viewMode === 'function' && selectedFunction
              ? () => handleParseFunction()
              : handleParseFile}
            loading={loading}
            onCursorLineChange={handleCursorLineChange}
            onEditorMount={handleEditorMount}
          />
        </div>

        {!popoutWin && (
          <>
        {/* Resize handle */}
        <div
          onMouseDown={handleResizeStart}
          style={{
            width: 6, cursor: 'col-resize', background: 'transparent',
            flexShrink: 0, position: 'relative', zIndex: 5,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#30363d')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            width: 2, height: 40, background: '#484f58', borderRadius: 1,
          }} />
        </div>

        {/* Right panel: flowchart */}
        <div className="panel panel-right">
          <ControlPanel
            functions={functions}
            selectedFunction={selectedFunction}
            onSelectFunction={handleSelectFunction}
            maxDepth={maxDepth}
            onDepthChange={(d) => { setMaxDepth(d); persist({ maxDepth: d }); }}
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
            projectPath={projectPath}
            onProjectPathChange={setProjectPath}
            onProjectLoad={handleProjectLoad}
            breadcrumbs={breadcrumbs}
            onBreadcrumbClick={handleBreadcrumbClick}
            onExportPNG={handleExportPNG}
            loading={loading}
            syncEnabled={syncEnabled}
            onSyncToggle={handleSyncToggle}
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
            onPopout={handlePopout}
          />

          {error && (
            <div style={{
              margin: '8px 14px',
              padding: '8px 14px',
              background: '#3a1010',
              border: '1px solid #f44336',
              borderRadius: 6,
              color: '#f44336',
              fontSize: 13,
              fontFamily: 'monospace',
            }}>
              ⚠ {error}
            </div>
          )}

          <div className="flow-container" ref={flowRef}>
            {nodes.length > 0 ? (
              <ReactFlowProvider>
                <FlowCanvas
                  key={`${selectedFunction || 'file'}-${viewMode}`}
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
                <div className="empty-title">No flow graph yet</div>
                <div className="empty-desc">
                  Paste Python code on the left and click <strong>Parse</strong> to generate a flowchart.
                  <br />
                  You can also press <strong>Ctrl+Enter</strong> in the editor.
                </div>
                <div className="empty-hints">
                  <div className="hint">📄 <strong>File</strong> — View all top-level functions</div>
                  <div className="hint">⚡ <strong>Function</strong> — View internal flow of one function</div>
                  <div className="hint">📁 <strong>Project</strong> — View cross-file call graph</div>
                  <div className="hint">🖱️ Click <span style={{ color: '#ce93d8' }}>purple nodes</span> to drill into called functions</div>
                  <div className="hint">🔗 <strong>Sync</strong> — Toggle on to link code ↔ flow bidirectionally</div>
                </div>
              </div>
            )}
          </div>
        </div>
          </>
        )}
      </div>
    </div>
  );
};

export default App;
