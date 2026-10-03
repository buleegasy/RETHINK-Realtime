/**
 * 实时语音核心服务层 (VoiceService)
 * 职责：作为语音服务的统一门面 (Facade)，编排 WebSocket 中继、REST 降级会话、知识库检索与评估持久化
 */

import type { Env, PersistSessionPayload } from '../types';
import { BgeRetriever } from '../lib/rag';
import { generateMiniMaxChatReply, synthesizeRealtimeAudio } from '../lib/minimax-voice-relay';
import { isL1Crisis } from '../lib/safety-filter';
import { CbtStateMachine, type CBTStage } from '../lib/cbt-fsm';
import { getSituationalMemory } from '../lib/memory-store';
import { RelaySessionCoordinator, type RelayQueryParams } from './voice/relay-session-coordinator';
import { SessionReporter } from './voice/session-reporter';
import { sendCrisisWebhook } from '../lib/webhook-sender';

export { BargeInCoordinator } from './voice/barge-in-coordinator';

export class VoiceService {
  /**
   * 处理全双工 WebSocket 实时语音流转与智能体影子大脑接入
   */
  public static async handleWebSocketRelay(
    serverWs: WebSocket,
    clientWs: WebSocket,
    env: Env,
    query: RelayQueryParams,
    ctx?: ExecutionContext,
  ): Promise<Response> {
    return RelaySessionCoordinator.startSession(serverWs, clientWs, env, query, ctx);
  }

  /**
   * 处理文本/降级 REST 语音对话
   */
  public static async handleChat(
    env: Env,
    body: { text?: string; stage?: string; history?: any[] },
    ctx?: ExecutionContext,
  ): Promise<{
    ok: boolean;
    error?: string;
    isCrisis?: boolean;
    nextStage?: string;
    reply?: string;
    audioBase64?: string;
  }> {
    const userText = (body.text || '').trim();
    const currentStage = body.stage || 'Active_Listening';
    const history = body.history || [];

    if (!userText) {
      return { ok: false, error: 'Empty text' };
    }

    if (isL1Crisis(userText)) {
      if (env.CRISIS_WEBHOOK_URL) {
        const webhookTask = sendCrisisWebhook(env.CRISIS_WEBHOOK_URL, {
          sessionId: `rest_crisis_${Date.now()}`,
          crisisLevel: 3,
          crisisSummary: 'REST降级对话命中L1危机敏感词',
          occurredAt: new Date().toISOString(),
          boothLocation: '校园心理驿站#01',
          coreConcerns: ['自伤自杀危机', '紧急干预'],
        }).catch((e) => console.warn('[VoiceService REST] Webhook 派发异常:', e));

        if (ctx?.waitUntil) {
          ctx.waitUntil(webhookTask);
        }
      }

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
        embeddingApiKey:
          env.EMBEDDING_API_KEY ||
          env.REALTIME_UPSTREAM_KEY ||
          env.MINIMAX_REALTIME_KEY ||
          env.APIYI_API_KEY,
        embeddingApiUrl: env.EMBEDDING_API_URL,
        rerankApiKey: env.RERANK_API_KEY,
        rerankApiUrl: env.RERANK_API_URL,
      });
      const hintObj = await retriever.getStrategyHint(userText, { topK: 1 });
      knowledgeHint = hintObj?.conciseDirective || '';
    } catch {}

    const cbtGuideSection = knowledgeHint ? `【专业 CBT 参考指南】${knowledgeHint}` : '';
    const systemPrompt = `你是 RETHINK 校园心理支持智能体。你使用 maple 音色，当前处于【${currentStage}】阶段。
你以同龄死党的平视、真诚、温和、松弛语气，为来访学生提供即时陪伴与结构化 CBT 认知行为支持。
【声音与口语核心准则】
1. 声音带有自然的呼吸感与温度，绝对严禁输出任何 Markdown 符号（如星号、反引号、代码块、列表编号）。
2. 极简有力，严格限制 1-2 句：每次回复必须严格控制在 1-2 句话以内（绝对严禁超过两句话，汉字字数控制在 40 字以内），极简自然，倾听多于说教，把表达空间留给学生。
3. 绝对严禁自言自语或输出无意义口头禅（如“听起来……”、“好呀”、“随时告诉我”等），学生沉默时保持静默。
4. 若学生告知了名字或昵称，在对话中亲切自然地称呼对方。
${cbtGuideSection}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-6).map((h: any) => ({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: h.content,
      })),
      { role: 'user', content: userText },
    ];

    let replyText = '我一直在这里听你说，别着急，慢慢告诉我发生什么了。';
    const upstreamKey =
      env.REALTIME_UPSTREAM_KEY || env.MINIMAX_REALTIME_KEY || env.APIYI_API_KEY || '';
    const upstreamBase =
      env.REALTIME_UPSTREAM_URL ||
      env.MINIMAX_REALTIME_BASE_URL ||
      env.APIYI_BASE_URL ||
      'https://api.apiyi.com/v1';

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
      const directFallback = await VoiceService.fetchDirectMiniMaxReply(env, messages);
      if (directFallback) {
        replyText = directFallback;
      }
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
   * 持久化保存会话记录与提炼个案简报
   */
  public static async handlePersistSession(
    env: Env,
    payload: Partial<PersistSessionPayload>,
    ctx?: ExecutionContext,
  ) {
    const { session_id, duration, encrypted_payload, stage, username, transcript_text, is_crisis } =
      payload;
    const effectiveSessionId = session_id || `sess_${Date.now()}`;

    return SessionReporter.generateAndPersist(
      env,
      {
        sessionId: effectiveSessionId,
        duration: duration || 0,
        stage: stage || 'Active_Listening',
        studentName: username || '',
        userId: username || effectiveSessionId,
        transcriptText: transcript_text || '',
        isCrisisExplicit: Boolean(is_crisis),
        encryptedPayload: encrypted_payload || '',
      },
      ctx,
    );
  }

  /**
   * 心理学专业知识与干预话术向量检索
   */
  public static async handleKnowledgeQuery(env: Env, query: string, topK: number = 2) {
    const retriever = new BgeRetriever({
      embeddingApiKey:
        env.EMBEDDING_API_KEY ||
        env.REALTIME_UPSTREAM_KEY ||
        env.MINIMAX_REALTIME_KEY ||
        env.APIYI_API_KEY,
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

  private static async fetchDirectMiniMaxReply(env: Env, messages: any[]): Promise<string | null> {
    try {
      const rawBase = env.MINIMAX_BASE_URL || 'https://api.minimaxi.chat/v1';
      const cleanMinimax = rawBase.trim().endsWith('/')
        ? rawBase.trim().slice(0, -1)
        : rawBase.trim();
      const chatEndpoint = cleanMinimax.endsWith('/text/chatcompletion_v2')
        ? cleanMinimax
        : `${cleanMinimax}/text/chatcompletion_v2`;
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
      return candidate ? candidate.replace(/[*#`_~]/g, '').trim() : null;
    } catch {
      return null;
    }
  }
}
