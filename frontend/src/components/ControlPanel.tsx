import React from 'react';
import type { FunctionInfo, BreadcrumbItem, ViewMode } from '../types';

interface ControlPanelProps {
  functions: FunctionInfo[];
  selectedFunction: string;
  onSelectFunction: (name: string) => void;
  maxDepth: number;
  onDepthChange: (d: number) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  breadcrumbs: BreadcrumbItem[];
  onBreadcrumbClick: (index: number) => void;
  onExportPNG: () => void;
  onPopout?: () => void;
  loading: boolean;
  syncEnabled: boolean;
  onSyncToggle: () => void;
  structGroupsEnabled: boolean;
  onStructGroupsToggle: () => void;
  chunkGroupsEnabled: boolean;
  onChunkGroupsToggle: () => void;
  showMinimap: boolean;
  onMinimapToggle: () => void;
  animatedEdges: boolean;
  onAnimatedEdgesToggle: () => void;
  autoJumpEnabled?: boolean;
  onAutoJumpToggle?: () => void;
  searchDepth?: number;
  onSearchDepthChange?: (d: number) => void;
  isPopup?: boolean;
  onParse: () => void;
  onProjectLoad?: () => void;
  code?: string;
  onCodeChange?: (code: string) => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  functions, selectedFunction, onSelectFunction,
  maxDepth, onDepthChange, viewMode, onViewModeChange,
  breadcrumbs, onBreadcrumbClick, onExportPNG,
  onPopout, loading,
  syncEnabled, onSyncToggle,
  structGroupsEnabled, onStructGroupsToggle,
  chunkGroupsEnabled, onChunkGroupsToggle,
  showMinimap, onMinimapToggle,
  animatedEdges, onAnimatedEdgesToggle,
  autoJumpEnabled, onAutoJumpToggle,
  searchDepth, onSearchDepthChange,
  isPopup, onParse,
}) => {
  const td = (label: string, desc: string) => (
    <span
      className="toggle"
      title={desc}
    >
      <span className="toggle-track" style={{ background: '#30363d' }}>
        <span className="toggle-thumb" style={{ left: 2 }} />
      </span>
      <span className="toggle-label" style={{ color: '#484f58' }}>{label}</span>
    </span>
  );

  const toggleSwitch = (
    enabled: boolean,
    onToggle: () => void,
    label: string,
    activeColor: string,
    title: string,
  ) => (
    <label className="toggle" title={title}
      onClick={(e) => { e.preventDefault(); onToggle(); }}
    >
      <span className="toggle-track" style={{ background: enabled ? activeColor : '#30363d' }}>
        <span className="toggle-thumb" style={{ left: enabled ? 16 : 2 }} />
      </span>
      <span className="toggle-label" style={{ color: enabled ? activeColor : '#484f58' }}>{label}</span>
    </label>
  );

  return (
    <div className="control-panel">
      <div className="control-top">
        {/* View Mode Tabs */}
        <div style={{ display: 'flex', gap: 2, background: '#1a1a28', borderRadius: 6, padding: 2 }}>
          {(['file', 'function', 'project'] as ViewMode[]).map(m => (
            <button
              key={m}
              className={`btn ${viewMode === m ? 'btn-primary' : ''}`}
              style={{ padding: '3px 10px', fontSize: 11, textTransform: 'capitalize' }}
              onClick={() => onViewModeChange(m)}
            >
              {m === 'file' ? '📄' : m === 'function' ? '⚡' : '📁'} {m}
            </button>
          ))}
        </div>

        <div className="control-divider" />

        {/* Function Select */}
        <select
          className="fn-select"
          value={selectedFunction}
          onChange={(e) => onSelectFunction(e.target.value)}
        >
          <option value="">— Functions —</option>
          {functions.map(fn => (
            <option key={fn.name} value={fn.name}>{fn.name}</option>
          ))}
        </select>

        {viewMode === 'file' && (
          <>
            <div className="control-divider" />
            {/* Depth */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: '#686880' }}>Depth</span>
              <button className="num-btn" onClick={() => onDepthChange(Math.max(0, maxDepth - 1))}>−</button>
              <input
                type="number" min={0} max={5}
                value={maxDepth}
                onChange={(e) => onDepthChange(Math.max(0, Math.min(5, parseInt(e.target.value) || 0)))}
                className="num-input"
                style={{ width: 24 }}
              />
              <button className="num-btn" onClick={() => onDepthChange(Math.min(5, maxDepth + 1))}>+</button>
            </div>
          </>
        )}

        {/* Breadcrumbs */}
        {breadcrumbs.length > 1 && (
          <>
            <div className="control-divider" />
            <div className="breadcrumb">
              {breadcrumbs.map((cr, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="breadcrumb-sep">›</span>}
                  <span
                    className={`breadcrumb-item ${i === breadcrumbs.length - 1 ? 'active' : ''}`}
                    onClick={() => onBreadcrumbClick(i)}
                  >
                    {cr.label}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="control-bottom">
        <button className="btn btn-primary" onClick={onParse} disabled={loading}>
          {loading ? '⟳ Parsing...' : '▶ Parse'}
        </button>

        <button className="btn" onClick={onExportPNG}>
          📸 Export
        </button>

        {onPopout && !isPopup && (
          <button className="btn" onClick={onPopout}>
            ⇱ Popout
          </button>
        )}

        <div className="control-divider" />

        {toggleSwitch(syncEnabled, onSyncToggle, 'Sync', '#6c6cf0',
          'Bidirectional code↔flow sync')}

        {toggleSwitch(structGroupsEnabled, onStructGroupsToggle, 'Struct', '#818cf8',
          'Structure group boxes')}

        {toggleSwitch(chunkGroupsEnabled, onChunkGroupsToggle, 'Chunk', '#22d3ee',
          'Chunk grouping')}

        {toggleSwitch(showMinimap, onMinimapToggle, 'Map', '#22c55e',
          'Show/hide minimap')}

        {toggleSwitch(animatedEdges, onAnimatedEdgesToggle, 'Anim', '#06b6d4',
          'Animated loop edges')}

        {onAutoJumpToggle && (
          <>
            <div className="control-divider" />
            {toggleSwitch(autoJumpEnabled || false, onAutoJumpToggle, 'Jump', '#f97316',
              'Auto-jump to function when clicking code outside current view')}
            {autoJumpEnabled && onSearchDepthChange && (
              <div className="num-input-group">
                <span style={{ fontSize: 10, color: '#686880' }}>Depth</span>
                <button className="num-btn" onClick={() => onSearchDepthChange(Math.max(1, (searchDepth || 1) - 1))}>−</button>
                <input
                  type="number" min={1} max={10}
                  value={searchDepth || 1}
                  onChange={(e) => onSearchDepthChange(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                  className="num-input"
                />
                <button className="num-btn" onClick={() => onSearchDepthChange(Math.min(10, (searchDepth || 1) + 1))}>+</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ControlPanel;
