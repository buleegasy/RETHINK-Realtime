import type { CbtCapsule, RagSearchResult, RagSearchOptions, StrategyHint } from './types';
import { CBT_CAPSULES } from './cbt-capsules';

export class BgeRetriever {
  public static readonly MODEL = 'bge-m3';
  public static readonly DEFAULT_THRESHOLD = 0.5;

  private readonly embeddingApiKey: string;
  private readonly embeddingApiUrl: string;

  constructor(options?: {
    embeddingApiKey?: string;
    embeddingApiUrl?: string;
    rerankApiKey?: string;
    rerankApiUrl?: string;
  }) {
    this.embeddingApiKey = options?.embeddingApiKey || '';
    this.embeddingApiUrl = options?.embeddingApiUrl || 'https://api.apiyi.com/v1/embeddings';
  }

  public dotProduct(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) {
      return 0;
    }
    let dot = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
    }
    return dot;
  }

  public async fetchBgeEmbedding(text: string): Promise<number[] | null> {
    const cleanText = (text || '').trim();
    if (!cleanText || !this.embeddingApiKey) {
      return null;
    }

    try {
      const res = await fetch(this.embeddingApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.embeddingApiKey}`,
        },
        body: JSON.stringify({
          model: BgeRetriever.MODEL,
          input: cleanText,
        }),
      });

      if (!res.ok) {
        return null;
      }

      const data = (await res.json()) as any;
      if (Array.isArray(data?.data) && data.data[0]?.embedding) {
        return data.data[0].embedding;
      }
      return null;
    } catch {
      return null;
    }
  }

  public calculateBm25Score(query: string, capsule: CbtCapsule): number {
    const qLower = query.toLowerCase();
    let score = 0.42;

    for (const kw of capsule.keywords) {
      const kwLower = kw.toLowerCase();
      if (qLower.includes(kwLower)) {
        score += 0.16;
      } else {
        for (let i = 0; i <= kwLower.length - 2; i++) {
          const gram = kwLower.substring(i, i + 2);
          if (qLower.includes(gram)) {
            score += 0.06;
            break;
          }
        }
      }
    }

    if (
      qLower.includes(capsule.title.toLowerCase()) ||
      capsule.title.toLowerCase().includes(qLower)
    ) {
      score += 0.2;
    }

    const words = qLower.split(/[\s,，.。!！?？]+/).filter((w) => w.length >= 2);
    for (const w of words) {
      if (capsule.content.includes(w)) {
        score += 0.05;
      }
    }

    return Math.min(1.0, score);
  }

  public async search(query: string, options?: RagSearchOptions): Promise<RagSearchResult[]> {
    const cleanQuery = (query || '').trim();
    if (!cleanQuery) return [];

    const topK = options?.topK ?? 1;
    const threshold = options?.minThreshold ?? BgeRetriever.DEFAULT_THRESHOLD;
    const category = options?.categoryFilter;

    let pool = CBT_CAPSULES;
    if (category) {
      pool = pool.filter((c) => c.category === category);
    }

    const queryVec = await this.fetchBgeEmbedding(cleanQuery);

    const results: RagSearchResult[] = pool.map((capsule) => {
      if (
        queryVec &&
        Array.isArray(capsule.embedding) &&
        capsule.embedding.length === queryVec.length
      ) {
        const score = this.dotProduct(queryVec, capsule.embedding);
        return {
          capsule,
          score,
          matchedBy: 'vector',
        };
      }

      const bm25Score = this.calculateBm25Score(cleanQuery, capsule);
      return {
        capsule,
        score: bm25Score,
        matchedBy: 'keyword_bm25',
      };
    });

    return results
      .filter((r) => r.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  public async getStrategyHint(query: string, options?: RagSearchOptions): Promise<StrategyHint> {
    const results = await this.search(query, options);
    if (!results || results.length === 0) {
      return {
        status: 'no_relevant_context',
        conciseDirective:
          '未检索到特定CBT微干预胶囊。请保持同龄好友视角，以积极倾听和情绪共鸣为主，避免讲大道理或随意评价。每次回复必须在1-2句话以内。',
      };
    }

    const top = results[0].capsule;
    return {
      status: 'matched',
      category: top.category,
      topic: top.title,
      empathyGuideline: top.empathyLead,
      socraticPivot: top.socraticPivot,
      tabooReminder: `严禁踩雷有毒安慰：${top.tabooPhrases.join('、')}`,
      conciseDirective: `[CBT微干预引导: ${top.title}]\n1. 共情切入: ${top.empathyLead}\n2. 启发提问: ${top.socraticPivot}\n3. 禁语雷区: 严禁说“${top.tabooPhrases.slice(0, 3).join('、')}”。请用同龄好友口吻严格在1-2句话内温和回应，严禁超过两句话。`,
    };
  }
}
