// Types shared across the frontend

export interface FlowNodeData {
  [key: string]: unknown;
  label: string;
  nodeType: string; // entry, exit, condition, loop, statement, call, function, try, except, merge, error
  funcName?: string;
  lineNo?: number;
  expandable?: boolean;
  callName?: string;
  filepath?: string;
  projectView?: boolean;
  signature?: boolean;
  endpoint?: boolean;
  return?: boolean;
  raise?: boolean;
  break?: boolean;
  continue?: boolean;
  empty?: boolean;
  nested?: boolean;
  with?: boolean;
  // Block grouping
  blockId?: string;
  blockType?: string;
  // Comment
  collapsed?: boolean;
  commentText?: string;
  isDocstring?: boolean;
  commentStart?: number;
  commentEnd?: number;
}

export interface FlowNode {
  id: string;
  type: string;
  data: FlowNodeData;
  position: { x: number; y: number };
  style?: Record<string, unknown>;
  className?: string;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: string;
  animated?: boolean;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface FlowBlock {
  id: string;
  type: string;
  label: string;
  nodeIds: string[];
  color: string;
  border: string;
}

export interface ParseResult {
  nodes: FlowNode[];
  edges: FlowEdge[];
  blocks?: FlowBlock[];
  functions?: FunctionInfo[];
  defined_functions?: FunctionInfo[];
  errors?: ParseError[];
  file_count?: number;
  function_name?: string;
}

export interface FunctionInfo {
  name: string;
  filepath?: string;
  lineno: number;
  end_lineno?: number;
}

export interface ParseError {
  line: number;
  offset: number;
  msg: string;
}

export interface BreadcrumbItem {
  label: string;
  funcName?: string;
}
