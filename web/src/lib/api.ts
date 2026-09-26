const WORKER_ORIGIN = 'https://rethink-realtime-worker.buleegasy-6c8.workers.dev';

export function getWsUrl(): string {
  if (typeof window !== 'undefined') {
    const loc = window.location;
    const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${loc.host}/api/voice/ws?model=gpt-realtime-2.1-mini`;
  }
  return 'wss://rethink-realtime-worker.buleegasy-6c8.workers.dev/api/voice/ws?model=gpt-realtime-2.1-mini';
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const targetPath = path.startsWith('/') ? path : `/${path}`;
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
    const res = await fetch(targetPath, options);
    if (!res.ok && res.status >= 500) {
      return await fetch(`${WORKER_ORIGIN}${targetPath}`, options);
    }
    return res;
  } catch (err) {
    try {
      return await fetch(`${WORKER_ORIGIN}${targetPath}`, options);
    } catch {
      throw err;
    }
  }
}
