import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { FlowNodeData } from '../types';

// Helper to safely extract FlowNodeData from React Flow's unknown data
function useData(data: unknown): FlowNodeData {
  return (data ?? { label: '', nodeType: 'statement' }) as FlowNodeData;
}

const NODE_STYLES: Record<string, { bg: string; border: string; icon: string }> = {
  entry:       { bg: '#1a1a2e', border: '#4fc3f7', icon: '▶' },
  exit:        { bg: '#1a1a2e', border: '#81c784', icon: '⏹' },
  condition:   { bg: '#1a1a2e', border: '#ffb74d', icon: '◇' },
  loop:        { bg: '#1a1a2e', border: '#4dd0e1', icon: '↻' },
  statement:   { bg: '#1a1a2e', border: '#78909c', icon: '·' },
  call:        { bg: '#1a1a2e', border: '#ce93d8', icon: '→' },
  function:    { bg: '#1a1a2e', border: '#64b5f6', icon: 'ƒ' },
  try:         { bg: '#1a1a2e', border: '#ef5350', icon: '⚠' },
  except:      { bg: '#1a1a2e', border: '#ff7043', icon: '✕' },
  error:       { bg: '#2a1010', border: '#f44336', icon: '!' },
};

interface BaseNodeProps {
  id: string;
  data: FlowNodeData;
  children?: React.ReactNode;
  minWidth?: number;
}

function BaseNode({ id, data, children, minWidth = 120 }: BaseNodeProps) {
  const style = NODE_STYLES[data.nodeType] || NODE_STYLES.statement;

  return (
    <div
      style={{
        background: style.bg,
        border: `2px solid ${style.border}`,
        borderRadius: data.nodeType === 'condition' ? '2px' : '8px',
        padding: '8px 14px',
        minWidth,
        maxWidth: 320,
        color: '#e0e0e0',
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap',
        position: 'relative',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: style.border, width: 8, height: 8, border: 'none' }}
      />
      {children || (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <span style={{ color: style.border, flexShrink: 0, fontSize: 14 }}>
            {style.icon}
          </span>
          <span style={{ flex: 1, lineHeight: 1.5 }}>{data.label}</span>
        </div>
      )}
      {(data.lineNo ?? 0) > 0 && (
        <div style={{
          position: 'absolute', top: 2, right: 6,
          fontSize: 10, color: '#666',
        }}>
          L{data.lineNo}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: style.border, width: 8, height: 8, border: 'none' }}
      />
    </div>
  );
}

// ── Entry Node (function signature) ──────────────────────────────────

export const EntryNode = memo(({ id, data }: NodeProps) => {
  const d = useData(data);
  return (
    <BaseNode id={id} data={d} minWidth={180}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{
          background: '#4fc3f7', color: '#1a1a2e', borderRadius: 4,
          padding: '2px 6px', fontSize: 11, fontWeight: 700, flexShrink: 0,
        }}>
          ENTRY
        </span>
        <span style={{ flex: 1, lineHeight: 1.5, fontWeight: 600 }}>
          {d.label}
        </span>
      </div>
    </BaseNode>
  );
});

// ── Exit Node ────────────────────────────────────────────────────────

export const ExitNode = memo(({ id, data }: NodeProps) => {
  const d = useData(data);
  return (
    <BaseNode id={id} data={d}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: '#81c784', fontSize: 12 }}>↩</span>
        <span style={{ color: '#81c784', fontStyle: 'italic' }}>{d.label}</span>
      </div>
    </BaseNode>
  );
});

// ── Condition Node (if/elif) ─────────────────────────────────────────

export const ConditionNode = memo(({ id, data }: NodeProps) => {
  const d = useData(data);
  return (
    <BaseNode id={id} data={d} minWidth={160}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: '#ffb74d', fontSize: 16, flexShrink: 0 }}>◇</span>
        <span style={{ flex: 1, lineHeight: 1.5, color: '#ffb74d' }}>
          {d.label}
        </span>
      </div>
    </BaseNode>
  );
});

// ── Loop Node ────────────────────────────────────────────────────────

const LoopNode = memo(({ id, data }: NodeProps) => {
  const d = useData(data);
  return (
    <BaseNode id={id} data={d} minWidth={160}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: '#4dd0e1', fontSize: 15, flexShrink: 0 }}>↻</span>
        <span style={{ flex: 1, lineHeight: 1.5, color: '#4dd0e1' }}>
          {d.label}
        </span>
      </div>
    </BaseNode>
  );
});

// ── Statement Node ───────────────────────────────────────────────────

const StatementNode = memo(({ id, data }: NodeProps) => {
  const d = useData(data);
  return (
    <BaseNode id={id} data={d} minWidth={140}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: '#78909c', fontSize: 10, flexShrink: 0 }}>▸</span>
        <span style={{ flex: 1, lineHeight: 1.5 }}>{d.label}</span>
      </div>
    </BaseNode>
  );
});

// ── Call Node (function call) ────────────────────────────────────────

const CallNode = memo(({ id, data }: NodeProps) => {
  const d = useData(data);
  return (
    <BaseNode id={id} data={d} minWidth={140}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: '#ce93d8', fontSize: 13, flexShrink: 0 }}>→</span>
        <span style={{ flex: 1, lineHeight: 1.5, color: '#ce93d8' }}>
          {d.label}
        </span>
        {d.expandable && (
          <span style={{
            background: '#ce93d8', color: '#1a1a2e', borderRadius: 3,
            padding: '1px 5px', fontSize: 10, fontWeight: 600,
            cursor: 'pointer',
          }}>
            +
          </span>
        )}
      </div>
    </BaseNode>
  );
});

// ── Function Node (for project/file view) ────────────────────────────

const FunctionNode = memo(({ id, data }: NodeProps) => {
  const d = useData(data);
  return (
    <BaseNode id={id} data={d} minWidth={150}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: '#64b5f6', fontSize: 13 }}>ƒ</span>
        <div>
          <div style={{ fontWeight: 600, lineHeight: 1.4 }}>{d.label}</div>
          {d.filepath && (
            <div style={{ fontSize: 10, color: '#666', lineHeight: 1.2 }}>
              {d.filepath as string}
            </div>
          )}
        </div>
      </div>
    </BaseNode>
  );
});

// ── Try/Except Nodes ─────────────────────────────────────────────────

const TryNode = memo(({ id, data }: NodeProps) => {
  const d = useData(data);
  return (
    <BaseNode id={id} data={d} minWidth={100}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: '#ef5350', fontSize: 13 }}>⚠</span>
        <span style={{ fontWeight: 600, color: '#ef5350' }}>try</span>
      </div>
    </BaseNode>
  );
});

const ExceptNode = memo(({ id, data }: NodeProps) => {
  const d = useData(data);
  return (
    <BaseNode id={id} data={d} minWidth={160}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: '#ff7043', fontSize: 13 }}>✕</span>
        <span style={{ lineHeight: 1.5, color: '#ff7043' }}>{d.label}</span>
      </div>
    </BaseNode>
  );
});

// ── Error Node ────────────────────────────────────────────────────────

const ErrorNode = memo(({ data }: NodeProps) => {
  const d = useData(data);
  return (
    <div style={{
      background: '#3a1010',
      border: '2px solid #f44336',
      borderRadius: 8,
      padding: '10px 16px',
      maxWidth: 300,
      color: '#f44336',
      fontSize: 13,
      fontFamily: 'monospace',
      boxShadow: '0 2px 8px rgba(244,67,54,0.3)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>⚠</span>
        <span>{d.label}</span>
      </div>
    </div>
  );
});

// ── Break / Continue Nodes ──────────────────────────────────────────

const BreakNode = memo(({ id, data }: NodeProps) => {
  const d = useData(data);
  return (
    <BaseNode id={id} data={{ ...d, nodeType: 'break' }} minWidth={80}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: '#ff8a65', fontSize: 13, flexShrink: 0 }}>⏹</span>
        <span style={{ flex: 1, lineHeight: 1.5, color: '#ff8a65', fontWeight: 600 }}>break</span>
      </div>
    </BaseNode>
  );
});

const ContinueNode = memo(({ id, data }: NodeProps) => {
  const d = useData(data);
  return (
    <BaseNode id={id} data={{ ...d, nodeType: 'continue' }} minWidth={80}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: '#ffcc80', fontSize: 13, flexShrink: 0 }}>⏭</span>
        <span style={{ flex: 1, lineHeight: 1.5, color: '#ffcc80', fontWeight: 600 }}>continue</span>
      </div>
    </BaseNode>
  );
});

// ── Comment Node (docstrings / # comments, collapsible) ──────────────

const CommentNode = memo(({ id, data }: NodeProps) => {
  const d = useData(data);
  const collapsed = d.collapsed !== false;
  const isDocstring = d.isDocstring === true;
  const fullText = (d.commentText as string) || d.label || '';
  const borderColor = '#2e7d32';  // dark green distinct from return's #81c784

  return (
    <div
      style={{
        background: '#0d2818',
        border: `2px solid ${borderColor}`,
        borderRadius: 8,
        padding: collapsed ? '6px 12px' : '8px 14px',
        minWidth: 140,
        maxWidth: 360,
        color: '#a5d6a7',
        fontSize: 12,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
        wordBreak: 'break-word',
        whiteSpace: collapsed ? 'nowrap' : 'pre-wrap',
        overflow: 'hidden',
        textOverflow: collapsed ? 'ellipsis' : 'unset',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        position: 'relative',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: borderColor, width: 8, height: 8, border: 'none' }}
      />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <span style={{ color: borderColor, fontSize: 13, flexShrink: 0 }}>
          {isDocstring ? '📄' : '💬'}
        </span>
        <span style={{ flex: 1, lineHeight: 1.5 }}>
          {collapsed ? (fullText.length > 60 ? fullText.slice(0, 60) + '...' : fullText) : fullText}
        </span>
        <span style={{
          color: borderColor, fontSize: 10, cursor: 'pointer',
          background: 'rgba(46,125,50,0.15)', borderRadius: 3, padding: '1px 5px',
          flexShrink: 0, userSelect: 'none',
        }} title="Right-click to expand/collapse">
          {collapsed ? '▶' : '▼'}
        </span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: borderColor, width: 8, height: 8, border: 'none' }}
      />
    </div>
  );
});

// ── Class Node (for file-level class entries) ────────────────────────

const ClassNode = memo(({ id, data }: NodeProps) => {
  const d = useData(data);
  return (
    <BaseNode id={id} data={{ ...d, nodeType: 'function' }} minWidth={150}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: '#ba68c8', fontSize: 13 }}>📦</span>
        <div>
          <div style={{ fontWeight: 600, lineHeight: 1.4, color: '#ce93d8' }}>{d.label}</div>
        </div>
      </div>
    </BaseNode>
  );
});

// ── Group Box Node (background rectangle for block grouping) ──────────

const GroupBoxNode = memo(({ data }: NodeProps) => {
  const d = useData(data);
  const bgColor = (d.blockColor as string) || 'rgba(100,100,100,0.06)';
  const borderColor = (d.blockBorder as string) || '#555';
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: bgColor,
        border: `1px dashed ${borderColor}`,
        borderRadius: 10,
        position: 'relative',
        pointerEvents: 'none',
      }}
    >
      <span style={{
        position: 'absolute',
        top: -10,
        left: 8,
        background: '#161b22',
        color: borderColor,
        fontSize: 10,
        fontWeight: 600,
        padding: '1px 8px',
        borderRadius: 4,
        fontFamily: 'monospace',
        whiteSpace: 'nowrap',
        border: `1px solid ${borderColor}`,
      }}>
        {d.label}
      </span>
    </div>
  );
});

// ── Register all custom nodes ─────────────────────────────────────────

export const nodeTypes = {
  entry: EntryNode,
  exit: ExitNode,
  condition: ConditionNode,
  loop: LoopNode,
  statement: StatementNode,
  call: CallNode,
  function: FunctionNode,
  try: TryNode,
  except: ExceptNode,
  error: ErrorNode,
  groupBox: GroupBoxNode,
  comment: CommentNode,
  break: BreakNode,
  continue: ContinueNode,
  classNode: ClassNode,
};
