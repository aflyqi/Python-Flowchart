// ── Core Type Definitions ──────────────────────────────────────────────

export interface FlowNodeData {
  label: string;
  nodeType: string;
  lineNo?: number;
  funcName?: string;
  callName?: string;
  expandable?: boolean;
  isClass?: boolean;
  blockId?: string;
  isGroupBox?: boolean;
  groupType?: string;
  groupLabel?: string;
  commentText?: string;
  collapsed?: boolean;
  inspect?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  sourceLine?: number;
}

export interface FlowNode {
  id: string;
  type: string;
  data: FlowNodeData;
  position?: { x: number; y: number };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: string;
  animated?: boolean;
  style?: Record<string, string>;
}

export interface FlowBlock {
  id: string;
  type: string;
  label: string;
  nodeIds: string[];
  parentId?: string;
}

export interface FunctionInfo {
  name: string;
  filepath?: string;
  lineno: number;
  end_lineno?: number;
}

export interface BreadcrumbItem {
  label: string;
  funcName?: string;
  isClass?: boolean;
}

export type ViewMode = 'file' | 'function' | 'project';

export interface ParseResult {
  nodes: FlowNode[];
  edges: FlowEdge[];
  blocks?: FlowBlock[];
  defined_functions?: FunctionInfo[];
  functions?: FunctionInfo[];
  errors?: string[];
  is_file_view?: boolean;
}
