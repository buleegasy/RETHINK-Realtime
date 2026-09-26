import type { EvaluationResult } from './minimax-evaluator';
import { evaluateTranscriptRuleBased } from './minimax-evaluator';

export interface FlashOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  signal?: AbortSignal;
}

export interface ShadowReasoningContext {
  history: Array<{ role: string; content: string }>;
  cbtHints?: string[];
  userName?: string;
  currentStage?: string;
}

export interface ShadowReasoningResult {
  cognitiveHint: string;
  extractedName?: string;
  coreConcern?: string;
}

export interface StructuredSessionReport extends EvaluationResult {
  actionItems?: string[];
}

export async function performShadowReasoning(
  userText: string,
  context: ShadowReasoningContext,
  options?: FlashOptions
): Promise<ShadowReasoningResult | null> {
  const clean = (userText || '').trim();
  if (!clean) return null;

  const apiKey = options?.apiKey;
  if (!apiKey) {
    if (context.cbtHints && context.cbtHints.length > 0) {
      return {
        cognitiveHint: context.cbtHints[0],
      };
    }
    return null;
  }

  const baseUrl = (options?.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const model = options?.model || 'deepseek/deepseek-v4-flash';
  const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;

  const historyStr = (context.history || [])
    .slice(-4)
    .map((h) => `${h.role === 'user' ? '学生' : '助手'}: ${h.content}`)
    .join('\n');

  const cbtStr = (context.cbtHints || []).join('; ');

  const systemPrompt = `你是校园心理支持后台影子认知大脑。结合学生最新发言、对话历史与CBT检索结果，在后台异步完成深度思考，输出极简、直接的认知引导微提示（40字以内），指导前端语音助手在下一轮对话中自然引导学生。若识别到学生自我介绍的姓名或昵称，提取出来。严格以JSON格式返回：{"cognitiveHint": "引导微提示", "extractedName": "姓名或空", "coreConcern": "核心议题"}`;

  const userContent = `学生最新表述: """${clean}"""
对话背景:
${historyStr || '（无历史上下文）'}
CBT参考策略:
${cbtStr || '（通用倾听与共情）'}
当前已知姓名: ${context.userName || '未知'}`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://rethink.local',
        'X-Title': 'RETHINK Realtime Shadow Brain',
      },
      signal: options?.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.2,
        max_tokens: 150,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      if (context.cbtHints && context.cbtHints.length > 0) {
        return { cognitiveHint: context.cbtHints[0] };
      }
      return null;
    }

    const data: any = await res.json();
    const rawContent = data?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(rawContent);

    return {
      cognitiveHint: typeof parsed.cognitiveHint === 'string' ? parsed.cognitiveHint : (context.cbtHints?.[0] || ''),
      extractedName: typeof parsed.extractedName === 'string' && parsed.extractedName ? parsed.extractedName : undefined,
      coreConcern: typeof parsed.coreConcern === 'string' && parsed.coreConcern ? parsed.coreConcern : undefined,
    };
  } catch {
    if (context.cbtHints && context.cbtHints.length > 0) {
      return { cognitiveHint: context.cbtHints[0] };
    }
    return null;
  }
}

export async function generateStructuredReportWithFlash(
  transcript: string,
  options?: FlashOptions
): Promise<StructuredSessionReport> {
  const fallback = evaluateTranscriptRuleBased(transcript);
  const cleanTranscript = (transcript || '').trim();

  if (!cleanTranscript || !options?.apiKey) {
    return {
      ...fallback,
      actionItems: ['安排班级心育委员日常关怀', '必要时预约心理中心面询'],
    };
  }

  const baseUrl = (options?.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const model = options?.model || 'deepseek/deepseek-v4-flash';
  const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;

  const prompt = `你是中学校园心理危机干预与脱敏评估专家。请分析以下学生倾诉对话文本，严格返回 JSON 格式结果：
{
  "crisisLevel": 0到3的整数(0正常，1轻度，2中度压力，3自杀自残极高危),
  "isCrisis": 布尔值(crisisLevel>=3为true),
  "crisisSummary": "一句话风险判定说明",
  "coreConcerns": ["核心困扰议题，如学业焦虑、人际矛盾、亲子冲突等"],
  "emotionalValence": -1.0到1.0的浮点数(-1极其消极，0中立，1积极),
  "cognitiveDistortions": ["识别出的认知歪曲，如灾难化思维、非黑即白等"],
  "deidentifiedTranscript": "对原对话彻底脱敏后的文本(屏蔽姓名、班级、电话、住址等)",
  "actionItems": ["后续跟进事项清单1", "后续跟进事项清单2"]
}
待评估文本:
"""${cleanTranscript.slice(0, 4000)}"""`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
        'HTTP-Referer': 'https://rethink.local',
        'X-Title': 'RETHINK Session Reporter',
      },
      signal: options?.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      return {
        ...fallback,
        actionItems: ['安排班级心育委员日常关怀', '必要时预约心理中心面询'],
      };
    }

    const data: any = await res.json();
    const raw = data?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);

    const crisisLevelNum = typeof parsed.crisisLevel === 'number' ? parsed.crisisLevel : fallback.crisisLevel;
    const isCrisis = typeof parsed.isCrisis === 'boolean' ? parsed.isCrisis : crisisLevelNum >= 3;

    return {
      crisisLevel: (crisisLevelNum >= 0 && crisisLevelNum <= 3 ? crisisLevelNum : 0) as any,
      isCrisis,
      crisisSummary: typeof parsed.crisisSummary === 'string' ? parsed.crisisSummary : fallback.crisisSummary,
      coreConcerns: Array.isArray(parsed.coreConcerns) ? parsed.coreConcerns : fallback.coreConcerns,
      emotionalValence: typeof parsed.emotionalValence === 'number' ? parsed.emotionalValence : fallback.emotionalValence,
      cognitiveDistortions: Array.isArray(parsed.cognitiveDistortions) ? parsed.cognitiveDistortions : fallback.cognitiveDistortions,
      deidentifiedTranscript: typeof parsed.deidentifiedTranscript === 'string' ? parsed.deidentifiedTranscript : fallback.deidentifiedTranscript,
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : ['安排班级心育委员日常关怀', '必要时预约心理中心面询'],
    };
  } catch {
    return {
      ...fallback,
      actionItems: ['安排班级心育委员日常关怀', '必要时预约心理中心面询'],
    };
  }
}
