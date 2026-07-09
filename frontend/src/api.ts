import type { ParseResult } from './types';

const BASE_URL = '/api';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text.slice(0, 200));
  }
  return res.json();
}

export function parseCode(
  source: string,
  filepath = '',
  enable_struct_groups = false,
  enable_chunk_groups = false
): Promise<ParseResult> {
  return post('/parse', { source, filepath, enable_struct_groups, enable_chunk_groups });
}

export function parseFunction(
  source: string,
  func_name: string,
  filepath = '',
  max_depth = 0,
  enable_struct_groups = false,
  enable_chunk_groups = false
): Promise<ParseResult> {
  return post('/function', {
    source, func_name, filepath, max_depth,
    enable_struct_groups, enable_chunk_groups,
  });
}

export function parseClass(
  source: string,
  class_name: string,
  filepath = '',
  enable_struct_groups = false,
  enable_chunk_groups = false
): Promise<ParseResult> {
  return post('/class', {
    source, class_name, filepath,
    enable_struct_groups, enable_chunk_groups,
  });
}
