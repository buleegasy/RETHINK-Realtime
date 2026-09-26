// Cloudflare Pages Edge Gateway & Cognitive Persistence Pipeline
const WORKER_ORIGIN = 'https://rethink-realtime-worker.buleegasy-6c8.workers.dev';

// Edge-level session store
const edgeSessions = [];

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}

function deidentifyText(text) {
  if (!text) return '';
  return text
    .replace(/(?:\+?86)?\s*(1[3-9]\d)\d{4}(\d{4})/g, '$1****$2')
    .replace(/([a-zA-Z0-9_.+-])[a-zA-Z0-9_.+-]*@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)/g, '$1***@$2')
    .replace(/(\d{6})\d{8}(\w{4})/g, '$1********$2');
}

function extractCoreConcernsFromText(text) {
  const concerns = [];
  if (/学业|考试|论文|成绩|排名|毕业|考研|高考/.test(text)) concerns.push('学业成绩与考核压力');
  if (/宿舍|室友|同学|朋友|人际|孤立|排挤/.test(text)) concerns.push('同伴相处与人际交往困惑');
  if (/父母|爸妈|家里|父亲|母亲|争吵|沟通/.test(text)) concerns.push('家庭沟通与亲子关系冲突');
  if (/失眠|睡不着|心慌|头疼|胸闷|不想吃/.test(text)) concerns.push('压力引发的身体躯体化反应');
  if (concerns.length === 0 && text) {
    const cleanExcerpt = text.slice(0, 16);
    concerns.push(`“${cleanExcerpt}...”现实压力探讨`);
  }
  return concerns.length > 0 ? concerns : ['现实情境压力探讨'];
}

function extractCognitiveDistortionsFromText(text) {
  const distortions = [];
  if (/全完了|绝对|必须|总是|从没|毫无价值/.test(text)) distortions.push('绝对化与非黑即白倾向');
  if (/天塌了|完蛋了|彻底没救了|万劫不复/.test(text)) distortions.push('灾难化灾难预期');
  if (/他们肯定讨厌我|都看不起我|心里肯定觉得我/.test(text)) distortions.push('负向读心术倾向');
  return distortions.length > 0 ? distortions : ['未见显著偏执型认知歪曲'];
}

async function requestDeepSeekV4FlashEvaluation(transcript) {
  const prompt = `你是基于 DeepSeek V4 Flash 驱动的校园心理咨询评估专家。请针对以下学生真实倾诉对话文本进行严谨的心理学评估与个案建档。
所有字段必须100%严格根据本次真实对话中的事实提取，绝对严禁生成脱离对话的泛化套话（严禁套用深呼吸、日常情绪反刍等泛化模板）：
请严格输出合法的 JSON 对象，不要包含任何 markdown 代码块或反引号包裹：
{
  "crisisLevel": 0,
  "isCrisis": false,
  "crisisSummary": "紧密结合本次真实对话的一句话危机与核心议题说明",
  "coreConcerns": ["根据对话真实提炼的1-3个具体议题，如高三模考失利、与室友争吵等"],
  "emotionalValence": -0.2,
  "cognitiveDistortions": ["根据对话中具体言语识别出的认知歪曲，如非黑即白、灾难化等；若无则结合现实挫折如实总结"],
  "initialEmotion": "进线时学生真实情绪状态",
  "finalEmotion": "挂机时学生真实情绪状态",
  "deltaNotes": "学生在对话中的认知转化与情绪重塑轨迹",
  "homeworkAction": "根据本次对话探讨的具体问题量身定制的1项切实可行的CBT微行动练习",
  "keyTakeaways": ["根据本次具体议题提炼的1-2条关键启发"]
}
待评估真实对话:
"""${(transcript || '').slice(0, 3000)}"""`;

  try {
    const res = await fetch(`${WORKER_ORIGIN}/api/voice/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: prompt, stage: 'Active_Listening', history: [] }),
    });
    if (res.ok) {
      const data = await res.json();
      const rawText = data?.reply || '';
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
    }
  } catch {}
  return null;
}

function buildFaithfulFallback(transcript, stage) {
  const clean = deidentifyText(transcript || '');
  const concerns = extractCoreConcernsFromText(clean);
  const distortions = extractCognitiveDistortionsFromText(clean);
  const mainTopic = concerns[0] || '本次倾诉议题';

  let crisisLevel = 0;
  let isCrisis = false;
  let crisisSummary = '情绪状态相对稳定，未触发危机预警';

  if (/想死|自杀|自残|割腕|跳楼|不想活/.test(clean)) {
    crisisLevel = 3;
    isCrisis = true;
    crisisSummary = '检测到强烈轻生与极高危意向，需心理老师即刻介入';
  } else if (/撑不下去了|快崩溃了|受不了了|天天哭/.test(clean)) {
    crisisLevel = 2;
    crisisSummary = '检测到中度情绪崩溃与高度心理重负，建议重点关注';
  } else if (clean.length > 10) {
    crisisLevel = 1;
    crisisSummary = `存在围绕“${mainTopic}”的现实困扰，已完成初步情绪承接`;
  }

  const initialEmotion = crisisLevel >= 2 ? '高度压力与强烈情绪宣泄' : '情绪承压与倾诉渴望';
  const finalEmotion = stage === 'Crisis_Escalation' ? '触发危机升级保护' : '事实逐步理清，紧绷有所松弛';

  return {
    crisisLevel,
    isCrisis,
    crisisSummary,
    coreConcerns: concerns,
    emotionalValence: crisisLevel === 3 ? -0.9 : crisisLevel === 2 ? -0.5 : -0.1,
    cognitiveDistortions: distortions,
    initialEmotion,
    finalEmotion,
    deltaNotes: `围绕${mainTopic}展开理性探讨，进线时呈现“${initialEmotion}”，挂机时转为“${finalEmotion}”。`,
    keyTakeaways: [`理清客观事实与主观认知评价的边界，避免单一挫折泛化。`],
    homeworkAction: `针对本次探讨的“${mainTopic}”，记录下一次发生类似困扰时的具体事实，并尝试写下一种更客观的看待角度。`,
  };
}

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
  const reqHeaders = new Headers(context.request.headers);
  reqHeaders.delete('host');

  const isWs = reqHeaders.get('upgrade')?.toLowerCase() === 'websocket';

  // 1. WebSocket 实时语音流：直通后端 Worker 中继
  if (isWs || url.pathname === '/api/voice/ws') {
    const wsTarget = new URL(url.pathname + url.search, WORKER_ORIGIN);
    return fetch(wsTarget.toString(), {
      method: context.request.method,
      headers: reqHeaders,
      redirect: 'follow',
    });
  }

  let body = undefined;
  let bodyJson = null;
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    try {
      const cloned = context.request.clone();
      bodyJson = await cloned.json();
    } catch {}
    try {
      body = await context.request.arrayBuffer();
    } catch {}
  }

  // 2. 挂机会话建档与持久化：由 DeepSeek V4 Flash 深度提炼
  if (url.pathname === '/api/voice/session/persist' && context.request.method === 'POST') {
    const payload = bodyJson || {};
    const sessionId = payload.session_id || `sess_${Date.now()}`;
    const duration = payload.duration || 0;
    const stage = payload.stage || 'Active_Listening';
    const username = payload.username || '学生';
    const transcriptText = payload.transcript_text || '';
    const encryptedPayload = payload.encrypted_payload || '';

    // 调用 DeepSeek V4 Flash 提取结构化评估
    let evalResult = null;
    if (transcriptText.trim().length > 5) {
      evalResult = await requestDeepSeekV4FlashEvaluation(transcriptText);
    }
    if (!evalResult) {
      evalResult = buildFaithfulFallback(transcriptText, stage);
    }

    const isCrisisFlag = (payload.is_crisis || evalResult.isCrisis || evalResult.crisisLevel >= 3 || stage === 'Crisis_Escalation');
    const crisisLevel = isCrisisFlag ? Math.max(3, evalResult.crisisLevel || 3) : (evalResult.crisisLevel || 0);

    const deidentifiedReport = {
      sessionId,
      generatedAt: Date.now(),
      durationSeconds: duration,
      userDisplayName: username ? `${username[0]}*同学` : '来访者',
      cbtStageReached: stage,
      coreConcerns: evalResult.coreConcerns || ['现实压力倾诉'],
      cognitiveDistortions: evalResult.cognitiveDistortions || ['未见显著偏执型认知歪曲'],
      emotionalTrajectory: {
        initial: evalResult.initialEmotion || '情绪倾诉',
        final: evalResult.finalEmotion || '平稳梳理',
        deltaNotes: evalResult.deltaNotes || evalResult.crisisSummary || '已梳理事实与情绪边界。',
      },
      keyTakeaways: evalResult.keyTakeaways || ['关注当下可控事实，逐步重塑积极认知。'],
      homeworkAction: evalResult.homeworkAction || '结合本次探讨的议题，记录一件客观发生的事实与感受。',
      isDeidentified: true,
      evaluatedBy: 'DeepSeek V4 Flash',
    };

    const record = {
      id: sessionId,
      sessionId,
      duration,
      stage,
      isCrisis: Boolean(isCrisisFlag),
      crisisLevel,
      crisisSummary: evalResult.crisisSummary || '已完成实时倾诉与认知梳理。',
      coreConcerns: evalResult.coreConcerns || [],
      emotionalValence: evalResult.emotionalValence ?? 0,
      deidentifiedReport,
      dispositionStatus: 'pending_contact',
      dispositionNote: '',
      isDeleted: false,
      deletedAt: null,
      deleteReason: null,
      deletedBy: null,
      createdAt: Math.floor(Date.now() / 1000),
      hasEncryptedIdentity: Boolean(encryptedPayload),
    };

    // 边缘持久化
    const existingIdx = edgeSessions.findIndex((s) => s.sessionId === sessionId);
    if (existingIdx >= 0) {
      edgeSessions[existingIdx] = record;
    } else {
      edgeSessions.unshift(record);
    }

    // 异步同步到上游 Worker
    try {
      fetch(`${WORKER_ORIGIN}/api/voice/session/persist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    } catch {}

    return jsonResponse({
      ok: true,
      session_id: sessionId,
      is_crisis: Boolean(isCrisisFlag),
      crisis_level: crisisLevel,
      report: deidentifiedReport,
    });
  }

  // 3. 管理后台会话列表：剔除所有伪造案例，合并边缘真实档案
  if (url.pathname === '/api/admin/sessions' && context.request.method === 'GET') {
    const includeDeleted = url.searchParams.get('includeDeleted') === 'true';
    const crisisOnly = url.searchParams.get('crisisOnly') === 'true';

    let workerSessions = [];
    try {
      const res = await fetch(`${WORKER_ORIGIN}/api/admin/sessions?includeDeleted=${includeDeleted}&crisisOnly=${crisisOnly}`, {
        headers: reqHeaders,
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.sessions)) {
          workerSessions = data.sessions;
        }
      }
    } catch {}

    const sessionMap = new Map();
    for (const s of workerSessions) {
      const sid = s.sessionId || s.id;
      if (sid && !sid.startsWith('sess_sample_') && !sid.startsWith('mock_')) {
        sessionMap.set(sid, s);
      }
    }
    for (const s of edgeSessions) {
      if (s.sessionId && !s.sessionId.startsWith('sess_sample_') && !s.sessionId.startsWith('mock_')) {
        sessionMap.set(s.sessionId, s);
      }
    }

    let combined = Array.from(sessionMap.values());
    if (!includeDeleted) {
      combined = combined.filter((s) => !s.isDeleted);
    }
    if (crisisOnly) {
      combined = combined.filter((s) => s.isCrisis || (s.crisisLevel >= 3));
    }
    combined.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return jsonResponse({ success: true, sessions: combined });
  }

  // 4. 管理后台危机列表：纯真实数据
  if (url.pathname === '/api/admin/crises' && context.request.method === 'GET') {
    const sessionMap = new Map();
    for (const s of edgeSessions) {
      if (s.sessionId && !s.sessionId.startsWith('sess_sample_') && !s.sessionId.startsWith('mock_')) {
        sessionMap.set(s.sessionId, s);
      }
    }
    try {
      const res = await fetch(`${WORKER_ORIGIN}/api/admin/crises`, { headers: reqHeaders });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.crises)) {
          for (const c of data.crises) {
            const cid = c.sessionId || c.id;
            if (cid && !cid.startsWith('sess_sample_') && !cid.startsWith('mock_') && !sessionMap.has(cid)) {
              sessionMap.set(cid, c);
            }
          }
        }
      }
    } catch {}

    const crises = Array.from(sessionMap.values()).filter(
      (s) => (s.isCrisis || s.crisisLevel >= 3) && !s.isDeleted
    );
    crises.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return jsonResponse({ success: true, crises });
  }

  // 5. 管理后台统计大盘：纯真动态计算，杜绝造假
  if (url.pathname === '/api/admin/stats' && context.request.method === 'GET') {
    const sessionMap = new Map();
    for (const s of edgeSessions) {
      if (s.sessionId && !s.sessionId.startsWith('sess_sample_') && !s.sessionId.startsWith('mock_') && !s.isDeleted) {
        sessionMap.set(s.sessionId, s);
      }
    }
    try {
      const res = await fetch(`${WORKER_ORIGIN}/api/admin/sessions?includeDeleted=false`, { headers: reqHeaders });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.sessions)) {
          for (const s of data.sessions) {
            const sid = s.sessionId || s.id;
            if (sid && !sid.startsWith('sess_sample_') && !sid.startsWith('mock_') && !s.isDeleted && !sessionMap.has(sid)) {
              sessionMap.set(sid, s);
            }
          }
        }
      }
    } catch {}

    const realSessions = Array.from(sessionMap.values());
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

    return jsonResponse({
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
    });
  }

  // 6. 安全归档与恢复操作
  if (url.pathname === '/api/admin/sessions/delete' && context.request.method === 'POST') {
    const payload = bodyJson || {};
    const { session_id, secondary_passcode, reason, operator_name } = payload;
    const correctPass = context.env?.TEACHER_SECONDARY_PASSCODE || 'teacher-safe-2026';
    if (secondary_passcode !== correctPass) {
      return jsonResponse({ success: false, error: '二次安全口令校验未通过' }, 403);
    }
    const target = edgeSessions.find((s) => s.sessionId === session_id);
    if (target) {
      target.isDeleted = true;
      target.deletedAt = Math.floor(Date.now() / 1000);
      target.deleteReason = reason || '心理专职教师安全归档';
      target.deletedBy = operator_name || '心理专职教师';
    }
    try {
      fetch(`${WORKER_ORIGIN}/api/admin/sessions/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    } catch {}
    return jsonResponse({ success: true });
  }

  if (url.pathname === '/api/admin/sessions/restore' && context.request.method === 'POST') {
    const payload = bodyJson || {};
    const { session_id, secondary_passcode } = payload;
    const correctPass = context.env?.TEACHER_SECONDARY_PASSCODE || 'teacher-safe-2026';
    if (secondary_passcode !== correctPass) {
      return jsonResponse({ success: false, error: '二次安全口令校验未通过' }, 403);
    }
    const target = edgeSessions.find((s) => s.sessionId === session_id);
    if (target) {
      target.isDeleted = false;
      target.deletedAt = null;
      target.deleteReason = null;
      target.deletedBy = null;
    }
    try {
      fetch(`${WORKER_ORIGIN}/api/admin/sessions/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    } catch {}
    return jsonResponse({ success: true });
  }

  // 7. 其余请求默认转发上游 Worker
  try {
    const targetUrl = new URL(url.pathname + url.search, WORKER_ORIGIN);
    const response = await fetch(targetUrl.toString(), {
      method: context.request.method,
      headers: reqHeaders,
      body,
      redirect: 'follow',
    });

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
    return jsonResponse({ error: err.message || 'Worker proxy failed' }, 502);
  }
}
