/**
 * Cloudflare Pages Functions 极简透明反向代理网关 (< 30 行)
 * 职责：将 /api/* 请求透明转交至真实的 Cloudflare Worker 后端，杜绝双重后端与版本漂移
 */
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const workerOrigin = env.WORKER_ORIGIN || 'https://rethink-realtime-worker.buleegasy-6c8.workers.dev';
  const targetUrl = new URL(url.pathname + url.search, workerOrigin);

  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader && upgradeHeader.toLowerCase() === 'websocket') {
    return fetch(targetUrl.toString(), request);
  }

  const init = {
    method: request.method,
    headers: request.headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'follow',
  };

  return fetch(targetUrl.toString(), init);
}
