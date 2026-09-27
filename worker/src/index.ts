import { Hono } from 'hono';
import { corsMiddleware } from './middleware/cors';
import { voiceRouter } from './routes/voice';
import { authRouter } from './routes/auth';
import { kioskRouter } from './routes/kiosk';
import { adminRouter } from './routes/admin';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

app.use('*', corsMiddleware);

app.get('/', (c) => {
  return c.json({
    status: 'ok',
    service: 'rethink-realtime-worker',
    model: 'minimax-realtime',
    d1Bound: Boolean(c.env?.DB),
    timestamp: Date.now(),
  });
});

app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    d1Bound: Boolean(c.env?.DB),
    timestamp: Date.now(),
  });
});

app.route('/api/auth', authRouter);

app.route('/api/kiosk', kioskRouter);

app.route('/api/admin', adminRouter);

app.route('/api/voice', voiceRouter);

export default app;

