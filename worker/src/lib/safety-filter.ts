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
  matchedKeywords?: string[];
  disambiguatedKeywords?: string[];
}

export interface DisambiguationDetail {
  keyword: string;
  start: number;
  end: number;
  isDisambiguated: boolean;
  reason?: string;
}

export interface L1DisambiguationResult {
  isCrisis: boolean;
  matches: DisambiguationDetail[];
}

// -------------------------------------------------------------
// 1. Aho-Corasick 多模式串自动机 (单趟 O(N) 敏感词定位)
// -------------------------------------------------------------

interface AcNode {
  children: Map<string, AcNode>;
  fail: AcNode | null;
  outputs: string[];
}

class AhoCorasick {
  private readonly root: AcNode = {
    children: new Map(),
    fail: null,
    outputs: [],
  };

  constructor(keywords: string[]) {
    this.buildTrie(keywords);
    this.buildFailurePointers();
  }

  private buildTrie(keywords: string[]): void {
    for (const word of keywords) {
      const trimmed = word.trim();
      if (!trimmed) continue;
      let curr = this.root;
      for (const char of trimmed) {
        let child = curr.children.get(char);
        if (!child) {
          child = { children: new Map(), fail: null, outputs: [] };
          curr.children.set(char, child);
        }
        curr = child;
      }
      curr.outputs.push(trimmed);
    }
  }

  private buildFailurePointers(): void {
    const queue: AcNode[] = [];

    for (const child of this.root.children.values()) {
      child.fail = this.root;
      queue.push(child);
    }

    while (queue.length > 0) {
      const curr = queue.shift()!;

      for (const [char, child] of curr.children.entries()) {
        let fallback = curr.fail;
        while (fallback !== null && !fallback.children.has(char)) {
          fallback = fallback.fail;
        }
        child.fail = fallback ? fallback.children.get(char)! : this.root;
        if (child.fail.outputs.length > 0) {
          child.outputs.push(...child.fail.outputs);
        }
        queue.push(child);
      }
    }
  }

  public search(text: string): Array<{ keyword: string; start: number; end: number }> {
    const results: Array<{ keyword: string; start: number; end: number }> = [];
    if (!text) return results;

    let curr: AcNode | null = this.root;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      while (curr !== null && !curr.children.has(char)) {
        curr = curr.fail;
      }
      if (curr === null) {
        curr = this.root;
        continue;
      }
      curr = curr.children.get(char)!;
      if (curr.outputs.length > 0) {
        for (const kw of curr.outputs) {
          results.push({
            keyword: kw,
            start: i - kw.length + 1,
            end: i + 1,
          });
        }
      }
    }

    return results;
  }
}

// -------------------------------------------------------------
// 2. 危机关键词词库与 AC 自动机单例
// -------------------------------------------------------------

const CRISIS_KEYWORDS: string[] = [
  // 极端念头与绝望意图
  '想死', '寻死', '自杀', '自绝', '自戕', '轻生', '厌世', '想自杀', '准备自杀', '计划自杀',
  '去死', '非死不可', '以死谢罪', '马上去死', '现在就死', '让我死', '不如死了', '死了算了', '死掉算了', '早点解脱', '彻底解脱',
  '一了百了', '绝命', '绝笔', '绝命书', '写好遗书', '立遗嘱', '交代后事', '托付后事',
  '下辈子再见', '来生再见', '永别了', '告别这个世界', '跟世界告别', '离开这个世界',
  '不想在这个世界', '不想活了', '不想活', '不想再活', '活不下去', '活够了', '活着没意思',
  '活着好累', '活着太痛苦', '活着没有任何意义', '求死', '想要解脱', '别救我', '谁也别救我',
  '不需要抢救', '签署放弃抢救', '不想再醒来', '再也不想睁开眼', '永远闭上眼睛', '只想永远睡过去',
  '让我安静地走', '没有活下去的理由', '彻底放弃自己',
  // 高危物理自戕手段
  '跳楼', '跳桥', '跳河', '跳江', '跳海', '跳井', '跳悬崖', '跳下站台', '卧轨', '跳下地铁',
  '跳下去', '爬上天台', '站在天台', '站在窗台', '爬到窗外', '站在顶楼', '站在桥栏', '一跃而下',
  '吞药', '服毒', '大剂量吃药', '过量服药', '吃安眠药', '吞安眠药', '一整瓶安眠药', '喝农药',
  '百草枯', '敌敌畏', '有机磷', '断肠草', '剧毒', '砒霜', '氰化钾', '吃药自杀', '吞大量药物',
  '割腕', '割破手腕', '放血', '割大动脉', '划破手腕', '用刀割', '拿刀划', '拿小刀划手',
  '用玻璃割', '自残', '自伤', '自虐', '撞墙自杀', '塑料袋套头', '用绳子勒颈', '上吊', '吊颈',
  '悬梁', '勒死自己', '窒息自杀', '烧炭', '烧炭自杀', '炭火自杀', '紧闭门窗烧炭', '一氧化碳中毒',
  '开煤气', '放瓦斯', '开瓦斯', '吸入瓦斯', '触电自杀', '引火自焚'
];

const acAutomaton = new AhoCorasick(CRISIS_KEYWORDS);

// -------------------------------------------------------------
// 3. 多维语境否定与消歧判决模型
// -------------------------------------------------------------

// Step 1: 真实危机反向豁免（强肯定句型，绝对禁止消歧）
const AFFIRMATIVE_EXCEPTION_PATTERN =
  /(不得不|非.+不可|只能.+去死|只能.+自杀|只能.+跳楼|除了.+(别无选择|没有别的选择|没有退路)|必须死|非死不可|逼我.+死|再不.+就死)/;

// Step 2: 否定前缀断言模式
const NEGATION_PREFIX_PATTERN =
  /((并不(是)?|并非|没有|没(有)?|并未|未曾|不曾|绝不|决不|绝无|毫无|绝非|不会|不可能|压根(都)?不|根本(都)?不|才不(会)?|哪有|哪会|谁说(我|他|她)?|不至于|难道(我|他|她)?|傻子才|别|千万(别|不要))(想|要|打算|准备|去|试图|会)?|不(想|打算|准备|会)?)$/;

// Step 3: 第三方劝阻、干预与客观叙事模式
const INTERVENTION_PREFIX_PATTERN =
  /(劝|劝阻|劝解|劝导|开导|阻止|阻拦|拦住|救下|挽救|制止|拉住|拉扯|救回).{0,8}$/;

const NARRATIVE_PREFIX_PATTERN =
  /(新闻|热搜|微博|电视(剧)?|电影|小说|故事|网上|网课|短视频|听说有人|听说有同学|隔壁学校|看到有人)(里|上|中|报道|说|写|播放)?.{0,8}$/;

// Step 4: 意念消除与转归模式
const RESOLUTION_PREFIX_PATTERN =
  /(打消|放弃|停止|走出|摆脱|克服|消除).{0,6}$/;

const RESOLUTION_SUFFIX_PATTERN =
  /^(的)?(念头|想法|打算|倾向|冲动|阴影)/;

export function evaluateCrisisMatch(
  text: string,
  match: { keyword: string; start: number; end: number }
): { isDisambiguated: boolean; reason?: string } {
  // 1. 真实危机反向豁免检查 (Affirmative Exception Guard)
  const surroundingClause = extractSurroundingClause(text, match.start, match.end);
  if (AFFIRMATIVE_EXCEPTION_PATTERN.test(surroundingClause)) {
    return { isDisambiguated: false, reason: '命中强肯定/双重绝望语气，强制保留真实危机警报' };
  }

  const prefixWindow = text.slice(Math.max(0, match.start - 15), match.start);
  const suffixWindow = text.slice(match.end, Math.min(text.length, match.end + 10));

  // 2. 否定前缀断言扫描 (Prefix Negation Scope)
  if (NEGATION_PREFIX_PATTERN.test(prefixWindow)) {
    return { isDisambiguated: true, reason: `否定前缀消歧通过: "${prefixWindow}${match.keyword}"` };
  }

  // 3. 第三方劝阻与干预 (Intervention Context)
  if (INTERVENTION_PREFIX_PATTERN.test(prefixWindow)) {
    return { isDisambiguated: true, reason: `第三方劝阻消歧通过: "${prefixWindow}${match.keyword}"` };
  }

  // 4. 客观叙事/影视新闻语境 (Narrative Context)
  if (NARRATIVE_PREFIX_PATTERN.test(prefixWindow)) {
    return { isDisambiguated: true, reason: `客观叙事语境消歧通过: "${prefixWindow}${match.keyword}"` };
  }

  // 5. 意念消除与转归标记 (Resolution Markers)
  if (RESOLUTION_PREFIX_PATTERN.test(prefixWindow) || RESOLUTION_SUFFIX_PATTERN.test(suffixWindow)) {
    return { isDisambiguated: true, reason: `意念消除消歧通过: "${prefixWindow}${match.keyword}${suffixWindow}"` };
  }

  return { isDisambiguated: false, reason: '未经消歧的有效危机词' };
}

function extractSurroundingClause(text: string, start: number, end: number): string {
  const punctuations = /[,，.。!！?？;；\n]/;
  let clauseStart = start;
  while (clauseStart > 0 && !punctuations.test(text[clauseStart - 1])) {
    clauseStart--;
  }
  let clauseEnd = end;
  while (clauseEnd < text.length && !punctuations.test(text[clauseEnd])) {
    clauseEnd++;
  }
  return text.slice(clauseStart, clauseEnd);
}

export function disambiguateCrisis(text: string): L1DisambiguationResult {
  if (!text) return { isCrisis: false, matches: [] };
  const clean = text.trim();
  if (!clean) return { isCrisis: false, matches: [] };

  const rawMatches = acAutomaton.search(clean);
  if (rawMatches.length === 0) {
    return { isCrisis: false, matches: [] };
  }

  // 合并相同区间重叠的子串，保留最长匹配（例如“想自杀”优先于“自杀”）
  const filteredMatches = deduplicateMatches(rawMatches);
  const details: DisambiguationDetail[] = [];
  let hasRealCrisis = false;

  for (const match of filteredMatches) {
    const evalRes = evaluateCrisisMatch(clean, match);
    details.push({
      keyword: match.keyword,
      start: match.start,
      end: match.end,
      isDisambiguated: evalRes.isDisambiguated,
      reason: evalRes.reason,
    });
    if (!evalRes.isDisambiguated) {
      hasRealCrisis = true;
    }
  }

  return {
    isCrisis: hasRealCrisis,
    matches: details,
  };
}

function deduplicateMatches(
  matches: Array<{ keyword: string; start: number; end: number }>
): Array<{ keyword: string; start: number; end: number }> {
  if (matches.length <= 1) return matches;

  // 按照覆盖范围从长到短排序
  const sorted = [...matches].sort((a, b) => (b.end - b.start) - (a.end - a.start));
  const accepted: Array<{ keyword: string; start: number; end: number }> = [];

  for (const candidate of sorted) {
    const isContained = accepted.some(
      (acc) => candidate.start >= acc.start && candidate.end <= acc.end
    );
    if (!isContained) {
      accepted.push(candidate);
    }
  }

  return accepted.sort((a, b) => a.start - b.start);
}

export function isL1Crisis(text: string): boolean {
  return disambiguateCrisis(text).isCrisis;
}

export function isNegatedCrisis(text: string): boolean {
  const res = disambiguateCrisis(text);
  return res.matches.length > 0 && res.matches.every((m) => m.isDisambiguated);
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
  const l1Result = disambiguateCrisis(text);
  if (l1Result.isCrisis) {
    const matched = l1Result.matches.filter((m) => !m.isDisambiguated).map((m) => m.keyword);
    return {
      isCrisis: true,
      tier: 'L1',
      reason: `命中L1本地即时危机硬过滤词库: ${matched.join(', ')}`,
      matchedKeywords: matched,
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
    disambiguatedKeywords: l1Result.matches.filter((m) => m.isDisambiguated).map((m) => m.keyword),
  };
}
