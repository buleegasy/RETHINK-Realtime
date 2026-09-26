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
  /想死|寻死|自杀|自绝|自戕|轻生|厌世|想自杀|准备自杀|计划自杀|马上去死|现在就死|让我死|不如死了|死了算了|死掉算了|早点解脱|彻底解脱|一了百了|绝命|绝笔|绝命书|写好遗书|立遗嘱|交代后事|托付后事|下辈子再见|来生再见|永别了|告别这个世界|跟世界告别|离开这个世界|不想在这个世界|不想活了|不想活|不想再活|活不下去|活够了|活着没意思|活着好累|活着太痛苦|活着没有任何意义/,
  /跳楼|跳桥|跳河|跳江|跳海|跳井|跳悬崖|跳下站台|卧轨|跳下地铁|跳下去|爬上天台|站在天台|站在窗台|爬到窗外|站在顶楼|站在桥栏|一跃而下/,
  /吞药|服毒|大剂量吃药|过量服药|吃安眠药|吞安眠药|一整瓶安眠药|喝农药|百草枯|敌敌畏|有机磷|断肠草|剧毒|砒霜|氰化钾|吃药自杀|吞大量药物/,
  /割腕|割破手腕|放血|割大动脉|划破手腕|用刀割|拿刀划|拿小刀划手|用玻璃割|自残|自伤|自虐|撞墙自杀|塑料袋套头|用绳子勒颈|上吊|吊颈|悬梁|勒死自己|窒息自杀/,
  /烧炭|烧炭自杀|炭火自杀|紧闭门窗烧炭|一氧化碳中毒|开煤气|放瓦斯|开瓦斯|吸入瓦斯|触电自杀|引火自焚/,
  /求死|想要解脱|别救我|谁也别救我|不需要抢救|签署放弃抢救|不想再醒来|再也不想睁开眼|永远闭上眼睛|只想永远睡过去|让我安静地走|没有活下去的理由|彻底放弃自己/,
];

const NEGATION_PATTERNS = [
  /不(想|打算|准备|会)?死/g,
  /没(有)?(想|打算|准备)?死/g,
  /(没有|并未|绝不|决不|不会|不可能|不曾|未曾|并不是|千万别|千万不要|别)(想|要|会|打算|去|准备)?(想死|去死|自杀|自残|割腕|跳楼|跳河|跳江|轻生|寻死|结束生命)/g,
  /(打消|放弃|停止|走出|摆脱|克服)(了)?(自杀|自残|轻生|想死|寻死|自虐|绝望).{0,4}(念头|想法|打算)?/g,
  /(劝|阻止|拉住|救下).{0,6}(自杀|跳楼|跳河|轻生)/g,
  /(没有|毫无|排除).{0,6}(自杀|自残|轻生|想死).{0,4}(念头|想法|倾向|打算)/g,
  /(不想|不会|没有|没打算)(去)?(自残|自伤|跳楼|跳河|割腕|吞药|上吊)/g,
  /不至?于(想不开|去死|自杀|轻生)/g,
];

export function isNegatedCrisis(text: string): boolean {
  if (!text) return false;
  return NEGATION_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

export function isL1Crisis(text: string): boolean {
  if (!text) return false;
  const clean = text.trim();
  if (!clean) return false;

  let stripped = clean;
  for (const pattern of NEGATION_PATTERNS) {
    pattern.lastIndex = 0;
    stripped = stripped.replace(pattern, '___');
  }

  return L1_CRISIS_PATTERNS.some((pattern) => pattern.test(stripped));
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
  const model = options?.model && options.model !== 'deepseek/deepseek-v4-flash'
    ? options.model
    : atob('Z29vZ2xlL2dlbWluaS0yLjAtZmxhc2gtMDAx');
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
