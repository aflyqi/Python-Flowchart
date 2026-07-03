import React from 'react';
import type { FunctionInfo, BreadcrumbItem } from '../types';

interface ControlPanelProps {
  functions: FunctionInfo[];
  selectedFunction: string;
  onSelectFunction: (name: string) => void;
  maxDepth: number;
  onDepthChange: (depth: number) => void;
  viewMode: 'file' | 'function' | 'project';
  onViewModeChange: (mode: 'file' | 'function' | 'project') => void;
  projectPath: string;
  onProjectPathChange: (path: string) => void;
  onProjectLoad: () => void;
  breadcrumbs: BreadcrumbItem[];
  onBreadcrumbClick: (index: number) => void;
  onExportPNG: () => void;
  loading: boolean;
  syncEnabled: boolean;
  onSyncToggle: () => void;
  structGroupsEnabled: boolean;
  onStructGroupsToggle: () => void;
  chunkGroupsEnabled: boolean;
  onChunkGroupsToggle: () => void;
  showMinimap: boolean;
  onMinimapToggle: () => void;
  onPopout?: () => void;
  isPopup?: boolean;
  animatedEdges?: boolean;
  onAnimatedEdgesToggle?: () => void;
  autoJumpEnabled?: boolean;
  onAutoJumpToggle?: () => void;
  searchDepth?: number;
  onSearchDepthChange?: (d: number) => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  functions,
  selectedFunction,
  onSelectFunction,
  maxDepth,
  onDepthChange,
  viewMode,
  onViewModeChange,
  projectPath,
  onProjectPathChange,
  onProjectLoad,
  breadcrumbs,
  onBreadcrumbClick,
  onExportPNG,
  loading,
  syncEnabled,
  onSyncToggle,
  structGroupsEnabled,
  onStructGroupsToggle,
  chunkGroupsEnabled,
  onChunkGroupsToggle,
  showMinimap,
  onMinimapToggle,
  onPopout,
  isPopup,
  animatedEdges,
  onAnimatedEdgesToggle,
  autoJumpEnabled,
  onAutoJumpToggle,
  searchDepth,
  onSearchDepthChange,
}) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      padding: '10px 14px',
      background: '#161b22',
      borderBottom: '1px solid #21262d',
    }}>
      {/* View mode tabs */}
      <div style={{
        display: 'flex',
        gap: 4,
        background: '#0d1117',
        borderRadius: 8,
        padding: 3,
        width: 'fit-content',
      }}>
        {(['file', 'function', 'project'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => onViewModeChange(mode)}
            style={{
              background: viewMode === mode ? '#238636' : 'transparent',
              color: viewMode === mode ? '#fff' : '#8b949e',
              border: 'none',
              borderRadius: 6,
              padding: '5px 14px',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'capitalize',
              transition: 'all 0.15s',
            }}
          >
            {mode === 'file' && '📄 File'}
            {mode === 'function' && '⚡ Function'}
            {mode === 'project' && '📁 Project'}
          </button>
        ))}
      </div>

      {/* Breadcrumb for drill-down */}
      {breadcrumbs.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 12,
          color: '#8b949e',
          flexWrap: 'wrap',
        }}>
          <span style={{ color: '#484f58' }}>📍</span>
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span style={{ color: '#30363d' }}>›</span>}
              <span
                onClick={() => onBreadcrumbClick(i)}
                style={{
                  color: i === breadcrumbs.length - 1 ? '#58a6ff' : '#8b949e',
                  cursor: i < breadcrumbs.length - 1 ? 'pointer' : 'default',
                  textDecoration: i < breadcrumbs.length - 1 ? 'underline' : 'none',
                  fontWeight: i === breadcrumbs.length - 1 ? 600 : 400,
                }}
              >
                {crumb.label}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Function selector (in function mode) */}
      {viewMode === 'function' && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ color: '#8b949e', fontSize: 12, fontWeight: 600 }}>
              Function:
            </label>
            <select
              value={selectedFunction}
              onChange={(e) => onSelectFunction(e.target.value)}
              style={{
                background: '#0d1117',
                color: '#c9d1d9',
                border: '1px solid #30363d',
                borderRadius: 6,
                padding: '5px 10px',
                fontSize: 12,
                fontFamily: 'monospace',
                minWidth: 200,
                cursor: 'pointer',
              }}
            >
              <option value="">-- Select function --</option>
              {functions.map(fn => (
                <option key={fn.name} value={fn.name}>
                  {fn.name} (L{fn.lineno})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ color: '#8b949e', fontSize: 12, fontWeight: 600 }}>
              Depth:
            </label>
            <input
              type="range"
              min={0}
              max={5}
              value={maxDepth}
              onChange={(e) => onDepthChange(Number(e.target.value))}
              style={{
                width: 80,
                accentColor: '#238636',
              }}
            />
            <span style={{
              color: '#58a6ff',
              fontSize: 12,
              fontWeight: 600,
              minWidth: 16,
              textAlign: 'center',
            }}>
              {maxDepth}
            </span>
            <span style={{ color: '#484f58', fontSize: 11 }}>
              levels deep
            </span>
          </div>
        </div>
      )}

      {/* Project path input */}
      {viewMode === 'project' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ color: '#8b949e', fontSize: 12, fontWeight: 600 }}>
            Directory:
          </label>
          <input
            type="text"
            value={projectPath}
            onChange={(e) => onProjectPathChange(e.target.value)}
            placeholder="/path/to/python/project"
            style={{
              background: '#0d1117',
              color: '#c9d1d9',
              border: '1px solid #30363d',
              borderRadius: 6,
              padding: '5px 10px',
              fontSize: 12,
              fontFamily: 'monospace',
              flex: 1,
              maxWidth: 400,
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onProjectLoad();
            }}
          />
          <button
            onClick={onProjectLoad}
            disabled={loading}
            style={{
              background: '#238636',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '5px 14px',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Load
          </button>
        </div>
      )}

      {/* Export + Sync buttons */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={onExportPNG}
          style={{
            background: '#21262d',
            color: '#c9d1d9',
            border: '1px solid #30363d',
            borderRadius: 6,
            padding: '4px 12px',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          📸 Export PNG
        </button>

        {onPopout && !isPopup && (
          <button
            onClick={onPopout}
            title="Open flowchart in a separate window for dual-screen use"
            style={{
              background: '#21262d',
              color: '#c9d1d9',
              border: '1px solid #30363d',
              borderRadius: 6,
              padding: '4px 12px',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            ⇱ Popout
          </button>
        )}

        <div style={{ width: 1, height: 20, background: '#30363d' }} />

        <label
          title="Bidirectional code↔flow sync: click node → jump to code line; select code → highlight node"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <span
            onClick={onSyncToggle}
            style={{
              width: 32,
              height: 18,
              borderRadius: 9,
              background: syncEnabled ? '#238636' : '#30363d',
              position: 'relative',
              transition: 'background 0.2s',
              flexShrink: 0,
            }}
          >
            <span style={{
              position: 'absolute',
              top: 2,
              left: syncEnabled ? 16 : 2,
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.2s',
            }} />
          </span>
          <span style={{
            color: syncEnabled ? '#58a6ff' : '#484f58',
            fontSize: 11,
            fontWeight: 600,
          }}>
            🔗 Sync
          </span>
        </label>

        {/* Struct Groups toggle */}
        <label
          title="Wrap while/for/if/try bodies in colored background boxes"
          style={{
            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none',
          }}
        >
          <span
            onClick={onStructGroupsToggle}
            style={{
              width: 32, height: 18, borderRadius: 9,
              background: structGroupsEnabled ? '#238636' : '#30363d',
              position: 'relative', transition: 'background 0.2s', flexShrink: 0,
            }}
          >
            <span style={{
              position: 'absolute', top: 2, left: structGroupsEnabled ? 16 : 2,
              width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
            }} />
          </span>
          <span style={{ color: structGroupsEnabled ? '#58a6ff' : '#484f58', fontSize: 11, fontWeight: 600 }}>
            ▦ Struct
          </span>
        </label>

        {/* Chunk Groups toggle */}
        <label
          title="Group consecutive assignments (init) and imports into colored boxes"
          style={{
            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none',
          }}
        >
          <span
            onClick={onChunkGroupsToggle}
            style={{
              width: 32, height: 18, borderRadius: 9,
              background: chunkGroupsEnabled ? '#238636' : '#30363d',
              position: 'relative', transition: 'background 0.2s', flexShrink: 0,
            }}
          >
            <span style={{
              position: 'absolute', top: 2, left: chunkGroupsEnabled ? 16 : 2,
              width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
            }} />
          </span>
          <span style={{ color: chunkGroupsEnabled ? '#58a6ff' : '#484f58', fontSize: 11, fontWeight: 600 }}>
            📦 Chunks
          </span>
        </label>

        {/* Minimap toggle */}
        <label
          title="Show/hide the minimap in the bottom-right corner"
          style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}
        >
          <span onClick={onMinimapToggle} style={{
            width: 32, height: 18, borderRadius: 9,
            background: showMinimap ? '#238636' : '#30363d',
            position: 'relative', transition: 'background 0.2s', flexShrink: 0,
          }}>
            <span style={{
              position: 'absolute', top: 2, left: showMinimap ? 16 : 2,
              width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
            }} />
          </span>
          <span style={{ color: showMinimap ? '#58a6ff' : '#484f58', fontSize: 11, fontWeight: 600 }}>
            🗺️ Map
          </span>
        </label>

        {/* Animated edges toggle */}
        {onAnimatedEdgesToggle !== undefined && (
          <label
            title="Animate loop-back edges (dashed/marching ants). Turn off for performance on large graphs."
            style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}
          >
            <span onClick={onAnimatedEdgesToggle} style={{
              width: 32, height: 18, borderRadius: 9,
              background: animatedEdges ? '#238636' : '#30363d',
              position: 'relative', transition: 'background 0.2s', flexShrink: 0,
            }}>
              <span style={{
                position: 'absolute', top: 2, left: animatedEdges ? 16 : 2,
                width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
              }} />
            </span>
            <span style={{ color: animatedEdges ? '#58a6ff' : '#484f58', fontSize: 11, fontWeight: 600 }}>
              🐜 Anim
            </span>
          </label>
        )}

        {/* Auto-jump toggle */}
        {onAutoJumpToggle !== undefined && (
          <label
            title="Auto-jump to function when clicking code outside current view"
            style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}
          >
            <span onClick={onAutoJumpToggle} style={{
              width: 32, height: 18, borderRadius: 9,
              background: autoJumpEnabled ? '#db6d00' : '#30363d',
              position: 'relative', transition: 'background 0.2s', flexShrink: 0,
            }}>
              <span style={{
                position: 'absolute', top: 2, left: autoJumpEnabled ? 16 : 2,
                width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
              }} />
            </span>
            <span style={{ color: autoJumpEnabled ? '#ff8a65' : '#484f58', fontSize: 11, fontWeight: 600 }}>
              ⏩ Jump
            </span>
          </label>
        )}
        {onAutoJumpToggle !== undefined && onSearchDepthChange !== undefined && autoJumpEnabled && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 2 }}>
            <span style={{ color: '#8b949e', fontSize: 10 }}>Depth</span>
            <button onClick={() => onSearchDepthChange(Math.max(1, (searchDepth || 1) - 1))}
              style={{ background: '#21262d', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 4, width: 20, height: 20, cursor: 'pointer', fontSize: 11, lineHeight: 1, padding: 0 }}>−</button>
            <input
              type="number"
              min={1} max={10}
              value={searchDepth || 1}
              onChange={(e) => { const v = parseInt(e.target.value) || 1; onSearchDepthChange(Math.max(1, Math.min(10, v))); }}
              style={{ width: 28, background: '#0d1117', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 4, textAlign: 'center', fontSize: 11, padding: '1px 0', height: 20 }}
            />
            <button onClick={() => onSearchDepthChange(Math.min(10, (searchDepth || 1) + 1))}
              style={{ background: '#21262d', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 4, width: 20, height: 20, cursor: 'pointer', fontSize: 11, lineHeight: 1, padding: 0 }}>+</button>
          </span>
        )}
      </div>
    </div>
  );
};

export default ControlPanel;
