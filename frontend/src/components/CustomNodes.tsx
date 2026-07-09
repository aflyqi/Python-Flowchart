// @ts-nocheck
import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { FlowNodeData } from '../types';

// ── Base styling ──────────────────────────────────────────────
const baseStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 10,
  border: '2px solid',
  fontSize: 12,
  fontWeight: 600,
  fontFamily: "'JetBrains Mono', monospace",
  color: '#fff',
  textAlign: 'center',
  minWidth: 60,
  maxWidth: 240,
  transition: 'all 0.15s ease',
  position: 'relative',
  cursor: 'pointer',
};

const handleStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  border: '2px solid #1a1a28',
  background: '#6c6cf0',
  transition: 'all 0.2s ease',
};

// ── Node type → color mapping ─────────────────────────────────
const nodeColors: Record<string, { bg: string; border: string }> = {
  entry:      { bg: 'linear-gradient(135deg, #065f46, #059669)', border: '#22c55e' },
  exit:       { bg: 'linear-gradient(135deg, #7f1d1d, #dc2626)', border: '#ef4444' },
  statement:  { bg: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: '#3b82f6' },
  condition:  { bg: 'linear-gradient(135deg, #78350f, #d97706)', border: '#f59e0b' },
  loop:       { bg: 'linear-gradient(135deg, #164e63, #0891b2)', border: '#06b6d4' },
  call:       { bg: 'linear-gradient(135deg, #4c1d95, #7c3aed)', border: '#a855f7' },
  function:   { bg: 'linear-gradient(135deg, #4c1d95, #7c3aed)', border: '#a855f7' },
  try:        { bg: 'linear-gradient(135deg, #581c87, #9333ea)', border: '#a855f7' },
  except:     { bg: 'linear-gradient(135deg, #581c87, #9333ea)', border: '#a855f7' },
  break:      { bg: 'linear-gradient(135deg, #7c2d12, #ea580c)', border: '#f97316' },
  continue:   { bg: 'linear-gradient(135deg, #713f12, #ca8a04)', border: '#eab308' },
  comment:    { bg: 'linear-gradient(135deg, #064e3b, #10b981)', border: '#22c55e', },
  classNode:  { bg: 'linear-gradient(135deg, #3b0764, #8b5cf6)', border: '#8b5cf6' },
};

const defaultColor = { bg: 'linear-gradient(135deg, #1e3a5f, #2563eb)', border: '#3b82f6' };

function useColors(nodeType: string) {
  return nodeColors[nodeType] || defaultColor;
}

// ── Base Node Wrapper ──────────────────────────────────────────
const BaseNode = memo(({ id, data, children }: { id: string; data: any; children?: React.ReactNode }) => {
  const colors = useColors(data.nodeType);
  const isHighlighted = false; // handled via className
  return (
    <div
      style={{
        ...baseStyle,
        background: colors.bg,
        borderColor: colors.border,
        boxShadow: `0 0 12px ${colors.border}22, 0 2px 8px rgba(0,0,0,0.3)`,
      }}
    >
      <Handle type="target" position={Position.Top} style={handleStyle} />
      {children || <span>{data.label}</span>}
      <Handle type="source" position={Position.Bottom} style={{ ...handleStyle, bottom: -4 }} />
    </div>
  );
});

// ── Node Components ────────────────────────────────────────────
export const EntryNode = memo(({ id, data }: NodeProps) => (
  <BaseNode id={id} data={data}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 14 }}>▶</span>
      <span>{data.label}</span>
    </div>
  </BaseNode>
));

export const ExitNode = memo(({ id, data }: NodeProps) => (
  <BaseNode id={id} data={data}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 14 }}>■</span>
      <span>{data.label}</span>
    </div>
  </BaseNode>
));

export const StatementNode = memo(({ id, data }: NodeProps) => (
  <BaseNode id={id} data={data}>
    <div style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {data.label}
    </div>
  </BaseNode>
));

export const ConditionNode = memo(({ id, data }: NodeProps) => (
  <BaseNode id={id} data={data}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 13 }}>◆</span>
      <span style={{ maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.label}</span>
    </div>
  </BaseNode>
));

export const LoopNode = memo(({ id, data }: NodeProps) => (
  <BaseNode id={id} data={data}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 13 }}>↻</span>
      <span style={{ maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.label}</span>
    </div>
  </BaseNode>
));

export const CallNode = memo(({ id, data }: NodeProps) => (
  <BaseNode id={id} data={data}>
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: data.expandable ? 'pointer' : 'default' }}
      title={data.expandable ? 'Double-click to drill down' : undefined}
    >
      <span style={{ fontSize: 13 }}>◎</span>
      <span style={{ maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.label}</span>
      {data.expandable && <span style={{ fontSize: 9, opacity: 0.7 }}>↗</span>}
    </div>
  </BaseNode>
));

export const FunctionNode = memo(({ id, data }: NodeProps) => (
  <BaseNode id={id} data={data}>
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
      title="Double-click to view function body"
    >
      <span style={{ fontSize: 13 }}>ƒ</span>
      <span style={{ maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.label}</span>
      <span style={{ fontSize: 9, opacity: 0.7 }}>↗</span>
    </div>
  </BaseNode>
));

export const TryNode = memo(({ id, data }: NodeProps) => (
  <BaseNode id={id} data={data}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 13 }}>⚠</span>
      <span>{data.label}</span>
    </div>
  </BaseNode>
));

export const ExceptNode = memo(({ id, data }: NodeProps) => (
  <BaseNode id={id} data={data}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 13 }}>✕</span>
      <span>{data.label}</span>
    </div>
  </BaseNode>
));

export const BreakNode = memo(({ id, data }: NodeProps) => (
  <BaseNode id={id} data={data}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 13 }}>⏹</span>
      <span>break</span>
    </div>
  </BaseNode>
));

export const ContinueNode = memo(({ id, data }: NodeProps) => (
  <BaseNode id={id} data={data}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 13 }}>⏭</span>
      <span>continue</span>
    </div>
  </BaseNode>
));

export const CommentNode = memo(({ id, data }: NodeProps) => {
  const coll = data.collapsed;
  return (
    <BaseNode id={id} data={data}>
    <div style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis',
      whiteSpace: coll ? 'nowrap' : 'normal',
      fontSize: coll ? 11 : 11, opacity: 0.85,
      fontStyle: 'italic', }}>
      {String(coll ? `${(data.commentText || data.label || '').slice(0, 40)}…` : (data.commentText || data.label || ''))}
    </div>
  </BaseNode>
  );
});

export const ClassNode = memo(({ id, data }: NodeProps) => (
  <BaseNode id={id} data={data}>
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
      title="Double-click to view class internals"
    >
      <span style={{ fontSize: 13 }}>▦</span>
      <span style={{ maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.label}</span>
      <span style={{ fontSize: 9, opacity: 0.7 }}>↗</span>
    </div>
  </BaseNode>
));

// ── Group Box ─────────────────────────────────────────────────
export const GroupBoxNode = memo(({ id, data }: NodeProps) => (
  <div
    style={{
      border: `2px dashed ${data.groupType === 'struct' ? '#6366f1' : '#22d3ee'}`,
      borderRadius: 14,
      padding: 16,
      background: data.groupType === 'struct'
        ? 'rgba(99, 102, 241, 0.04)'
        : 'rgba(34, 211, 238, 0.04)',
      minWidth: 100,
      minHeight: 60,
      pointerEvents: 'none',
      position: 'relative',
    }}
  >
    {data.groupLabel && (
      <div
        style={{
          position: 'absolute',
          top: -8,
          left: 14,
          background: '#0a0a0f',
          padding: '0 8px',
          fontSize: 10,
          fontWeight: 600,
          color: data.groupType === 'struct' ? '#818cf8' : '#67e8f9',
          borderRadius: 4,
          fontFamily: "'Inter', sans-serif",
        }}
      >
        {data.groupLabel}
      </div>
    )}
  </div>
));

// ── Node Types Map ─────────────────────────────────────────────
export const nodeTypes = {
  entry: EntryNode,
  exit: ExitNode,
  statement: StatementNode,
  condition: ConditionNode,
  loop: LoopNode,
  call: CallNode,
  function: FunctionNode,
  try: TryNode,
  except: ExceptNode,
  break: BreakNode,
  continue: ContinueNode,
  comment: CommentNode,
  classNode: ClassNode,
  groupBox: GroupBoxNode,
};
