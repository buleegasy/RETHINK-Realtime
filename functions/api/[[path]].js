export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }

  const url = new URL(context.request.url);
  const targetUrl = new URL(url.pathname + url.search, 'https://rethink-realtime-worker.buleegasy-6c8.workers.dev');

  const reqHeaders = new Headers(context.request.headers);
  reqHeaders.delete('host');

  const isWs = reqHeaders.get('upgrade')?.toLowerCase() === 'websocket';

  let body = undefined;
  if (!isWs && context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    try {
      body = await context.request.arrayBuffer();
    } catch {}
  }

  try {
    const response = await fetch(targetUrl.toString(), {
      method: context.request.method,
      headers: reqHeaders,
      body,
      redirect: 'follow',
    });

    if (response.status === 101 || isWs || response.webSocket) {
      return response;
    }

    if (url.pathname === '/api/admin/sessions' && response.ok) {
      try {
        const rawData = await response.json();
        if (rawData && Array.isArray(rawData.sessions)) {
          rawData.sessions = rawData.sessions.filter((s) =>
            !s.sessionId?.startsWith('sess_sample_') &&
            !s.sessionId?.startsWith('mock_') &&
            !s.id?.startsWith('sess_sample_') &&
            !s.id?.startsWith('mock_')
          );
        }
        return new Response(JSON.stringify(rawData), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': '*',
          },
        });
      } catch {}
    }

    if (url.pathname === '/api/admin/crises' && response.ok) {
      try {
        const rawData = await response.json();
        if (rawData && Array.isArray(rawData.crises)) {
          rawData.crises = rawData.crises.filter((s) =>
            !s.sessionId?.startsWith('sess_sample_') &&
            !s.sessionId?.startsWith('mock_')
          );
        }
        return new Response(JSON.stringify(rawData), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': '*',
          },
        });
      } catch {}
    }

    if (url.pathname === '/api/admin/stats') {
      try {
        const sessionsRes = await fetch('https://rethink-realtime-worker.buleegasy-6c8.workers.dev/api/admin/sessions?includeDeleted=false', {
          headers: reqHeaders,
        });
        const sessionsData = await sessionsRes.json();
        const realSessions = (sessionsData?.sessions || []).filter((s) =>
          !s.sessionId?.startsWith('sess_sample_') &&
          !s.sessionId?.startsWith('mock_') &&
          !s.id?.startsWith('sess_sample_') &&
          !s.id?.startsWith('mock_') &&
          !s.isDeleted
        );

        const totalSessions = realSessions.length;
        const crisisCount = realSessions.filter((s) => s.isCrisis || (s.crisisLevel >= 3)).length;
        const pendingInterventions = realSessions.filter((s) => (s.isCrisis || s.crisisLevel >= 3) && s.dispositionStatus === 'pending_contact').length;
        const validValences = realSessions.map((s) => s.emotionalValence).filter((v) => typeof v === 'number' && !Number.isNaN(v));
        const avgValence = validValences.length > 0 ? Number((validValences.reduce((a, b) => a + b, 0) / validValences.length).toFixed(2)) : 0.0;

        const concernCounts = {};
        for (const s of realSessions) {
          if (Array.isArray(s.coreConcerns)) {
            for (const c of s.coreConcerns) {
              if (typeof c === 'string' && c.trim()) {
                concernCounts[c] = (concernCounts[c] || 0) + 1;
              }
            }
          }
        }
        const concernDistribution = Object.entries(concernCounts).map(([name, count]) => ({ name, count }));

        const riskDistribution = [
          { level: 0, label: '正常稳定', count: realSessions.filter((s) => (s.crisisLevel || 0) === 0).length },
          { level: 1, label: '轻度波动', count: realSessions.filter((s) => s.crisisLevel === 1).length },
          { level: 2, label: '中度压力', count: realSessions.filter((s) => s.crisisLevel === 2).length },
          { level: 3, label: '极高危预警', count: realSessions.filter((s) => (s.crisisLevel || 0) >= 3 || s.isCrisis).length },
        ];

        const now = new Date();
        const weeklyTrend = Array.from({ length: 7 }).map((_, idx) => {
          const d = new Date(now.getTime() - (6 - idx) * 86400000);
          const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
          const daySessions = realSessions.filter((s) => {
            if (!s.createdAt) return false;
            const sDate = new Date(s.createdAt * 1000);
            return sDate.getDate() === d.getDate() && sDate.getMonth() === d.getMonth() && sDate.getFullYear() === d.getFullYear();
          });
          const dayValences = daySessions.map((s) => s.emotionalValence).filter((v) => typeof v === 'number' && !Number.isNaN(v));
          const dayAvgValence = dayValences.length > 0 ? Number((dayValences.reduce((a, b) => a + b, 0) / dayValences.length).toFixed(2)) : 0.0;
          return {
            date: dateStr,
            sessions: daySessions.length,
            crisis: daySessions.filter((s) => (s.crisisLevel >= 3) || s.isCrisis).length,
            avgValence: dayAvgValence,
          };
        });

        return new Response(JSON.stringify({
          success: true,
          stats: {
            totalSessions,
            crisisCount,
            pendingInterventions,
            avgValence,
            concernDistribution,
            riskDistribution,
            weeklyTrend,
          },
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': '*',
          },
        });
      } catch {}
    }

    const respHeaders = new Headers(response.headers);
    respHeaders.set('Access-Control-Allow-Origin', '*');
    respHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    respHeaders.set('Access-Control-Allow-Headers', '*');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: respHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Worker proxy failed' }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
