const WORKER_ORIGIN = 'https://rethink-realtime-worker.buleegasy-6c8.workers.dev';

export function getWsUrl(): string {
  if (typeof window !== 'undefined') {
    const loc = window.location;
    if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
      return `ws://${loc.host}/api/voice/ws?model=minimax-realtime`;
    }
  }
  return 'wss://rethink-realtime-worker.buleegasy-6c8.workers.dev/api/voice/ws?model=minimax-realtime';
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const targetPath = path.startsWith('/') ? path : `/${path}`;
  const primaryUrl = isLocal ? targetPath : `${WORKER_ORIGIN}${targetPath}`;

  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type') && init?.method && init.method !== 'GET' && init.method !== 'HEAD') {
    headers.set('Content-Type', 'application/json');
  }

  const options: RequestInit = {
    ...init,
    headers,
  };

  if ((options.method === 'POST' || options.method === 'PUT') && !options.body) {
    options.body = JSON.stringify({});
  }

  try {
    const res = await fetch(primaryUrl, options);
    if (!res.ok && !isLocal && (res.status === 404 || res.status === 405)) {
      return await fetch(targetPath, options);
    }
    return res;
  } catch (err) {
    if (!isLocal) {
      return await fetch(targetPath, options);
    }
    throw err;
  }
}
