import { Hono } from 'hono';
import type { Env } from '../types';

export const kioskRouter = new Hono<{ Bindings: Env }>();

kioskRouter.post('/heartbeat', async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const deviceId = (body.deviceId && typeof body.deviceId === 'string')
    ? body.deviceId.trim()
    : 'kiosk-unknown';

  const status = body.status || 'online';
  const uptime = body.uptime || 0;

  return c.json({
    success: true,
    deviceId,
    status,
    uptime,
    serverTime: Date.now(),
  });
});

kioskRouter.get('/config/:deviceId', async (c) => {
  const deviceId = c.req.param('deviceId') || 'kiosk-booth-01';

  return c.json({
    success: true,
    deviceId,
    config: {
      locationName: '校园心理倾诉驿站',
      autoResetSeconds: 30,
      silenceTimeoutSeconds: 120,
      eInkHighContrast: false,
      hardwareKeyboardEnabled: true,
      maxCallDurationMinutes: 30,
    },
  });
});
