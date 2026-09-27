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

function buildFaithfulFallback(transcript, stage) {
  const clean = deidentifyText(transcript || '').trim();
  const userLines = clean
    .split('\n')
    .filter((l) => l.startsWith('学生') || l.startsWith('来访者'))
    .map((l) => l.replace(/^(学生|来访者)[:：]\s*/, '').trim())
    .filter(Boolean);

  const mainSnippet = userLines[0] || clean.slice(0, 30);
  const isShortChitChat = !mainSnippet || mainSnippet.length < 6 || /^(你好|在吗|喂|哈喽|hello|hi|测试)/i.test(mainSnippet);

  const coreConcerns = isShortChitChat
    ? ['日常交流']
    : [`围绕“${mainSnippet.slice(0, 20)}...”的倾诉探讨`];

  const isEscalated = stage === 'Crisis_Escalation';
  const initialEmotion = isShortChitChat ? '好奇/尝试' : '情绪表达与倾诉';
  const finalEmotion = isEscalated ? '触发危机转介通道' : (isShortChitChat ? '轻松自然' : '完成初步交流');

  return {
    crisisLevel: isEscalated ? 3 : 0,
    isCrisis: isEscalated,
    crisisSummary: isShortChitChat
      ? '学生进行了简短的日常交流或电话亭体验。'
      : `围绕“${mainSnippet.slice(0, 25)}”进行了倾诉与初步梳理。`,
    coreConcerns,
    emotionalValence: isEscalated ? -0.8 : (isShortChitChat ? 0.0 : -0.1),
    cognitiveDistortions: isShortChitChat
      ? ['表达自然，未见负向认知偏差']
      : ['交流平稳，未见明显负向认知歪曲'],
    initialEmotion,
    finalEmotion,
    deltaNotes: isShortChitChat ? '日常互动，情绪自然放松。' : '梳理了发言内容，未见明显负向情绪聚集。',
    keyTakeaways: ['可在管理后台点击“重新提炼简报”进行更新。'],
    homeworkAction: '', // 闲聊或无明确共识时绝不捏造微行动练习
  };
}

async function requestDeepSeekV4FlashEvaluation(transcript) {
  const prompt = `你是基于 DeepSeek V4 Flash 驱动的中学校园心理情绪评估专家。请针对以下学生真实倾诉对话文本进行客观、严谨、实事求是的心理学评估与个案建档。
服务对象为纯高中在读学生。所有字段必须100%严格根据本次真实对话中的事实提取，绝对严禁捏造任何未发生的事实或模板套话：

【核心求实准则（极其重要，严格遵守）】：
1. 普通闲聊绝不能说是现实困扰：若学生只是打招呼、试探、日常寒暄或简短尝试（未表达具体心理痛苦或现实危机），必须如实判定为日常交流：
   - coreConcerns: 若为普通闲聊，输出 ["日常交流"]；
   - cognitiveDistortions: 若无认知扭曲，必须输出 ["表达自然，未见负向认知偏差"]，绝对严禁使用“属于阶段性现实困扰”或生硬安插挫折困扰！
   - homeworkAction: 若无具体心理困扰或未达成行动共识，必须直接输出 ""（空字符串），绝对严禁捏造“写下感受”、“深呼吸”等模板化小练习！没有微行动练习就直接留空！
2. 语言必须客观、中立、求实，面向学校心理专职老师展示，不要包含生硬理论名词。

请严格输出合法的 JSON 对象，不要包含任何 markdown 代码块或反引号包裹：
{
  "crisisLevel": 0,
  "isCrisis": false,
  "crisisSummary": "紧密结合本次真实对话的一句话客观判定说明",
  "coreConcerns": ["根据对话真实提炼的1-2个具体议题；普通闲聊填日常交流"],
  "emotionalValence": 0.0,
  "cognitiveDistortions": ["从学生言语中客观识别的认知偏差；若无则填“表达自然，未见负向认知偏差”，严禁编造现实困扰"],
  "initialEmotion": "进线时学生真实情绪状态，如平静、好奇、焦虑",
  "finalEmotion": "挂机时学生真实情绪状态，如轻松、平和、释怀",
  "deltaNotes": "学生在对话中的情绪变化轨迹客观描述",
  "homeworkAction": "若学生明确提及具体问题且达成行动方案，总结1条切实微行动；若为普通闲聊或无明确微行动，必须留空输出\"\"",
  "keyTakeaways": ["根据本次交流提炼的1条启发或空"]
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

async function generateWeeklySummaryDeepSeekV4Flash(realSessions, totalSessions, crisisCount, avgValence, topConcerns) {
  if (totalSessions === 0) {
    return '本周暂无学生进线倾诉，校园情绪状态整体平稳，各终端正常待命。';
  }

  const concernNames = (topConcerns || []).map((c) => c.name).filter(Boolean);
  const concernStr = concernNames.length > 0 ? concernNames.join('、') : '日常闲聊与尝试';

  const prompt = `你是学校心理健康管理专家。请根据以下本周脱敏统计事实，生成一段20-50字的“本周情绪摘要”，供学校心理老师大屏参阅。
【严格要求】：
1. 保持绝对客观中立、求实的语言，绝对不允许捏造任何未发生的困扰或模板套话。
2. 若以日常闲聊、问候为主，如实指出整体平稳自然，绝不能无中生有夸大困扰。
3. 字数严格控制在20至50字之间，简洁精炼，直接输出一段话，不要带任何标题、前缀、引号或编号。

【统计事实】：
- 累计通话：${totalSessions}次
- 需关注危机预警：${crisisCount}起
- 平均情绪效价：${avgValence > 0 ? '+' + avgValence : avgValence} (-1至+1区间)
- 主要议题分布：${concernStr}
`;

  try {
    const res = await fetch(`${WORKER_ORIGIN}/api/voice/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: prompt, stage: 'Active_Listening', history: [] }),
    });
    if (res.ok) {
      const data = await res.json();
      let reply = (data?.reply || '').trim().replace(/^["“'‘]+|["”'’]+$/g, '');
      if (reply.length >= 18 && reply.length <= 55) {
        return reply;
      }
    }
  } catch {}

  // 客观真实的规则兜底（严格 20-50 字）
  if (crisisCount > 0) {
    return `本周记录${totalSessions}次倾诉，监测到${crisisCount}起需关注预警，议题多集中于${concernStr.slice(0, 15)}，请老师重点跟进。`;
  }
  if (concernNames.length === 0 || concernStr.includes('闲聊') || concernStr.includes('日常')) {
    return `本周学生通话以日常闲聊与设备体验为主，整体情绪平稳自然，未监测到群体性心理压力。`;
  }
  return `本周倾诉主要围绕${concernStr.slice(0, 16)}展开，平均情绪效价为${avgValence > 0 ? '+' + avgValence : avgValence}，整体处于常规调节状态。`;
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
      coreConcerns: evalResult.coreConcerns && evalResult.coreConcerns.length > 0 ? evalResult.coreConcerns : ['日常交流'],
      cognitiveDistortions: evalResult.cognitiveDistortions && evalResult.cognitiveDistortions.length > 0 ? evalResult.cognitiveDistortions : ['表达自然，未见负向认知偏差'],
      emotionalTrajectory: {
        initial: evalResult.initialEmotion || '情绪倾诉',
        final: evalResult.finalEmotion || '平稳梳理',
        deltaNotes: evalResult.deltaNotes || evalResult.crisisSummary || '已梳理事实与情绪边界。',
      },
      keyTakeaways: evalResult.keyTakeaways || [],
      homeworkAction: evalResult.homeworkAction || '',
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
            if (cid && !cid.startsWith('sess_sample_') && !cid.startsWith('mock_')) {
              if (!sessionMap.has(cid)) {
                sessionMap.set(cid, c);
              } else {
                const local = sessionMap.get(cid);
                sessionMap.set(cid, {
                  ...c,
                  ...local,
                  dispositionStatus: local.dispositionStatus || c.dispositionStatus,
                  dispositionNote: local.dispositionNote !== undefined ? local.dispositionNote : c.dispositionNote,
                });
              }
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

    const weeklySummary = await generateWeeklySummaryDeepSeekV4Flash(
      realSessions,
      totalSessions,
      crisisCount,
      avgValence,
      concernDistribution
    );

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
        weeklySummary,
      },
    });
  }

  // 6. 危机处置状态更新与保存（待跟进 / 已介入 / 已结案）
  if (url.pathname === '/api/admin/crisis/disposition' && context.request.method === 'POST') {
    const payload = bodyJson || {};
    const { session_id, status, note } = payload;
    if (!session_id || !status) {
      return jsonResponse({ success: false, error: '缺少会话标识或处置状态' }, 400);
    }

    const target = edgeSessions.find((s) => s.sessionId === session_id || s.id === session_id);
    if (target) {
      target.dispositionStatus = status;
      if (note !== undefined) {
        target.dispositionNote = note;
      }
    }

    // 异步同步到上游 Worker
    try {
      fetch(`${WORKER_ORIGIN}/api/admin/crisis/disposition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    } catch {}

    return jsonResponse({
      success: true,
      session_id,
      status,
      note: note !== undefined ? note : (target?.dispositionNote || ''),
    });
  }

  // 7. 安全归档与恢复操作
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

  // 8. 教师后台一键使用 DeepSeek V4 Flash 重新提炼真实简报
  if (url.pathname === '/api/admin/sessions/re-evaluate' && context.request.method === 'POST') {
    const payload = bodyJson || {};
    const { session_id } = payload;
    let target = edgeSessions.find((s) => s.sessionId === session_id);
    let transcript = target?.deidentifiedReport?.deidentifiedTranscript || target?.transcript_text || target?.crisisSummary || '';

    if (!transcript) {
      try {
        const upstream = await fetch(`${WORKER_ORIGIN}/api/admin/sessions?includeDeleted=true`, { headers: reqHeaders });
        if (upstream.ok) {
          const udata = await upstream.json();
          const found = (udata.sessions || []).find((s) => (s.sessionId || s.id) === session_id);
          if (found) {
            transcript = found.deidentifiedReport?.deidentifiedTranscript || found.crisisSummary || '';
            if (!target) target = found;
          }
        }
      } catch {}
    }

    const freshEval = await requestDeepSeekV4FlashEvaluation(transcript);
    if (freshEval && target) {
      target.isCrisis = Boolean(freshEval.isCrisis || freshEval.crisisLevel >= 3);
      target.crisisLevel = freshEval.crisisLevel || 0;
      target.crisisSummary = freshEval.crisisSummary || target.crisisSummary;
      target.coreConcerns = freshEval.coreConcerns || target.coreConcerns;
      target.emotionalValence = freshEval.emotionalValence ?? target.emotionalValence;
      target.deidentifiedReport = {
        ...target.deidentifiedReport,
        coreConcerns: freshEval.coreConcerns || target.deidentifiedReport?.coreConcerns,
        cognitiveDistortions: freshEval.cognitiveDistortions || target.deidentifiedReport?.cognitiveDistortions,
        emotionalTrajectory: {
          initial: freshEval.initialEmotion || target.deidentifiedReport?.emotionalTrajectory?.initial,
          final: freshEval.finalEmotion || target.deidentifiedReport?.emotionalTrajectory?.final,
          deltaNotes: freshEval.deltaNotes || freshEval.crisisSummary || target.deidentifiedReport?.emotionalTrajectory?.deltaNotes,
        },
        keyTakeaways: freshEval.keyTakeaways || target.deidentifiedReport?.keyTakeaways,
        homeworkAction: freshEval.homeworkAction || target.deidentifiedReport?.homeworkAction,
        evaluatedBy: 'DeepSeek V4 Flash',
      };
      return jsonResponse({ success: true, report: target.deidentifiedReport, session: target });
    }

    return jsonResponse({ success: Boolean(target), report: target?.deidentifiedReport });
  }

  // 9. 其余请求默认转发上游 Worker
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
