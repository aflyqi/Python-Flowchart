import type { ParseResult } from './types';

const BASE_URL = '/api';

export async function parseCode(
  source: string,
  filepath = '',
  enableStructGroups = false,
  enableChunkGroups = false
): Promise<ParseResult> {
  const res = await fetch(`${BASE_URL}/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, filepath, enable_struct_groups: enableStructGroups, enable_chunk_groups: enableChunkGroups }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Parse failed');
  }
  return res.json();
}

export async function parseFunction(
  source: string,
  funcName: string,
  filepath = '',
  maxDepth = 0,
  enableStructGroups = false,
  enableChunkGroups = false
): Promise<ParseResult> {
  const res = await fetch(`${BASE_URL}/function`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source, func_name: funcName, filepath, max_depth: maxDepth,
      enable_struct_groups: enableStructGroups,
      enable_chunk_groups: enableChunkGroups,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Parse failed');
  }
  return res.json();
}

export async function parseProject(rootDir: string): Promise<ParseResult> {
  const res = await fetch(`${BASE_URL}/project`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ root_dir: rootDir }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Project load failed');
  }
  return res.json();
}

export async function parseClass(
  source: string,
  className: string,
  filepath = '',
  enableStructGroups = false,
  enableChunkGroups = false
): Promise<ParseResult> {
  const res = await fetch(`${BASE_URL}/class`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source, class_name: className, filepath,
      enable_struct_groups: enableStructGroups,
      enable_chunk_groups: enableChunkGroups,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Parse class failed');
  }
  return res.json();
}
