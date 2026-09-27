import { Hono } from 'hono';
import type {
  Env,
  SessionRecord,
  TeacherAuthPayload,
  CrisisUnmaskPayload,
  DispositionPayload,
  DeleteSessionPayload,
  RestoreSessionPayload,
  WebhookTestPayload,
} from '../types';
import { AdminService } from '../services/admin-service';
import { SessionRepository } from '../repositories/session-repository';

import { createAuthMiddleware } from '../middlewares/auth-middleware';

export const adminRouter = new Hono<{ Bindings: Env }>();

const adminAuth = createAuthMiddleware({ allowedRoles: ['teacher', 'admin'] });

// 管理端全局鉴权拦截：除登录接口外，其余接口必须持有合法且未过期的签名凭证
adminRouter.use('*', async (c, next) => {
  if (c.req.path.endsWith('/login')) {
    return next();
  }
  return adminAuth(c, next);
});

export async function addSessionRecordToStore(env: Env, record: SessionRecord): Promise<void> {
  await SessionRepository.save(env, record);
}

// 1. 教师身份鉴权与凭证签发
adminRouter.post('/login', async (c) => {
  let body: TeacherAuthPayload = {};
  try {
    body = await c.req.json<TeacherAuthPayload>();
  } catch {}

  const res = await AdminService.authenticateTeacher(body.username, body.password, c.env || {});
  return c.json(res, res.status as any);
});

// 2. 校园心理大盘实证宏观统计
adminRouter.get('/stats', async (c) => {
  const stats = await AdminService.getMacroStats(c.env || {});
  return c.json({ success: true, stats, d1Bound: Boolean(c.env?.DB) });
});

// 3. 全量会话脱敏列表查询
adminRouter.get('/sessions', async (c) => {
  const includeDeleted = c.req.query('includeDeleted') === 'true';
  const crisisOnly = c.req.query('crisisOnly') === 'true' || c.req.query('crisisOnly') === '1';

  const sessions = await AdminService.getSessions(c.env || {}, { includeDeleted, crisisOnly });
  return c.json({ success: true, sessions });
});

// 4. 危机事件专项分诊列表
adminRouter.get('/crises', async (c) => {
  const crises = await AdminService.getCrises(c.env || {});
  return c.json({ success: true, crises });
});

// 5. 危机二次安全口令认证与身份穿透
adminRouter.post('/crisis/unmask', async (c) => {
  let body: CrisisUnmaskPayload = { session_id: '', secondary_passcode: '' };
  try {
    body = await c.req.json<CrisisUnmaskPayload>();
  } catch {}

  const res = await AdminService.unmaskCrisis(c.env || {}, body);
  return c.json(res, res.status as any);
});

// 6. 线下干预跟进处置状态流转
adminRouter.post('/crisis/disposition', async (c) => {
  let body: DispositionPayload = { session_id: '', status: 'pending_contact' };
  try {
    body = await c.req.json<DispositionPayload>();
  } catch {}

  const res = await AdminService.updateDisposition(c.env || {}, body);
  return c.json(res, res.httpStatus as any);
});

// 7. 个案安全归档（软删除）
adminRouter.post('/sessions/delete', async (c) => {
  let body: DeleteSessionPayload = { session_id: '', secondary_passcode: '', reason: '' };
  try {
    body = await c.req.json<DeleteSessionPayload>();
  } catch {}

  const res = await AdminService.softDelete(c.env || {}, body);
  return c.json(res, res.status as any);
});

// 8. 归档个案安全恢复
adminRouter.post('/sessions/restore', async (c) => {
  let body: RestoreSessionPayload = { session_id: '', secondary_passcode: '' };
  try {
    body = await c.req.json<RestoreSessionPayload>();
  } catch {}

  const res = await AdminService.restoreSession(c.env || {}, body);
  return c.json(res, res.status as any);
});

// 9. 智能体个案评估二次重算
adminRouter.post('/sessions/re-evaluate', async (c) => {
  let body: { session_id?: string; transcript?: string } = {};
  try {
    body = await c.req.json<{ session_id?: string; transcript?: string }>();
  } catch {}

  const res = await AdminService.reEvaluateSession(c.env || {}, body.session_id || '', body.transcript);
  return c.json(res, res.status as any);
});

// 10. 危机告警通道联通性测试
adminRouter.post('/webhook/test', async (c) => {
  let body: WebhookTestPayload = {};
  try {
    body = await c.req.json<WebhookTestPayload>();
  } catch {}

  const res = await AdminService.testWebhook(c.env || {}, body);
  return c.json(res, res.status as any);
});

// 11. 校园心理干预安全审计日志
adminRouter.get('/audit-logs', async (c) => {
  const logs = await AdminService.getAuditLogs(c.env || {});
  return c.json({ success: true, logs });
});

// 12. 物理彻底清除所有历史假数据端点
adminRouter.post('/clean-mock-data', async (c) => {
  const purged = await SessionRepository.purgeMockData(c.env || {});
  return c.json({ success: true, purged, message: '已彻底物理清除历史假数据' });
});

