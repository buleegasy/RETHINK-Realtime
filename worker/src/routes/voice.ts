import { Hono } from 'hono';
import type { Env, PersistSessionPayload, KnowledgeQueryPayload } from '../types';
import { VoiceService } from '../services/voice-service';

export { BargeInCoordinator } from '../services/voice-service';

export const voiceRouter = new Hono<{ Bindings: Env }>();

// 1. 全双工实时语音 WebSocket 接入端点
voiceRouter.get('/ws', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    return c.text('Expected Upgrade: websocket', 426);
  }

  const pair = new WebSocketPair();
  const [clientWs, serverWs] = Object.values(pair);
  serverWs.accept();

  const query = {
    sessionId: c.req.query('sessionId'),
    userId: c.req.query('userId'),
    username: c.req.query('username'),
    model: c.req.query('model'),
  };

  return VoiceService.handleWebSocketRelay(serverWs, clientWs, c.env || {}, query);
});

// 2. 文本与降级 REST 语音对话端点
voiceRouter.post('/chat', async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const result = await VoiceService.handleChat(c.env || {}, body);
  const status = result.ok ? 200 : 400;
  return c.json(result, status as any);
});

// 3. 通话挂机后个案记录与结构化评估简报持久化端点
voiceRouter.post('/session/persist', async (c) => {
  let payload: Partial<PersistSessionPayload> = {};
  try {
    payload = await c.req.json<PersistSessionPayload>();
  } catch {
    payload = {};
  }

  const result = await VoiceService.handlePersistSession(c.env || {}, payload);
  return c.json(result);
});

// 4. 来访学生情景记忆档案查询端点
voiceRouter.get('/memory/:userId', async (c) => {
  const userId = c.req.param('userId');
  const memory = await VoiceService.getMemory(c.env || {}, userId);
  return c.json({
    ok: true,
    userId,
    memory: memory || null,
  });
});

// 5. 心理支持与干预策略知识向量检索端点
voiceRouter.post('/knowledge', async (c) => {
  let body: Partial<KnowledgeQueryPayload> = {};
  try {
    body = await c.req.json<KnowledgeQueryPayload>();
  } catch {
    body = {};
  }

  const query = (body.query || '').trim();
  const topK = body.topK || 2;

  const result = await VoiceService.handleKnowledgeQuery(c.env || {}, query, topK);
  return c.json(result);
});
