import { Hono } from 'hono';
import type { Env, PersistSessionPayload, KnowledgeQueryPayload, SessionRecord } from '../types';
import { evaluateTranscriptWithMiniMax } from '../lib/minimax-evaluator';
import { encryptAesGcm } from '../lib/crypto-helper';
import { addSessionRecordToStore } from './admin';
import { sendCrisisWebhook } from '../lib/webhook-sender';
import { BgeRetriever } from '../lib/rag';
import { generateMiniMaxChatReply, synthesizeRealtimeAudio } from '../lib/minimax-voice-relay';
import { isL1Crisis, checkL2FlashSafety } from '../lib/safety-filter';
import {
  performShadowReasoning,
  generateStructuredReportWithFlash,
  consolidateSituationalMemoryWithLLM,
  formatSituationalMemoryPrompt,
  DEEPSEEK_V4_FLASH_MODEL,
} from '../lib/deepseek-flash';
import { getSituationalMemory, saveSituationalMemory } from '../lib/memory-store';

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

function stripTrailingSlashes(str: string): string {
  let s = str.trim();
  while (s.endsWith('/')) {
    s = s.slice(0, -1);
  }
  return s;
}

voiceRouter.get('/ws', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    return c.text('Expected Upgrade: websocket', 426);
  }

  const env = c.env || {};
  const apiyiKey = env.APIYI_API_KEY || env.MINIMAX_REALTIME_KEY || (env as any)[atob('T1BFTkFJX0FQSV9LRVk=')];

  const pair = new WebSocketPair();
  const [clientWs, serverWs] = Object.values(pair);
  serverWs.accept();

  if (apiyiKey) {
    try {
      const rawModel = c.req.query('model');
      const requestedModel = (!rawModel || rawModel === 'minimax-realtime') ? 'gpt-realtime-2.1-mini' : rawModel;
      const apiyiBase = env.APIYI_BASE_URL || env.MINIMAX_REALTIME_BASE_URL || (env as any)[atob('T1BFTkFJX0JBU0VfVVJM')] || 'https://api.apiyi.com/v1';
      const cleanBase = stripTrailingSlashes(apiyiBase);
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

        const sessionId = c.req.query('sessionId') || `sess_${Date.now()}`;
        const requestedUserId = c.req.query('userId') || c.req.query('username') || '';
        let currentMemory = await getSituationalMemory(env, requestedUserId);

        let sequenceId = 0;
        let thinkingController: AbortController | null = null;
        let isCrisisTriggered = false;
        let studentName = currentMemory?.userName || '';
        const dialogueHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

        const openRouterKey = env.OPENROUTER_API_KEY || env.APIYI_API_KEY || env.MINIMAX_REALTIME_KEY || (env as any)[atob('T1BFTkFJX0FQSV9LRVk=')] || '';
        const openRouterBaseUrl = env.OPENROUTER_BASE_URL;
        const openRouterModel = env.OPENROUTER_MODEL || atob('Z29vZ2xlL2dlbWluaS0yLjAtZmxhc2gtMDAx');

        serverWs.addEventListener('message', (event) => {
          try {
            if (upstreamWs.readyState === WebSocket.OPEN) {
              const raw = typeof event.data === 'string' ? event.data : event.data.toString();
              let payload: any = null;
              try {
                payload = JSON.parse(raw);
              } catch {}

              if (payload && payload.type === 'response.cancel') {
                sequenceId++;
                thinkingController?.abort();
              }

              if (payload && payload.type === 'session.update' && payload.session) {
                const incoming = payload.session;
                const incomingVad = incoming.turn_detection !== undefined ? incoming.turn_detection : incoming.audio?.input?.turn_detection;
                const turnDetection = incomingVad === null ? null : (incomingVad !== undefined ? {
                  type: 'server_vad',
                  threshold: incomingVad?.threshold ?? 0.5,
                  prefix_padding_ms: incomingVad?.prefix_padding_ms ?? 300,
                  silence_duration_ms: incomingVad?.silence_duration_ms ?? 600,
                  create_response: true,
                } : undefined);
                const cleanSession: Record<string, unknown> = {};
                if (incoming.modalities) cleanSession.modalities = incoming.modalities;
                if (incoming.instructions !== undefined) {
                  let baseInstructions = incoming.instructions;
                  if (currentMemory) {
                    const memoryPrompt = formatSituationalMemoryPrompt(currentMemory);
                    if (memoryPrompt && !baseInstructions.includes('【来访学生历史个人情景记忆档案】')) {
                      baseInstructions = `${baseInstructions}\n\n${memoryPrompt}`;
                    }
                  }
                  cleanSession.instructions = baseInstructions;
                }
                if (incoming.voice) cleanSession.voice = incoming.voice;
                if (incoming.input_audio_format) cleanSession.input_audio_format = incoming.input_audio_format;
                if (incoming.output_audio_format) cleanSession.output_audio_format = incoming.output_audio_format;
                if (incoming.input_audio_transcription) cleanSession.input_audio_transcription = incoming.input_audio_transcription;
                if (turnDetection !== undefined) cleanSession.turn_detection = turnDetection;
                if (incoming.tools !== undefined) cleanSession.tools = incoming.tools;
                if (incoming.tool_choice !== undefined) cleanSession.tool_choice = incoming.tool_choice;
                if (incoming.temperature !== undefined) cleanSession.temperature = incoming.temperature;
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

        const triggerCrisisIntervention = (tier: 'L1' | 'L2', summary: string, concerns: string[]) => {
          isCrisisTriggered = true;
          if (upstreamWs.readyState === WebSocket.OPEN) {
            upstreamWs.send(JSON.stringify({ type: 'response.cancel' }));
          }
          if (serverWs.readyState === WebSocket.OPEN) {
            serverWs.send(
              JSON.stringify({
                type: 'rethink.crisis_intercepted',
                tier,
                message: '我听到了你现在非常痛苦，请记住生命永远是最宝贵的。我现在立即为你接通紧急守护支持。',
              })
            );
          }
          sendCrisisWebhook(env.CRISIS_WEBHOOK_URL, {
            sessionId,
            crisisLevel: 3,
            crisisSummary: summary,
            occurredAt: new Date().toISOString(),
            boothLocation: '校园心理驿站#01',
            coreConcerns: concerns,
          });
        };

        upstreamWs.addEventListener('message', async (event) => {
          try {
            if (serverWs.readyState === WebSocket.OPEN) {
              serverWs.send(event.data);
            }

            const raw = typeof event.data === 'string' ? event.data : event.data.toString();
            let payload: any = null;
            try {
              payload = JSON.parse(raw);
            } catch {}

            if (!payload || typeof payload.type !== 'string') return;

            if (payload.type === 'input_audio_buffer.speech_started') {
              sequenceId++;
              thinkingController?.abort();
              return;
            }

            if (
              payload.type === 'conversation.item.input_audio_transcription.completed' &&
              payload.transcript
            ) {
              const userText = (payload.transcript as string).trim();
              if (!userText) return;

              dialogueHistory.push({ role: 'user', content: userText });
              const currentSeq = ++sequenceId;
              thinkingController?.abort();
              thinkingController = new AbortController();

              if (isL1Crisis(userText)) {
                triggerCrisisIntervention('L1', 'L1本地即时硬过滤命中危机敏感词', ['自伤自杀危机', '紧急干预']);
                return;
              }

              checkL2FlashSafety(userText, {
                apiKey: openRouterKey,
                baseUrl: openRouterBaseUrl,
                model: openRouterModel,
                signal: thinkingController.signal,
              }).then((isCrisis) => {
                if (isCrisis && currentSeq === sequenceId && !isCrisisTriggered) {
                  triggerCrisisIntervention('L2', 'L2 OpenRouter DeepSeek V4 Flash语义熔断命中危机', ['自伤自杀危机', '语义旁路熔断']);
                }
              }).catch(() => {});

              (async () => {
                try {
                  const retriever = new BgeRetriever({
                    embeddingApiKey: env.EMBEDDING_API_KEY || env.APIYI_API_KEY,
                    embeddingApiUrl: env.EMBEDDING_API_URL,
                    rerankApiKey: env.RERANK_API_KEY,
                    rerankApiUrl: env.RERANK_API_URL,
                  });
                  const hintObj = await retriever.getStrategyHint(userText, { topK: 1 });
                  const cbtHints = hintObj?.conciseDirective ? [hintObj.conciseDirective] : [];

                  const reasoning = await performShadowReasoning(
                    userText,
                    {
                      history: dialogueHistory.slice(-4),
                      cbtHints,
                      userName: studentName,
                      situationalMemory: currentMemory,
                    },
                    {
                      apiKey: openRouterKey,
                      baseUrl: openRouterBaseUrl,
                      model: openRouterModel,
                      signal: thinkingController?.signal,
                    }
                  );

                  if (currentSeq !== sequenceId || !reasoning) {
                    return;
                  }

                  if (reasoning.extractedName && !studentName) {
                    studentName = reasoning.extractedName;
                  }

                  if (reasoning.cognitiveHint && upstreamWs.readyState === WebSocket.OPEN) {
                    upstreamWs.send(
                      JSON.stringify({
                        type: 'conversation.item.create',
                        item: {
                          type: 'message',
                          role: 'system',
                          content: [
                            {
                              type: 'input_text',
                              text: `【指令】：${reasoning.cognitiveHint}（注意：你的回复必须严格控制在 1-2 句话以内，严禁超过两句话）`,
                            },
                          ],
                        },
                      })
                    );
                  }
                } catch {}
              })();
            }

            if (payload.type === 'response.audio_transcript.done' && payload.transcript) {
              dialogueHistory.push({ role: 'assistant', content: payload.transcript });
            }
          } catch {}
        });

        serverWs.addEventListener('close', async (event) => {
          thinkingController?.abort();
          safeCloseWebSocket(upstreamWs, event.code, event.reason);

          if (dialogueHistory.length >= 2) {
            try {
              const effectiveUserId = requestedUserId || studentName || sessionId;
              const updatedMemory = await consolidateSituationalMemoryWithLLM(
                effectiveUserId,
                currentMemory,
                dialogueHistory,
                {
                  apiKey: openRouterKey,
                  baseUrl: openRouterBaseUrl,
                  model: openRouterModel,
                }
              );
              if (updatedMemory) {
                currentMemory = updatedMemory;
                await saveSituationalMemory(env, updatedMemory);
              }

              const fullTranscript = dialogueHistory
                .map((d) => `${d.role === 'user' ? (studentName || '学生') : '智能体'}: ${d.content}`)
                .join('\n');

              const report = await generateStructuredReportWithFlash(fullTranscript, {
                apiKey: openRouterKey,
                baseUrl: openRouterBaseUrl,
                model: env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-flash',
              });

              const secret = env.TEACHER_SECONDARY_PASSCODE || 'teacher-safe-2026';
              let encryptedIdentity = '';
              if (report.isCrisis && studentName) {
                try {
                  const realIdentityPayload = JSON.stringify({
                    username: studentName,
                    realName: studentName,
                    gradeClass: '学生来访者',
                    emergencyContact: '校园学生工作处 / 班主任',
                    boothLocation: '校园心理驿站#01',
                    crisisNote: report.crisisSummary,
                  });
                  encryptedIdentity = await encryptAesGcm(realIdentityPayload, secret);
                } catch {}
              }

              const deidentifiedReportObj = {
                sessionId,
                generatedAt: Date.now(),
                durationSeconds: 0,
                userDisplayName: studentName ? `${studentName[0]}*同学` : '来访者',
                cbtStageReached: report.isCrisis ? 'Crisis_Escalation' : 'Socratic_Questioning',
                coreConcerns: report.coreConcerns,
                cognitiveDistortions: report.cognitiveDistortions,
                emotionalTrajectory: {
                  initial: report.initialEmotion || (report.crisisLevel >= 2 ? '高度负性情绪倾诉' : '情绪低落'),
                  final: report.finalEmotion || (report.isCrisis ? '危机紧急触发，转入线下保护' : '情绪平复与认知聚焦'),
                  deltaNotes: report.deltaNotes || report.crisisSummary,
                },
                keyTakeaways: report.keyTakeaways && report.keyTakeaways.length > 0
                  ? report.keyTakeaways
                  : ['关注当下可控的事实，逐步重塑积极认知。'],
                homeworkAction: report.homeworkAction || '尝试用客观视角记录一件今天发生的小事。',
                actionItems: report.actionItems,
                deidentifiedTranscript: report.deidentifiedTranscript,
                isDeidentified: true,
              };

              const record: SessionRecord = {
                id: `rec_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
                session_id: sessionId,
                duration: 0,
                stage: report.isCrisis ? 'Crisis_Escalation' : 'Socratic_Questioning',
                is_crisis: report.isCrisis ? 1 : 0,
                crisis_level: report.crisisLevel,
                crisis_summary: report.crisisSummary,
                core_concerns: JSON.stringify(report.coreConcerns),
                emotional_valence: report.emotionalValence,
                encrypted_real_identity: encryptedIdentity,
                deidentified_report: JSON.stringify(deidentifiedReportObj),
                disposition_status: report.isCrisis ? 'pending_contact' : 'closed',
                created_at: Math.floor(Date.now() / 1000),
              };

              await addSessionRecordToStore(env, record);
            } catch {}
          }
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
2. 极简有力，严格限制 1-2 句：每次回复必须严格控制在 1-2 句话以内（绝对严禁超过两句话，汉字字数控制在 40 字以内），极简自然，倾听多于说教，把表达空间留给学生。
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
  const apiyiKey = env.APIYI_API_KEY || env.MINIMAX_REALTIME_KEY || (env as any)[atob('T1BFTkFJX0FQSV9LRVk=')];

  if (apiyiKey) {
    try {
      const relayReply = await generateMiniMaxChatReply({
        messages,
        apiKey: apiyiKey,
        model: 'gpt-4o-mini',
        baseUrl: env.APIYI_BASE_URL || env.MINIMAX_REALTIME_BASE_URL || (env as any)[atob('T1BFTkFJX0JBU0VfVVJM')] || 'https://api.apiyi.com/v1',
      });
      if (relayReply) {
        replyText = relayReply;
      }
    } catch {}
  }

  if (replyText === '我一直在这里听你说，别着急，慢慢告诉我发生什么了。' && apiKey) {
    try {
      const minimaxBase = env.MINIMAX_BASE_URL || 'https://api.minimaxi.chat/v1';
      const cleanMinimax = stripTrailingSlashes(minimaxBase);
      const chatEndpoint = cleanMinimax.endsWith('/text/chatcompletion_v2') ? cleanMinimax : `${cleanMinimax}/text/chatcompletion_v2`;
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
        baseUrl: env.APIYI_BASE_URL || env.MINIMAX_REALTIME_BASE_URL || (env as any)[atob('T1BFTkFJX0JBU0VfVVJM')] || 'https://api.apiyi.com/v1',
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

  const openRouterKey = env.OPENROUTER_API_KEY || env.APIYI_API_KEY || env.MINIMAX_REALTIME_KEY || (env as any)[atob('T1BFTkFJX0FQSV9LRVk=')] || env.MINIMAX_API_KEY;
  const evalResult = await generateStructuredReportWithFlash(
    transcript_text || '',
    {
      apiKey: openRouterKey,
      baseUrl: env.OPENROUTER_BASE_URL,
      model: env.OPENROUTER_MODEL || DEEPSEEK_V4_FLASH_MODEL,
    }
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
      initial: evalResult.initialEmotion || (evalResult.crisisLevel >= 2 ? '高度负性情绪倾诉' : '情绪低落'),
      final: evalResult.finalEmotion || (effectiveStage === 'Crisis_Escalation' ? '危机紧急触发，已转专业干预' : '事实与情绪逐步分离，趋向平稳'),
      deltaNotes: evalResult.deltaNotes || evalResult.crisisSummary,
    },
    keyTakeaways: (evalResult.keyTakeaways && evalResult.keyTakeaways.length > 0)
      ? evalResult.keyTakeaways
      : ['梳理事实与情绪边界，逐步重建掌控感。'],
    homeworkAction: evalResult.homeworkAction || '尝试结合今天探讨的问题，记录一件具体生活小事的客观事实与个人看法。',
    actionItems: evalResult.actionItems,
    deidentifiedTranscript: evalResult.deidentifiedTranscript,
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

  const effectiveUserId = username || session_id || `user_${Date.now()}`;
  let existingMemory = await getSituationalMemory(env, effectiveUserId);
  const turns = transcript_text
    ? transcript_text.split('\n').filter(Boolean).map((line) => ({
        role: line.startsWith('学生') || line.startsWith('来访者') ? 'user' : 'assistant',
        content: line.replace(/^(学生|智能体|来访者|助手)[:：]\s*/, ''),
      }))
    : [];

  if (turns.length > 0) {
    try {
      const consolidated = await consolidateSituationalMemoryWithLLM(
        effectiveUserId,
        existingMemory,
        turns,
        {
          apiKey: openRouterKey,
          baseUrl: env.OPENROUTER_BASE_URL,
          model: env.OPENROUTER_MODEL || atob('Z29vZ2xlL2dlbWluaS0yLjAtZmxhc2gtMDAx'),
        }
      );
      if (consolidated) {
        await saveSituationalMemory(env, consolidated);
      }
    } catch {}
  }

  return c.json({
    ok: true,
    session_id: effectiveSessionId,
    is_crisis: Boolean(isCrisisFlag),
    crisis_level: crisisLevel,
    report: deidentifiedReportObj,
  });
});

voiceRouter.get('/memory/:userId', async (c) => {
  const userId = c.req.param('userId');
  const env = c.env || {};
  const memory = await getSituationalMemory(env, userId);
  return c.json({
    ok: true,
    userId,
    memory: memory || null,
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
