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
    if (!env.WORKER_ORIGIN) {
      return app.fetch(request, env, context);
    }
    const url = new URL(request.url);
    let targetOrigin = '';
    try {
      targetOrigin = new URL(env.WORKER_ORIGIN).origin;
    } catch {
      targetOrigin = '';
    }
    if (!targetOrigin || targetOrigin === url.origin) {
      return app.fetch(request, env, context);
    }
    const targetUrl = new URL(url.pathname + url.search, env.WORKER_ORIGIN);
    return fetch(targetUrl.toString(), request);
  }

  return app.fetch(request, env, context);
}
