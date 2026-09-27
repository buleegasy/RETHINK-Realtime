import app from '../../worker/src/index';

/**
 * Cloudflare Pages Functions 统一 API 网关
 * 职责：
 * 1. 本地直跑后端 Hono App（随 Cloudflare Pages 自动秒级构建发布，零脱节，零假数据）
 * 2. 对 WebSocket Upgrade 请求透明代理至语音流转网关
 */
export async function onRequest(context) {
  const { request, env } = context;

  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader && upgradeHeader.toLowerCase() === 'websocket') {
    const workerOrigin = env.WORKER_ORIGIN || 'https://rethink-realtime-worker.buleegasy-6c8.workers.dev';
    const url = new URL(request.url);
    const targetUrl = new URL(url.pathname + url.search, workerOrigin);
    return fetch(targetUrl.toString(), request);
  }

  return app.fetch(request, env, context);
}
