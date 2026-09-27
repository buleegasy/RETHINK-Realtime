import type { Env } from '../../types';
import { BgeRetriever } from '../../lib/rag';
import { performShadowReasoning } from '../../lib/deepseek-flash';

export interface ShadowPipelineConfig {
  upstreamKey: string;
  openRouterKey: string;
  openRouterBaseUrl?: string;
  openRouterModel: string;
}

/**
 * 实时影子大脑认知推理管道 (ShadowReasoningPipeline)
 * 职责：检索 CBT 知识库、执行 DeepSeek V4 Flash 影子推理，并将认知干预指令注入上游网关
 */
export class ShadowReasoningPipeline {
  private retriever: BgeRetriever;

  constructor(
    private env: Env,
    private config: ShadowPipelineConfig,
    private upstreamWs: WebSocket
  ) {
    this.retriever = new BgeRetriever({
      embeddingApiKey: env.EMBEDDING_API_KEY || config.upstreamKey,
      embeddingApiUrl: env.EMBEDDING_API_URL,
      rerankApiKey: env.RERANK_API_KEY,
      rerankApiUrl: env.RERANK_API_URL,
    });
  }

  public async execute(params: {
    userText: string;
    dialogueHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
    studentName: string;
    situationalMemory: any;
    signal: AbortSignal;
    isTurnValid: () => boolean;
    onExtractedName?: (name: string) => void;
  }): Promise<void> {
    const { userText, dialogueHistory, studentName, situationalMemory, signal, isTurnValid, onExtractedName } = params;

    try {
      const hintObj = await this.retriever.getStrategyHint(userText, { topK: 1 });
      const cbtHints = hintObj?.conciseDirective ? [hintObj.conciseDirective] : [];

      const reasoning = await performShadowReasoning(
        userText,
        {
          history: dialogueHistory.slice(-4),
          cbtHints,
          userName: studentName,
          situationalMemory,
        },
        {
          apiKey: this.config.openRouterKey,
          baseUrl: this.config.openRouterBaseUrl,
          model: this.config.openRouterModel,
          signal,
        }
      );

      if (!isTurnValid() || !reasoning) {
        return;
      }

      if (reasoning.extractedName && onExtractedName) {
        onExtractedName(reasoning.extractedName);
      }

      if (reasoning.cognitiveHint) {
        this.injectCognitiveDirective(reasoning.cognitiveHint);
      }
    } catch {}
  }

  private injectCognitiveDirective(cognitiveHint: string): void {
    if (this.upstreamWs.readyState !== WebSocket.OPEN) return;
    this.upstreamWs.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: `【指令】：${cognitiveHint}（注意：你的回复必须严格控制在 1-2 句话以内，严禁超过两句话）`,
            },
          ],
        },
      })
    );
  }
}
