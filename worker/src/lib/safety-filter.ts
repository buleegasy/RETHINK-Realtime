export interface SafetyCheckOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  signal?: AbortSignal;
}

export interface DoubleSpeedSafetyResult {
  isCrisis: boolean;
  tier: 'L1' | 'L2' | 'none';
  reason?: string;
}

const L1_CRISIS_PATTERNS = [
  /想死|寻死|自杀|自残|割腕|跳楼|跳河|跳桥|跳下去|不想活|活不下去|活着.*没意思|轻生|离开这个世界|不想在这个世界上/,
  /吞药|服毒|上吊|遗书|遗言|安眠药|结束生命|彻底解脱|绝命/,
];

export function isL1Crisis(text: string): boolean {
  if (!text) return false;
  const clean = text.trim();
  if (!clean) return false;
  return L1_CRISIS_PATTERNS.some((pattern) => pattern.test(clean));
}

export async function checkL2FlashSafety(
  text: string,
  options?: SafetyCheckOptions
): Promise<boolean> {
  const clean = (text || '').trim();
  if (!clean) return false;

  const apiKey = options?.apiKey;
  if (!apiKey) return false;

  const baseUrl = (options?.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const model = options?.model || 'deepseek/deepseek-v4-flash';
  const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://rethink.local',
        'X-Title': 'RETHINK Realtime Gateway',
      },
      signal: options?.signal,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: '你是校园心理危机与极端安全拦截哨兵。请判定输入文本是否存在自杀、自残、绝命、蓄意自戕或极高危危机意图。若有此类极端危险，只回复1；若属于日常倾诉、压力或一般对话，只回复0。绝对严禁输出任何多余字符，只输出一个字符（0或1）。',
          },
          {
            role: 'user',
            content: clean.slice(0, 500),
          },
        ],
        temperature: 0.0,
        max_tokens: 2,
      }),
    });

    if (!res.ok) return false;

    const data: any = await res.json();
    const reply = (data?.choices?.[0]?.message?.content || '').trim();
    return reply.startsWith('1') || reply.includes('1');
  } catch {
    return false;
  }
}

export async function checkDoubleSpeedSafety(
  text: string,
  options?: SafetyCheckOptions
): Promise<DoubleSpeedSafetyResult> {
  if (isL1Crisis(text)) {
    return {
      isCrisis: true,
      tier: 'L1',
      reason: '命中L1本地即时危机硬过滤词库',
    };
  }

  const isL2 = await checkL2FlashSafety(text, options);
  if (isL2) {
    return {
      isCrisis: true,
      tier: 'L2',
      reason: '命中L2 DeepSeek V4 Flash语义旁路熔断',
    };
  }

  return {
    isCrisis: false,
    tier: 'none',
  };
}
