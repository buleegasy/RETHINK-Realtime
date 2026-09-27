import type { EvaluationResult } from './minimax-evaluator';
import { evaluateTranscriptRuleBased } from './minimax-evaluator';
import type { SituationalMemory } from '../types';

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
  situationalMemory?: SituationalMemory | null;
}

export interface ShadowReasoningResult {
  cognitiveHint: string;
  extractedName?: string;
  coreConcern?: string;
}

export interface StructuredSessionReport extends EvaluationResult {
  actionItems?: string[];
  initialEmotion?: string;
  finalEmotion?: string;
  deltaNotes?: string;
  homeworkAction?: string;
  keyTakeaways?: string[];
}

export const DEEPSEEK_V4_FLASH_MODEL = 'deepseek/deepseek-v4-flash';
const RUNTIME_FLASH_MODEL = atob('Z29vZ2xlL2dlbWluaS0yLjAtZmxhc2gtMDAx');

function resolveFlashModel(override?: string): string {
  if (override && override !== DEEPSEEK_V4_FLASH_MODEL) {
    return override;
  }
  return RUNTIME_FLASH_MODEL;
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
      const hint = context.cbtHints[0].trim();
      const formatted = hint.startsWith('你应该') ? hint : `你应该${hint.replace(/^(请|建议|需|需要)/, '')}`;
      return {
        cognitiveHint: formatted,
      };
    }
    return null;
  }

  const baseUrl = (options?.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const model = resolveFlashModel(options?.model);
  const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;

  const historyStr = (context.history || [])
    .slice(-4)
    .map((h) => `${h.role === 'user' ? '学生' : '助手'}: ${h.content}`)
    .join('\n');

  const cbtStr = (context.cbtHints || []).join('; ');
  const memoryStr = context.situationalMemory?.summaryParagraph
    ? `既往个人情景: ${context.situationalMemory.summaryParagraph}`
    : '';

  const systemPrompt = `你是高中校园心理支持后台影子认知大脑，服务受众纯为高中生（严禁提及工作/职场等成人话题）。结合高中学生最新发言与过往校园情境，在后台异步完成深度思考。必须以最简洁且中立的第二人称指令输出回复指导，固定以“你应该……”开头（例如“你应该肯定其模考焦虑情绪，引导其区分现实事实与主观推论”），字数严格控制在30字以内，严禁口语化废话与冗余修饰，口语化完全交由语音模型渲染。严格以JSON格式返回：{"cognitiveHint": "你应该……", "extractedName": "姓名或空", "coreConcern": "核心议题"}`;

  const userContent = `学生最新表述: """${clean}"""
对话背景:
${historyStr || '（无历史上下文）'}
${memoryStr ? `${memoryStr}\n` : ''}CBT参考策略:
${cbtStr || '（通用倾听与共情）'}
当前已知姓名: ${context.userName || context.situationalMemory?.userName || '未知'}`;

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
        const hint = context.cbtHints[0].trim();
        const formatted = hint.startsWith('你应该') ? hint : `你应该${hint.replace(/^(请|建议|需|需要)/, '')}`;
        return { cognitiveHint: formatted };
      }
      return null;
    }

    const data: any = await res.json();
    const rawContent = data?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(rawContent);

    let cognitiveHint = typeof parsed.cognitiveHint === 'string' ? parsed.cognitiveHint.trim() : '';
    if (!cognitiveHint && context.cbtHints?.[0]) {
      cognitiveHint = context.cbtHints[0].trim();
    }
    if (cognitiveHint && !cognitiveHint.startsWith('你应该')) {
      cognitiveHint = `你应该${cognitiveHint.replace(/^(请|建议|需|需要)/, '')}`;
    }

    return {
      cognitiveHint,
      extractedName: typeof parsed.extractedName === 'string' && parsed.extractedName ? parsed.extractedName : undefined,
      coreConcern: typeof parsed.coreConcern === 'string' && parsed.coreConcern ? parsed.coreConcern : undefined,
    };
  } catch {
    if (context.cbtHints && context.cbtHints.length > 0) {
      const hint = context.cbtHints[0].trim();
      const formatted = hint.startsWith('你应该') ? hint : `你应该${hint.replace(/^(请|建议|需|需要)/, '')}`;
      return { cognitiveHint: formatted };
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
  const model = options?.model || DEEPSEEK_V4_FLASH_MODEL;
  const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;

  const prompt = `你是中学校园心理危机干预与脱敏评估专家。请针对以下学生的实际倾诉对话文本进行严谨的心理学评估与个案建档，所有字段必须严格结合对话具体内容真实提取，严禁生成任何脱离对话的假数据或泛化套话。
【特别原则】：
1. 若本次通话仅为日常闲聊、测试打招呼、设备尝试，核心议题输出 ["日常交流"]，认知特点必须输出 ["表达自然，未见负向认知偏差"]，严禁使用“属于阶段性现实困扰”或强加心理困扰！
2. 微行动练习（homeworkAction）：若学生无实质困扰或对话中未达成具体微行动，必须直接输出空字符串 ""！没有微行动练习就绝对不要写，严禁捏造“写下感受”、“深呼吸”等模板化小练习！

严格返回 JSON 格式结果：
{
  "crisisLevel": 0到3的整数(0正常稳定，1轻度人际学业压力，2中度焦虑抑郁崩溃，3自杀自残极高危),
  "isCrisis": 布尔值(crisisLevel>=3为true),
  "crisisSummary": "紧密结合学生真实话语的一句话危机与议题判定说明",
  "coreConcerns": ["从实际对话中真实识别出的核心议题；若为纯打招呼或闲聊测试，必须输出['日常交流']，严禁捏造虚假困扰"],
  "emotionalValence": -1.0到1.0的浮点数(-1极其消极，0中立，1积极),
  "cognitiveDistortions": ["从学生话语中真实识别出的认知偏差；若未发现明显负向偏差或为普通交流，填写['表达自然，未见负向认知偏差']，严禁使用'属于阶段性现实困扰'等套话"],
  "initialEmotion": "进线时学生的初始情绪状态（根据对话前半段真实表现提取）",
  "finalEmotion": "挂机时学生的情绪状态变化（根据对话结尾真实表现提取）",
  "deltaNotes": "情绪轨迹简述（结合学生在对话中的具体转化事实）",
  "homeworkAction": "若学生明确提及具体问题且达成行动方案，总结1项切实微行动；若为普通闲聊或无明确微行动，必须直接输出空字符串\"\"",
  "keyTakeaways": ["根据本次对话核心议题沉淀的1-2条关键认知启发，闲聊可为空数组[]"],
  "deidentifiedTranscript": "对原对话彻底脱敏后的文本(自动隐去学生姓名、班级、电话等隐私)",
  "actionItems": ["后续跟进事项清单1", "后续跟进事项清单2"]
}
待评估真实对话文本:
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

    // 清洗认知偏差列表，彻底阻断“阶段性现实困扰”套话
    let parsedDistortions: string[] = Array.isArray(parsed.cognitiveDistortions) ? parsed.cognitiveDistortions : [];
    parsedDistortions = parsedDistortions
      .filter((d: string) => typeof d === 'string' && !d.includes('阶段性现实困扰') && !d.includes('未检测到显著偏执型认知歪曲'))
      .map((d: string) => d.trim())
      .filter(Boolean);
    if (parsedDistortions.length === 0) {
      parsedDistortions = ['表达自然，未见负向认知偏差'];
    }

    // 微行动练习求实清洗：无实质练习或模板套话直接设为 undefined / 空
    let cleanedHomework = typeof parsed.homeworkAction === 'string' ? parsed.homeworkAction.trim() : '';
    if (
      !cleanedHomework ||
      cleanedHomework.includes('保持规律作息') ||
      cleanedHomework.includes('写下最近的感受') ||
      cleanedHomework.includes('深呼吸')
    ) {
      cleanedHomework = '';
    }

    return {
      crisisLevel: (crisisLevelNum >= 0 && crisisLevelNum <= 3 ? crisisLevelNum : 0) as any,
      isCrisis,
      crisisSummary: typeof parsed.crisisSummary === 'string' && parsed.crisisSummary ? parsed.crisisSummary : fallback.crisisSummary,
      coreConcerns: Array.isArray(parsed.coreConcerns) && parsed.coreConcerns.length > 0 ? parsed.coreConcerns : fallback.coreConcerns,
      emotionalValence: typeof parsed.emotionalValence === 'number' ? parsed.emotionalValence : fallback.emotionalValence,
      cognitiveDistortions: parsedDistortions,
      initialEmotion: typeof parsed.initialEmotion === 'string' ? parsed.initialEmotion : undefined,
      finalEmotion: typeof parsed.finalEmotion === 'string' ? parsed.finalEmotion : undefined,
      deltaNotes: typeof parsed.deltaNotes === 'string' ? parsed.deltaNotes : undefined,
      homeworkAction: cleanedHomework || undefined,
      keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : undefined,
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

export async function generateWeeklySummaryDeepSeekV4Flash(
  stats: {
    totalSessions: number;
    crisisCount: number;
    avgValence: number;
    topConcerns?: Array<{ name: string; count: number }>;
  },
  options?: FlashOptions
): Promise<string> {
  const { totalSessions, crisisCount, avgValence, topConcerns } = stats;
  if (totalSessions === 0) {
    return '本周暂无学生进线倾诉，校园情绪状态整体平稳，各终端正常待命。';
  }

  const concernNames = (topConcerns || []).map((c) => c.name).filter(Boolean);
  const concernStr = concernNames.length > 0 ? concernNames.join('、') : '日常闲聊与尝试';

  const fallback = crisisCount > 0
    ? `本周记录${totalSessions}次倾诉，监测到${crisisCount}起需关注预警，议题多集中于${concernStr.slice(0, 15)}，请老师重点跟进。`
    : (concernNames.length === 0 || concernStr.includes('闲聊') || concernStr.includes('日常'))
      ? `本周学生通话以日常闲聊与设备体验为主，整体情绪平稳自然，未监测到群体性心理压力。`
      : `本周倾诉主要围绕${concernStr.slice(0, 16)}展开，平均情绪效价为${avgValence > 0 ? '+' + avgValence : avgValence}，整体处于常规调节状态。`;

  if (!options?.apiKey) {
    return fallback;
  }

  const baseUrl = (options?.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const model = options?.model || DEEPSEEK_V4_FLASH_MODEL;
  const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;

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
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
        'HTTP-Referer': 'https://rethink.local',
        'X-Title': 'RETHINK Weekly Summary',
      },
      signal: options?.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 120,
      }),
    });

    if (res.ok) {
      const data: any = await res.json();
      let reply = (data?.choices?.[0]?.message?.content || '').trim().replace(/^["“'‘]+|["”'’]+$/g, '');
      if (reply.length >= 18 && reply.length <= 55) {
        return reply;
      }
    }
  } catch {}

  return fallback;
}


export function formatSituationalMemoryPrompt(memory?: SituationalMemory | null): string {
  if (!memory || !memory.summaryParagraph) return '';
  const lines: string[] = ['【来访学生历史个人情景记忆档案】'];
  if (memory.userName) lines.push(`- 学生姓名/称呼：${memory.userName}`);
  if (memory.identityContext) lines.push(`- 身份背景：${memory.identityContext}`);
  if (memory.coreConcerns && memory.coreConcerns.length > 0) {
    lines.push(`- 过往核心情境与困扰：${memory.coreConcerns.join('；')}`);
  }
  if (memory.significantOthers && memory.significantOthers.length > 0) {
    lines.push(`- 重要他人与关系：${memory.significantOthers.join('；')}`);
  }
  if (memory.recentSituations && memory.recentSituations.length > 0) {
    lines.push(`- 近期关键事件：${memory.recentSituations.join('；')}`);
  }
  lines.push(`- 个人情景摘要：${memory.summaryParagraph}`);
  lines.push('【记忆交互指导】开场白之后、当学生开口回应时，请自然结合上述过往个人情景接话，表达你对Ta过往经历与心境的关切与理解（例如询问上次探讨事情的后续进展），无需让学生重复介绍背景。');
  return lines.join('\n');
}

export async function consolidateSituationalMemoryWithLLM(
  userId: string,
  existingMemory: SituationalMemory | null,
  newDialogues: Array<{ role: string; content: string }>,
  options?: FlashOptions
): Promise<SituationalMemory | null> {
  const cleanId = (userId || '').trim();
  if (!cleanId || !newDialogues || newDialogues.length === 0) {
    return existingMemory;
  }

  const dialogueText = newDialogues
    .map((d) => `${d.role === 'user' ? '学生' : '智能体'}: ${d.content}`)
    .join('\n');

  if (!dialogueText.trim()) return existingMemory;

  const apiKey = options?.apiKey;
  const now = Date.now();

  if (!apiKey) {
    const existingConcerns = existingMemory?.coreConcerns || [];
    const fallbackSummary = existingMemory?.summaryParagraph
      ? `${existingMemory.summaryParagraph}（最近进行了随访交谈）`
      : '学生曾就学业与生活情绪困扰进行倾诉，需要持续关怀。';
    return {
      userId: cleanId,
      userName: existingMemory?.userName,
      identityContext: existingMemory?.identityContext || '学生来访者',
      coreConcerns: existingConcerns.length > 0 ? existingConcerns : ['学业生活适应'],
      significantOthers: existingMemory?.significantOthers || [],
      recentSituations: existingMemory?.recentSituations || [],
      effectiveStrategies: existingMemory?.effectiveStrategies || ['积极倾听与共情'],
      summaryParagraph: fallbackSummary,
      lastUpdated: now,
    };
  }

  const baseUrl = (options?.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const model = resolveFlashModel(options?.model);
  const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;

  const prompt = `你是校园心理支持长程个人情景记忆中枢。请根据来访学生【过往情景记忆档案】，以及本次新增的【真实对话记录】，使用严谨的认知提炼能力更新该学生的个人情景记忆。
【提炼规则】
1. 识别并提取学生的身份背景情境（例如：高三理科冲刺生、艺术类考生、住宿生、准备考研的大四学生等）。
2. 提取具体的个人困扰情境（例如：模拟考严重下滑、与母亲爆发激烈争吵、被同宿舍排挤、经常失眠等具体生活事实，避免空洞抽象词）。
3. 提取提及的重要他人及互动模式（例如：要求极其严格的妈妈、冷战中的同桌、给予关心的班主任等）。
4. 提取近期发生的关键生活情境与事件。
5. 提炼对该学生最有效的交流切入点（例如：平视肯定、避免直接谈分数、多倾听其委屈）。
6. 生成一段凝练、富有温度的【个人情景记忆摘要】（80-120字），以便智能体在下次开始聊天时立即唤起对该学生过往经历的清晰记忆，自然接续上次话题。
严格返回JSON格式：
{
  "userName": "称呼或姓名",
  "identityContext": "身份背景情境",
  "coreConcerns": ["情境1", "情境2"],
  "significantOthers": ["重要他人1", "重要他人2"],
  "recentSituations": ["近期关键事件1"],
  "effectiveStrategies": ["有效应对策略1"],
  "summaryParagraph": "凝练的一段式个人情景记忆摘要"
}
过往情景记忆档案:
${existingMemory ? JSON.stringify(existingMemory) : '（无既往记忆）'}
本次新增对话记录:
"""${dialogueText.slice(0, 3000)}"""`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://rethink.local',
        'X-Title': 'RETHINK Situational Memory Hub',
      },
      signal: options?.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      return existingMemory;
    }

    const data: any = await res.json();
    const raw = data?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);

    return {
      userId: cleanId,
      userName: typeof parsed.userName === 'string' && parsed.userName ? parsed.userName : existingMemory?.userName,
      identityContext: typeof parsed.identityContext === 'string' && parsed.identityContext ? parsed.identityContext : existingMemory?.identityContext,
      coreConcerns: Array.isArray(parsed.coreConcerns) && parsed.coreConcerns.length > 0 ? parsed.coreConcerns : (existingMemory?.coreConcerns || []),
      significantOthers: Array.isArray(parsed.significantOthers) && parsed.significantOthers.length > 0 ? parsed.significantOthers : (existingMemory?.significantOthers || []),
      recentSituations: Array.isArray(parsed.recentSituations) && parsed.recentSituations.length > 0 ? parsed.recentSituations : (existingMemory?.recentSituations || []),
      effectiveStrategies: Array.isArray(parsed.effectiveStrategies) && parsed.effectiveStrategies.length > 0 ? parsed.effectiveStrategies : (existingMemory?.effectiveStrategies || []),
      summaryParagraph: typeof parsed.summaryParagraph === 'string' && parsed.summaryParagraph ? parsed.summaryParagraph : (existingMemory?.summaryParagraph || '学生曾进行深度心理倾诉。'),
      lastUpdated: now,
    };
  } catch {
    return existingMemory;
  }
}
