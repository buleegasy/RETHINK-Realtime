import { Hono } from 'hono';
import type { Env, PersistSessionPayload, KnowledgeQueryPayload, SessionRecord } from '../types';
import { evaluateTranscriptWithMiniMax } from '../lib/minimax-evaluator';
import { encryptAesGcm } from '../lib/crypto-helper';
import { addSessionRecordToStore } from './admin';
import { sendCrisisWebhook } from '../lib/webhook-sender';
import { BgeRetriever } from '../lib/rag';
import { generateOpenAIChatReply, synthesizeRealtimeAudio } from '../lib/openai-realtime';

export const voiceRouter = new Hono<{ Bindings: Env }>();

function safeCloseWebSocket(ws: WebSocket, code?: number, reason?: string): void {
  try {
    if (code && code >= 1000 && code <= 4999 && code !== 1005 && code !== 1006) {
      ws.close(code, reason);
    } else {
      ws.close(1000, reason || 'Normal closure');
    }
  } catch {
    try {
      ws.close();
    } catch {}
  }
}

voiceRouter.get('/ws', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    return c.text('Expected Upgrade: websocket', 426);
  }

  const env = c.env || {};
  const apiyiKey = env.APIYI_API_KEY || env.OPENAI_API_KEY;

  const pair = new WebSocketPair();
  const [clientWs, serverWs] = Object.values(pair);
  serverWs.accept();

  if (apiyiKey) {
    try {
      const rawModel = c.req.query('model');
      const requestedModel = (!rawModel || rawModel === 'minimax-realtime') ? 'gpt-realtime-2.1-mini' : rawModel;
      const apiyiBase = env.APIYI_BASE_URL || env.OPENAI_BASE_URL || 'https://api.apiyi.com/v1';
      const cleanBase = apiyiBase.replace(/\/+$/, '');
      const wsEndpoint = cleanBase.endsWith('/realtime') ? `${cleanBase}?model=${encodeURIComponent(requestedModel)}` : `${cleanBase}/realtime?model=${encodeURIComponent(requestedModel)}`;
      const upstreamRes = await fetch(wsEndpoint, {
        headers: {
          Upgrade: 'websocket',
          Authorization: `Bearer ${apiyiKey}`,
        },
      });

      const upstreamWs = upstreamRes.webSocket;
      if (upstreamWs) {
        upstreamWs.accept();

        serverWs.addEventListener('message', (event) => {
          try {
            if (upstreamWs.readyState === WebSocket.OPEN) {
              const raw = typeof event.data === 'string' ? event.data : event.data.toString();
              let payload: any = null;
              try {
                payload = JSON.parse(raw);
              } catch {}

              if (payload && payload.type === 'session.update' && payload.session) {
                const incoming = payload.session;
                const incomingVad = incoming.turn_detection || incoming.audio?.input?.turn_detection;
                const turnDetection = {
                  type: 'server_vad',
                  threshold: incomingVad?.threshold ?? 0.5,
                  prefix_padding_ms: incomingVad?.prefix_padding_ms ?? 300,
                  silence_duration_ms: incomingVad?.silence_duration_ms ?? 700,
                  create_response: true,
                };
                const cleanSession: Record<string, unknown> = {
                  modalities: incoming.modalities || ['text', 'audio'],
                  instructions: incoming.instructions || '',
                  voice: incoming.voice || 'maple',
                  input_audio_format: 'pcm16',
                  output_audio_format: 'pcm16',
                  input_audio_transcription: incoming.input_audio_transcription || { model: 'whisper-1', language: 'zh' },
                  turn_detection: turnDetection,
                  tools: incoming.tools || [],
                  tool_choice: 'auto',
                  temperature: 0.7,
                };
                upstreamWs.send(
                  JSON.stringify({
                    type: 'session.update',
                    session: cleanSession,
                  })
                );
              } else if (payload && payload.type === 'response.create') {
                upstreamWs.send(JSON.stringify(payload));
              } else {
                upstreamWs.send(event.data);
              }
            }
          } catch {}
        });

        upstreamWs.addEventListener('message', (event) => {
          try {
            if (serverWs.readyState === WebSocket.OPEN) {
              serverWs.send(event.data);
            }
          } catch {}
        });

        serverWs.addEventListener('close', (event) => {
          safeCloseWebSocket(upstreamWs, event.code, event.reason);
        });

        upstreamWs.addEventListener('close', (event) => {
          safeCloseWebSocket(serverWs, event.code, event.reason);
        });

        serverWs.addEventListener('error', () => {
          safeCloseWebSocket(upstreamWs, 1011, 'Client error');
        });

        upstreamWs.addEventListener('error', () => {
          safeCloseWebSocket(serverWs, 1011, 'Upstream error');
        });

        return new Response(null, {
          status: 101,
          webSocket: clientWs,
        });
      }
    } catch {}
  }

  try {
    serverWs.send(
      JSON.stringify({
        type: 'session.created',
        event_id: `event_${Date.now()}`,
        session: {
          id: `sess_${Date.now()}`,
          object: 'realtime.session',
          model: 'gpt-realtime-2.1-mini',
          voice: 'maple',
        },
      })
    );

    serverWs.addEventListener('message', async (event) => {
      try {
        const payload = JSON.parse(event.data as string);
        const { type } = payload;

        if (type === 'session.update') {
          serverWs.send(
            JSON.stringify({
              type: 'session.updated',
              event_id: `event_${Date.now()}`,
              session: payload.session || {},
            })
          );
        } else if (type === 'ping') {
          serverWs.send(JSON.stringify({ type: 'pong' }));
        } else if (type === 'conversation.item.create') {
          serverWs.send(
            JSON.stringify({
              type: 'conversation.item.created',
              event_id: `event_${Date.now()}`,
              item: payload.item || {},
            })
          );
        } else if (type === 'response.create') {
          serverWs.send(
            JSON.stringify({
              type: 'response.created',
              event_id: `event_${Date.now()}`,
              response: {
                id: `resp_${Date.now()}`,
                status: 'in_progress',
              },
            })
          );
        }
      } catch {}
    });

    serverWs.addEventListener('error', () => {
      safeCloseWebSocket(serverWs, 1011, 'Server error');
    });

    return new Response(null, {
      status: 101,
      webSocket: clientWs,
    });
  } catch (err: any) {
    safeCloseWebSocket(serverWs, 1011, 'Exception: ' + (err?.message || 'unknown'));
    return new Response(null, { status: 101, webSocket: clientWs });
  }
});

voiceRouter.post('/chat', async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const userText = (body.text || '').trim();
  const currentStage = body.stage || 'Active_Listening';
  const history = body.history || [];
  const env = c.env || {};
  const apiKey = env.MINIMAX_API_KEY;

  if (!userText) {
    return c.json({ ok: false, error: 'Empty text' }, 400);
  }

  const crisisKeywords = ['自杀', '自残', '割腕', '不想活了', '跳楼', '结束生命', '去死'];
  const isCrisis = crisisKeywords.some((k: string) => userText.includes(k));

  if (isCrisis) {
    return c.json({
      ok: true,
      isCrisis: true,
      nextStage: 'Crisis_Escalation',
      reply: '我听到了你现在非常痛苦，请记住生命永远是最宝贵的。我现在立即为你接通紧急守护支持。',
      audioBase64: '',
    });
  }

  let knowledgeHint = '';
  try {
    const retriever = new BgeRetriever({
      embeddingApiKey: (env as any).EMBEDDING_API_KEY || (env as any).APIYI_API_KEY,
      embeddingApiUrl: (env as any).EMBEDDING_API_URL,
      rerankApiKey: (env as any).RERANK_API_KEY,
      rerankApiUrl: (env as any).RERANK_API_URL,
    });
    const hintObj = await retriever.getStrategyHint(userText, { topK: 1 });
    knowledgeHint = hintObj?.conciseDirective || '';
  } catch {}

  const systemPrompt = `你是 RETHINK 校园心理支持智能体。你使用 maple 音色，当前处于【${currentStage}】阶段。
你以同龄死党的平视、真诚、温和、松弛语气，为来访学生提供即时陪伴与结构化 CBT 认知行为支持。
【声音与口语核心准则】
1. 声音带有自然的呼吸感与温度，绝对严禁输出任何 Markdown 符号（如星号、反引号、代码块、列表编号）。
2. 每次回复控制在 1-2 句话以内，极简自然，倾听多于说教，把表达空间留给学生。
3. 绝对严禁自言自语或输出无意义口头禅（如“听起来……”、“好呀”、“随时告诉我”等），学生沉默时保持静默。
4. 若学生告知了名字或昵称，在对话中亲切自然地称呼对方。
${knowledgeHint ? `【专业 CBT 参考指南】${knowledgeHint}` : ''}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-6).map((h: any) => ({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: h.content,
    })),
    { role: 'user', content: userText },
  ];

  let replyText = '我一直在这里听你说，别着急，慢慢告诉我发生什么了。';
  const apiyiKey = env.APIYI_API_KEY || env.OPENAI_API_KEY;

  if (apiyiKey) {
    try {
      const openAiReply = await generateOpenAIChatReply({
        messages,
        apiKey: apiyiKey,
        model: 'gpt-4o-mini',
        baseUrl: env.APIYI_BASE_URL || env.OPENAI_BASE_URL || 'https://api.apiyi.com/v1',
      });
      if (openAiReply) {
        replyText = openAiReply;
      }
    } catch {}
  }

  if (replyText === '我一直在这里听你说，别着急，慢慢告诉我发生什么了。' && apiKey) {
    try {
      const minimaxBase = env.MINIMAX_BASE_URL || 'https://api.minimaxi.chat/v1';
      const chatEndpoint = minimaxBase.endsWith('/text/chatcompletion_v2') ? minimaxBase : `${minimaxBase.replace(/\/+$/, '')}/text/chatcompletion_v2`;
      const chatRes = await fetch(chatEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'MiniMax-Text-01',
          messages,
        }),
      });
      const chatData: any = await chatRes.json();
      const candidate = chatData.choices?.[0]?.message?.content;
      if (candidate) {
        replyText = candidate.replace(/[*#`_~]/g, '').trim();
      }
    } catch {}
  }

  let audioBase64 = '';
  if (apiyiKey) {
    try {
      audioBase64 = await synthesizeRealtimeAudio({
        text: replyText,
        apiKey: apiyiKey,
        voice: 'maple',
        model: 'gpt-realtime-2.1-mini',
        timeoutMs: 12000,
        baseUrl: env.APIYI_BASE_URL || env.OPENAI_BASE_URL || 'https://api.apiyi.com/v1',
      });
    } catch {}
  }

  let nextStage = currentStage;
  if (currentStage === 'Active_Listening' && history.length >= 2) {
    nextStage = 'CBT_Stripping';
  } else if (currentStage === 'CBT_Stripping' && history.length >= 4) {
    nextStage = 'Socratic_Questioning';
  }

  return c.json({
    ok: true,
    reply: replyText,
    audioBase64,
    nextStage,
    isCrisis: false,
  });
});

voiceRouter.post('/session/persist', async (c) => {
  let payload: Partial<PersistSessionPayload> = {};
  try {
    payload = await c.req.json<PersistSessionPayload>();
  } catch {
    payload = {};
  }

  const { session_id, duration, encrypted_payload, stage, username, transcript_text } = payload;
  const env = c.env || {};
  const secret = env.TEACHER_SECONDARY_PASSCODE || 'teacher-safe-2026';

  const effectiveSessionId = session_id || `sess_${Date.now()}`;
  const effectiveDuration = duration || 0;
  const effectiveStage = stage || 'Active_Listening';

  const evalApiKey = env.APIYI_API_KEY || env.OPENAI_API_KEY || env.MINIMAX_API_KEY;
  const evalResult = await evaluateTranscriptWithMiniMax(
    transcript_text || '',
    evalApiKey,
    env.MINIMAX_BASE_URL,
    env.APIYI_BASE_URL || env.OPENAI_BASE_URL
  );
  const isCrisisFlag = (payload.is_crisis || evalResult.isCrisis || evalResult.crisisLevel >= 3 || effectiveStage === 'Crisis_Escalation') ? 1 : 0;
  const crisisLevel = isCrisisFlag ? Math.max(3, evalResult.crisisLevel) : evalResult.crisisLevel;

  let encryptedIdentity = '';
  if (isCrisisFlag && username) {
    try {
      const realIdentityPayload = JSON.stringify({
        username,
        realName: username,
        gradeClass: '学生来访者',
        emergencyContact: '校园学生工作处 / 班主任',
        boothLocation: '校园心理驿站#01',
        crisisNote: evalResult.crisisSummary,
      });
      encryptedIdentity = await encryptAesGcm(realIdentityPayload, secret);
    } catch {
      encryptedIdentity = '';
    }
  }

  const deidentifiedReportObj = {
    sessionId: effectiveSessionId,
    generatedAt: Date.now(),
    durationSeconds: effectiveDuration,
    userDisplayName: username ? `${username[0]}*同学` : '来访者',
    cbtStageReached: effectiveStage,
    coreConcerns: evalResult.coreConcerns,
    cognitiveDistortions: evalResult.cognitiveDistortions,
    emotionalTrajectory: {
      initial: evalResult.crisisLevel >= 2 ? '高度压力与负性情绪反刍' : '中度情绪倾诉',
      final: effectiveStage === 'Crisis_Escalation' ? '危机紧急触发，已转专业干预' : '事实与情绪逐步分离',
      deltaNotes: evalResult.crisisSummary,
    },
    keyTakeaways: ['生命安全高于一切，困境终有解法。'],
    homeworkAction: '保持深呼吸，寻求老师或信任伙伴的支持。',
    isDeidentified: true,
  };

  const record: SessionRecord = {
    id: effectiveSessionId,
    session_id: effectiveSessionId,
    duration: effectiveDuration,
    stage: effectiveStage,
    is_crisis: isCrisisFlag,
    crisis_level: crisisLevel as any,
    crisis_summary: evalResult.crisisSummary,
    core_concerns: JSON.stringify(evalResult.coreConcerns),
    emotional_valence: evalResult.emotionalValence,
    encrypted_real_identity: encryptedIdentity || encrypted_payload || '',
    deidentified_report: JSON.stringify(deidentifiedReportObj),
    disposition_status: 'pending_contact',
    disposition_note: '',
    created_at: Math.floor(Date.now() / 1000),
  };

  await addSessionRecordToStore(env, record);

  if (isCrisisFlag && env.CRISIS_WEBHOOK_URL) {
    sendCrisisWebhook(env.CRISIS_WEBHOOK_URL, {
      sessionId: effectiveSessionId,
      crisisSummary: evalResult.crisisSummary,
      crisisLevel,
      occurredAt: new Date().toLocaleString('zh-CN'),
      boothLocation: '校园心理驿站#01',
      coreConcerns: evalResult.coreConcerns,
    }).catch(() => {});
  }

  if (env.DB && session_id) {
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS phone_sessions (
          id TEXT PRIMARY KEY,
          duration INTEGER,
          stage TEXT,
          encrypted_payload TEXT,
          created_at INTEGER DEFAULT (unixepoch())
        )
      `).run();

      await env.DB.prepare(`
        INSERT INTO phone_sessions (id, duration, stage, encrypted_payload)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          duration = excluded.duration,
          stage = excluded.stage,
          encrypted_payload = excluded.encrypted_payload
      `).bind(session_id, effectiveDuration, effectiveStage, encrypted_payload || '').run();
    } catch (dbErr) {
      console.error('[D1 Persist Error]:', dbErr);
    }
  }

  return c.json({
    ok: true,
    session_id: effectiveSessionId,
    is_crisis: Boolean(isCrisisFlag),
    crisis_level: crisisLevel,
  });
});

voiceRouter.post('/knowledge', async (c) => {
  let body: Partial<KnowledgeQueryPayload> = {};
  try {
    body = await c.req.json<KnowledgeQueryPayload>();
  } catch {
    body = {};
  }

  const query = (body.query || '').trim();
  const topK = body.topK || 2;
  const env = c.env || {};

  const retriever = new BgeRetriever({
    embeddingApiKey: (env as any).EMBEDDING_API_KEY || (env as any).APIYI_API_KEY,
    embeddingApiUrl: (env as any).EMBEDDING_API_URL,
    rerankApiKey: (env as any).RERANK_API_KEY,
    rerankApiUrl: (env as any).RERANK_API_URL,
  });

  const [strategyHint, searchResults] = await Promise.all([
    retriever.getStrategyHint(query, { topK: 1 }),
    retriever.search(query, { topK }),
  ]);

  const chunks = searchResults.map((r) => ({
    id: r.capsule.id,
    title: r.capsule.title,
    content: r.capsule.content,
    score: Number(r.score.toFixed(4)),
    category: r.capsule.category,
    empathyLead: r.capsule.empathyLead,
    socraticPivot: r.capsule.socraticPivot,
    tabooPhrases: r.capsule.tabooPhrases,
  }));

  return c.json({
    ok: true,
    query,
    strategy_hint: strategyHint,
    chunks,
  });
});
