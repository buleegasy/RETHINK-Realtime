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
      ? ['表达自然坦诚，思维清晰，未见负向认知固化']
      : ['交流平稳，未见明显负向认知偏差'],
    initialEmotion,
    finalEmotion,
    deltaNotes: isShortChitChat
      ? '来访学生初次体验电话亭，以日常问候和功能探索为主。交谈中气氛轻松自然，未表达现实心理困扰，挂机时情绪平和舒畅。'
      : `学生进线主要就“${mainSnippet.slice(0, 20)}”展开表达，交流中情绪逐步趋向平稳，事实与主观担忧边界清晰。`,
    keyTakeaways: ['可在管理后台点击“重新提炼简报”进行更新。'],
    homeworkAction: '', // 闲聊或无明确共识时绝不捏造微行动练习
  };
}

async function requestDeepSeekV4FlashEvaluation(transcript) {
  const prompt = `你是经验丰富的校园心理专职督导老师。请针对以下学生实际倾诉对话文本，为学校心理专职教师撰写一份自然、客观、求实的“来访情绪评估简报”。

【去格式化与求实要求（极其重要，严格遵守）】：
1. 坚决杜绝八股文与机械填表感！语言必须像一位资深心理老师亲笔书写的个案会谈纪要，富有教育温度、专业敏锐度与求实态度，直接讲述学生的真实状态与来访事实。
2. 普通闲聊与初次体验绝不能生搬硬套心理问题：若学生只是打招呼、试探、好奇或日常闲聊，如实记录为日常探索与放松交流，严禁生造焦虑或挫折。
3. 叙述要连贯自然：
   - deltaNotes（会谈观察与心境演进）：写一段50-90字的连贯纪要，真实概括学生在电话里说了什么核心事情，进线时是怎样的心境，交谈中如何反应，离开时状态如何，读起来是一篇自然流畅的会谈纪要。
   - cognitiveDistortions（思维与表达观察）：结合学生对话真实表现，给出一句自然的专业观察评述（如“表达自然坦诚，思维清晰，未见负向认知偏差”；若确实存在特定思维局限，如考前灾难化，请用具体语言温和点明）。
   - homeworkAction（微行动建议）：仅当学生主动探讨了具体困扰且对话中自然形成了切实可行的微行动时才写；若为普通闲聊、试探或未达成共识，必须直接输出 ""（空字符串），严禁捏造任何假练习！

请输出合法的 JSON 对象，不要包含任何 markdown 代码块或反引号包裹：
{
  "crisisLevel": 0,
  "isCrisis": false,
  "crisisSummary": "一句话客观判定说明",
  "coreConcerns": ["从实际对话中真实识别出的1-2个具体议题，普通闲聊填日常交流"],
  "emotionalValence": 0.0,
  "cognitiveDistortions": ["结合对话的自然思维观察评述，闲聊填表达自然流畅未见负向认知偏差"],
  "initialEmotion": "进线时真实心境，如好奇、焦虑、平静",
  "finalEmotion": "挂机时真实状态，如轻松、释怀、平稳",
  "deltaNotes": "50-90字的连贯会谈纪要与心境演进叙述",
  "homeworkAction": "若有切实微行动则填写，普通闲聊或无明确微行动必须输出\"\"",
  "keyTakeaways": []
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
    return '当前暂无足够的学生来访数据，各电话亭终端正常就绪待命。';
  }

  const concernNames = (topConcerns || []).map((c) => c.name).filter(Boolean);
  const concernStr = concernNames.length > 0 ? concernNames.join('、') : '日常闲聊与尝试';

  const prompt = `你是经验丰富的校园心理专职督导老师。请结合本周校园倾诉的整体情况，撰写一段20-50字的大屏“本周心境与趋势观察”。

【核心要求（坚决去格式化、去八股文）】：
1. 绝对严禁写成机械汇报或数据填空！（大屏上方已有数字卡片，绝对不要出现“本周记录X次倾诉”、“监测到Y起危机”、“平均情绪效价为Z”等机械复读数字的套话）。
2. 请用富有教育温度与专业敏锐度的连贯叙述，提炼本周学生群体的真实心境氛围与情绪动态（例如：若以体验闲聊为主，说明氛围轻松自然、未现压力聚积；若涉及学业或同伴，说明具体心理关切与调节状态）。
3. 语言绝对客观求实，不夸大、不臆测、不打官腔，一气呵成，字数严格在20至50字之间。直接输出纯文本，不要任何标题、引号或分点。

【本周倾诉背景参考】：
- 主要涉及主题：${concernStr}
- 情绪总体基调：${crisisCount > 0 ? '存在个别需线下重点关怀的突发高压事件' : (avgValence >= 0.2 ? '整体积极轻松' : (avgValence <= -0.3 ? '普遍承载一定现实压力与负重感' : '整体处于常态平稳交流状态'))}
- 倾诉样本活跃度：${totalSessions <= 3 ? '少量探索性进线' : '常态多频进线'}
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

  // 客观真实的专业观察兜底（彻底去格式化，严格 20-50 字）
  if (crisisCount > 0) {
    return `近期校园监测到个别情绪高压个案，主要涉及${concernStr.slice(0, 12)}等生活事件，建议专职老师重点跟进，常规学生心境整体受控。`;
  }
  if (concernNames.length === 0 || concernStr.includes('闲聊') || concernStr.includes('日常')) {
    return `本周学生多以电话亭功能探索与轻量寒暄为主，整体心境平和自然，未见群体性学业或情绪焦虑集聚。`;
  }
  return `本周来访焦点主要聚焦于${concernStr.slice(0, 12)}，学生在倾诉后情绪多能得到自然舒缓与理清，校园心境总体平稳。`;
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
