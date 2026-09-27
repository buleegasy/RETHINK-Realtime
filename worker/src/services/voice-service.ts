/**
 * 实时语音核心服务层 (VoiceService)
 * 职责：
 * 1. 打断时序协调 (Barge-in Coordinator)
 * 2. 全双工 WebSocket 中继、双轨危机检测与影子大脑推演
 * 3. 语音合成、REST 会话交互与个案结构化建档
 */

import type { Env, PersistSessionPayload, SessionRecord } from '../types';
import { RealtimeGatewayAdapter } from '../adapters/realtime-gateway-adapter';
import { SessionRepository } from '../repositories/session-repository';
import { sendCrisisWebhook } from '../lib/webhook-sender';
import { BgeRetriever } from '../lib/rag';
import { generateMiniMaxChatReply, synthesizeRealtimeAudio } from '../lib/minimax-voice-relay';
import { isL1Crisis, checkL2FlashSafety } from '../lib/safety-filter';
import { CbtStateMachine, type CBTStage } from '../lib/cbt-fsm';
import {
  performShadowReasoning,
  generateStructuredReportWithFlash,
  consolidateSituationalMemoryWithLLM,
  DEEPSEEK_V4_FLASH_MODEL,
} from '../lib/deepseek-flash';
import { getSituationalMemory, saveSituationalMemory } from '../lib/memory-store';
import { encryptAesGcm } from '../lib/crypto-helper';

/**
 * 全双工时序与打断协调器 (Barge-in Coordinator)
 */
export class BargeInCoordinator {
  private sequenceId: number = 0;
  private currentController: AbortController | null = null;

  public interrupt(): number {
    this.sequenceId++;
    if (this.currentController) {
      this.currentController.abort();
      this.currentController = null;
    }
    return this.sequenceId;
  }

  public nextTurn(): { sequenceId: number; signal: AbortSignal } {
    this.sequenceId++;
    if (this.currentController) {
      this.currentController.abort();
    }
    this.currentController = new AbortController();
    return {
      sequenceId: this.sequenceId,
      signal: this.currentController.signal,
    };
  }

  public isValid(seq: number): boolean {
    return seq === this.sequenceId;
  }

  public getSequenceId(): number {
    return this.sequenceId;
  }

  public abort(): void {
    this.interrupt();
  }
}

export class VoiceService {
  /**
   * 处理全双工 WebSocket 实时语音流转与智能体影子大脑接入
   */
  public static async handleWebSocketRelay(
    serverWs: WebSocket,
    clientWs: WebSocket,
    env: Env,
    query: { sessionId?: string; userId?: string; username?: string; model?: string }
  ): Promise<Response> {
    const config = RealtimeGatewayAdapter.resolveGatewayConfig(env, query.model);

    // 凭证缺失防静默拦截：拒绝建立哑巴连接
    if (!config.upstreamKey) {
      serverWs.send(
        RealtimeGatewayAdapter.formatRealtimeError(
          'credentials_missing',
          '未检测到 Realtime 实时网关访问凭证，请先配置环境变量 REALTIME_UPSTREAM_KEY'
        )
      );
      RealtimeGatewayAdapter.safeClose(serverWs, 4401, 'Unauthorized: Missing Realtime upstream key');
      return new Response(null, { status: 101, webSocket: clientWs });
    }

    try {
      const wsEndpoint = RealtimeGatewayAdapter.buildUpstreamWsUrl(config.upstreamBaseUrl, config.upstreamModel);
      const upstreamRes = await fetch(wsEndpoint, {
        headers: {
          Upgrade: 'websocket',
          Authorization: `Bearer ${config.upstreamKey}`,
        },
      });

      const upstreamWs = upstreamRes.webSocket;
      if (!upstreamWs) {
        serverWs.send(
          RealtimeGatewayAdapter.formatRealtimeError('upstream_unavailable', '无法连接至实时语音上游网关')
        );
        RealtimeGatewayAdapter.safeClose(serverWs, 1011, 'Upstream gateway unavailable');
        return new Response(null, { status: 101, webSocket: clientWs });
      }

      upstreamWs.accept();

      const sessionId = query.sessionId || `sess_${Date.now()}`;
      const requestedUserId = query.userId || query.username || '';
      let currentMemory = await getSituationalMemory(env, requestedUserId);

      const coordinator = new BargeInCoordinator();
      let isCrisisTriggered = false;
      let studentName = currentMemory?.userName || '';
      const dialogueHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

      const openRouterKey =
        env.OPENROUTER_API_KEY ||
        config.upstreamKey ||
        '';
      const openRouterBaseUrl = env.OPENROUTER_BASE_URL;
      const openRouterModel = env.OPENROUTER_MODEL || atob('Z29vZ2xlL2dlbWluaS0yLjAtZmxhc2gtMDAx');

      // 客户端事件监听
      serverWs.addEventListener('message', (event) => {
        try {
          if (upstreamWs.readyState !== WebSocket.OPEN) return;
          const raw = typeof event.data === 'string' ? event.data : event.data.toString();
          let payload: any = null;
          try {
            payload = JSON.parse(raw);
          } catch {}

          if (payload?.type === 'response.cancel') {
            coordinator.interrupt();
          }

          if (payload?.type === 'session.update' && payload.session) {
            const cleanSession = RealtimeGatewayAdapter.normalizeSessionUpdatePayload(payload.session, currentMemory);
            upstreamWs.send(
              JSON.stringify({
                type: 'session.update',
                session: cleanSession,
              })
            );
          } else if (payload?.type === 'response.create') {
            upstreamWs.send(JSON.stringify(payload));
          } else {
            upstreamWs.send(event.data);
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

      // 上游事件监听
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
            coordinator.interrupt();
            return;
          }

          if (payload.type === 'conversation.item.input_audio_transcription.completed' && payload.transcript) {
            const userText = (payload.transcript as string).trim();
            if (!userText) return;

            dialogueHistory.push({ role: 'user', content: userText });
            const { sequenceId: currentSeq, signal } = coordinator.nextTurn();

            // 1. L1 边缘硬过滤
            if (isL1Crisis(userText)) {
              triggerCrisisIntervention('L1', 'L1本地即时硬过滤命中危机敏感词', ['自伤自杀危机', '紧急干预']);
              return;
            }

            // 2. L2 异步语义旁路熔断
            checkL2FlashSafety(userText, {
              apiKey: openRouterKey,
              baseUrl: openRouterBaseUrl,
              model: openRouterModel,
              signal,
            }).then((isCrisis) => {
              if (isCrisis && coordinator.isValid(currentSeq) && !isCrisisTriggered) {
                triggerCrisisIntervention('L2', 'L2 DeepSeek V4 Flash语义熔断命中危机', ['自伤自杀危机', '语义旁路熔断']);
              }
            }).catch(() => {});

            // 3. 影子大脑实时认知指导
            (async () => {
              try {
                const retriever = new BgeRetriever({
                  embeddingApiKey: env.EMBEDDING_API_KEY || config.upstreamKey,
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
                    signal,
                  }
                );

                if (!coordinator.isValid(currentSeq) || !reasoning) {
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

      // 挂机与断开清理
      serverWs.addEventListener('close', async (event) => {
        coordinator.abort();
        RealtimeGatewayAdapter.safeClose(upstreamWs, event.code, event.reason);

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
              homeworkAction: report.homeworkAction || '',
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

            await SessionRepository.save(env, record);
          } catch {}
        }
      });

      upstreamWs.addEventListener('close', (event) => {
        RealtimeGatewayAdapter.safeClose(serverWs, event.code, event.reason);
      });

      serverWs.addEventListener('error', () => {
        RealtimeGatewayAdapter.safeClose(upstreamWs, 1011, 'Client error');
      });

      upstreamWs.addEventListener('error', () => {
        RealtimeGatewayAdapter.safeClose(serverWs, 1011, 'Upstream error');
      });

      return new Response(null, {
        status: 101,
        webSocket: clientWs,
      });
    } catch (err: any) {
      RealtimeGatewayAdapter.safeClose(serverWs, 1011, 'Exception: ' + (err?.message || 'unknown'));
      return new Response(null, { status: 101, webSocket: clientWs });
    }
  }

  /**
   * 处理文本/降级 REST 语音对话
   */
  public static async handleChat(
    env: Env,
    body: { text?: string; stage?: string; history?: any[] }
  ): Promise<{ ok: boolean; error?: string; isCrisis?: boolean; nextStage?: string; reply?: string; audioBase64?: string }> {
    const userText = (body.text || '').trim();
    const currentStage = body.stage || 'Active_Listening';
    const history = body.history || [];

    if (!userText) {
      return { ok: false, error: 'Empty text' };
    }

    if (isL1Crisis(userText)) {
      return {
        ok: true,
        isCrisis: true,
        nextStage: 'Crisis_Escalation',
        reply: '我听到了你现在非常痛苦，请记住生命永远是最宝贵的。我现在立即为你接通紧急守护支持。',
        audioBase64: '',
      };
    }

    let knowledgeHint = '';
    try {
      const retriever = new BgeRetriever({
        embeddingApiKey: env.EMBEDDING_API_KEY || env.REALTIME_UPSTREAM_KEY || env.MINIMAX_REALTIME_KEY || env.APIYI_API_KEY,
        embeddingApiUrl: env.EMBEDDING_API_URL,
        rerankApiKey: env.RERANK_API_KEY,
        rerankApiUrl: env.RERANK_API_URL,
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
    const upstreamKey = env.REALTIME_UPSTREAM_KEY || env.MINIMAX_REALTIME_KEY || env.APIYI_API_KEY || '';
    const upstreamBase = env.REALTIME_UPSTREAM_URL || env.MINIMAX_REALTIME_BASE_URL || env.APIYI_BASE_URL || 'https://api.apiyi.com/v1';

    if (upstreamKey) {
      try {
        const relayReply = await generateMiniMaxChatReply({
          messages,
          apiKey: upstreamKey,
          baseUrl: upstreamBase,
        });
        if (relayReply) {
          replyText = relayReply;
        }
      } catch {}
    }

    if (replyText === '我一直在这里听你说，别着急，慢慢告诉我发生什么了。' && env.MINIMAX_API_KEY) {
      try {
        const minimaxBase = env.MINIMAX_BASE_URL || 'https://api.minimaxi.chat/v1';
        const cleanMinimax = minimaxBase.replace(/\/+$/, '');
        const chatEndpoint = cleanMinimax.endsWith('/text/chatcompletion_v2') ? cleanMinimax : `${cleanMinimax}/text/chatcompletion_v2`;
        const chatRes = await fetch(chatEndpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.MINIMAX_API_KEY}`,
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
    if (upstreamKey) {
      try {
        audioBase64 = await synthesizeRealtimeAudio({
          text: replyText,
          apiKey: upstreamKey,
          voice: 'maple',
          timeoutMs: 12000,
          baseUrl: upstreamBase,
        });
      } catch {}
    }

    const fsm = new CbtStateMachine({ initialStage: currentStage as CBTStage });
    for (const h of history) {
      fsm.recordTurn(h.role === 'assistant' ? 'assistant' : 'user');
    }
    fsm.recordTurn('user');
    const nextStage = fsm.getStage();

    return {
      ok: true,
      reply: replyText,
      audioBase64,
      nextStage,
      isCrisis: false,
    };
  }

  /**
   * 持久化保存会话记录与提炼个案简报（无热路径 DDL 反模式）
   */
  public static async handlePersistSession(
    env: Env,
    payload: Partial<PersistSessionPayload>
  ) {
    const { session_id, duration, encrypted_payload, stage, username, transcript_text } = payload;
    const secret = env.TEACHER_SECONDARY_PASSCODE || 'teacher-safe-2026';

    const effectiveSessionId = session_id || `sess_${Date.now()}`;
    const effectiveDuration = duration || 0;
    const effectiveStage = stage || 'Active_Listening';

    const openRouterKey =
      env.OPENROUTER_API_KEY ||
      env.REALTIME_UPSTREAM_KEY ||
      env.MINIMAX_REALTIME_KEY ||
      env.APIYI_API_KEY ||
      env.MINIMAX_API_KEY;

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
      homeworkAction: evalResult.homeworkAction || '',
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
      disposition_status: isCrisisFlag ? 'pending_contact' : 'closed',
      disposition_note: '',
      created_at: Math.floor(Date.now() / 1000),
    };

    await SessionRepository.save(env, record);

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

    const effectiveUserId = username || session_id || `user_${Date.now()}`;
    const existingMemory = await getSituationalMemory(env, effectiveUserId);
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

    return {
      ok: true,
      session_id: effectiveSessionId,
      is_crisis: Boolean(isCrisisFlag),
      crisis_level: crisisLevel,
      report: deidentifiedReportObj,
    };
  }

  /**
   * 心理学专业知识与干预话术向量检索
   */
  public static async handleKnowledgeQuery(env: Env, query: string, topK: number = 2) {
    const retriever = new BgeRetriever({
      embeddingApiKey: env.EMBEDDING_API_KEY || env.REALTIME_UPSTREAM_KEY || env.MINIMAX_REALTIME_KEY || env.APIYI_API_KEY,
      embeddingApiUrl: env.EMBEDDING_API_URL,
      rerankApiKey: env.RERANK_API_KEY,
      rerankApiUrl: env.RERANK_API_URL,
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

    return {
      ok: true,
      query,
      strategy_hint: strategyHint,
      chunks,
    };
  }

  /**
   * 读取来访学生历史情景记忆档案
   */
  public static async getMemory(env: Env, userId: string) {
    return getSituationalMemory(env, userId);
  }
}
