// Cross-window sync for popout feature

type SyncData = {
  type: 'graphState'; nodes: unknown; edges: unknown; blocks: unknown;
} | {
  type: 'uiState'; syncEnabled: boolean; structGroupsEnabled: boolean;
  chunkGroupsEnabled: boolean; showMinimap: boolean; highlightedNodeId: string | null;
  code: string; functions: unknown; viewMode: string; selectedFunction: string;
  breadcrumbs: unknown; maxDepth: number;
} | {
  type: 'cursorMove'; line: number;
} | {
  type: 'nodeClick'; lineNo: number;
} | {
  type: 'toggleSync' | 'toggleStruct' | 'toggleChunk' | 'toggleMinimap';
} | {
  type: 'parseFile' | 'parseFunction' | 'parseClass';
} | {
  type: 'selectFunction'; name: string;
} | {
  type: 'drillDown'; callName: string; isClass?: boolean;
} | {
  type: 'breadcrumbClick'; index: number;
} | {
  type: 'depthChange'; depth: number;
} | {
  type: 'viewModeChange'; mode: string;
};

const CHANNEL = 'python-flowchart-popout';

export function openPopout(onMessage: (msg: SyncData) => void): Window | null {
  const w = window.open(
    location.origin + location.pathname + '?popout=1',
    'flowchart-popout',
    'width=1200,height=900,left=100,top=100'
  );
  if (!w) return null;

  const onMsg = (e: MessageEvent) => {
    if (e.data?.channel === CHANNEL) onMessage(e.data.msg as SyncData);
  };
  window.addEventListener('message', onMsg);

  return w;
}

export function sendToPopout(popout: Window, msg: SyncData) {
  popout.postMessage({ channel: CHANNEL, msg }, '*');
}

export function isPopout(): boolean {
  return new URLSearchParams(location.search).has('popout');
}

export function sendToOpener(msg: SyncData) {
  if (window.opener) {
    window.opener.postMessage({ channel: CHANNEL, msg }, '*');
  }
}

export function onOpenerMessage(handler: (msg: SyncData) => void) {
  const cb = (e: MessageEvent) => {
    if (e.data?.channel === CHANNEL) handler(e.data.msg as SyncData);
  };
  window.addEventListener('message', cb);
  return () => window.removeEventListener('message', cb);
}
