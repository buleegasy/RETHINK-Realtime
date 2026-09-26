import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isL1Crisis, checkL2FlashSafety, checkDoubleSpeedSafety } from '../src/lib/safety-filter';
import { performShadowReasoning, generateStructuredReportWithFlash } from '../src/lib/deepseek-flash';
import app from '../src/index';

describe('思考与语音解耦架构验证 (OpenRouter DeepSeek V4 Flash 认知旁路管线)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('模块一：双速分层风险拦截链路 (L1 + L2)', () => {
    it('L1 本地即时硬过滤应在 0ms 级别精确匹配自杀自残等极端词汇', () => {
      expect(isL1Crisis('我觉得生活没有希望，想跳楼自杀')).toBe(true);
      expect(isL1Crisis('我已经买了大量安眠药准备吞药结束生命')).toBe(true);
      expect(isL1Crisis('真的不想在这个世界上活下去了，准备彻底解脱')).toBe(true);
      expect(isL1Crisis('今天数学考试好难，心情有点烦躁')).toBe(false);
      expect(isL1Crisis('')).toBe(false);
    });

    it('L2 DeepSeek V4 Flash 语义旁路熔断应基于单字符枚举精准断言', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '1',
              },
            },
          ],
        }),
      } as any);

      const isCrisis = await checkL2FlashSafety('我觉得如果我消失了，对所有人都是一种解脱', {
        apiKey: 'test-openrouter-key',
        model: 'deepseek/deepseek-v4-flash',
      });

      expect(isCrisis).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('checkDoubleSpeedSafety 命中 L1 时应免除网络请求直接瞬时熔断', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      const result = await checkDoubleSpeedSafety('我不想活了，准备割腕', {
        apiKey: 'test-key',
      });

      expect(result.isCrisis).toBe(true);
      expect(result.tier).toBe('L1');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('checkDoubleSpeedSafety 在 L1 未命中时应平滑流转至 L2 并返回合规状态', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '0',
              },
            },
          ],
        }),
      } as any);

      const result = await checkDoubleSpeedSafety('明天要开家长会了，我感觉非常焦虑', {
        apiKey: 'test-key',
        model: 'deepseek/deepseek-v4-flash',
      });

      expect(result.isCrisis).toBe(false);
      expect(result.tier).toBe('none');
    });
  });

  describe('模块二：异步影子推导与记忆抽取链路', () => {
    it('performShadowReasoning 能够结合上下文、知识库与学生意图解析结构化认知引导', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  cognitiveHint: '来访者存在灾难化认知，建议引导其列举最坏情况发生的客观概率。',
                  extractedName: '小宇',
                  coreConcern: '高考模考失利与亲子冲突',
                }),
              },
            },
          ],
        }),
      } as any);

      const result = await performShadowReasoning(
        '我是高三的小宇，这次模拟考考砸了，我爸肯定会对我彻底失望，我整个人生都完了',
        {
          history: [],
          cbtHints: ['运用去灾难化技术，检验最坏结果的发生概率与应对资源'],
          userName: '',
        },
        {
          apiKey: 'test-openrouter-key',
          model: 'deepseek/deepseek-v4-flash',
        }
      );

      expect(result).not.toBeNull();
      expect(result?.cognitiveHint).toContain('灾难化认知');
      expect(result?.extractedName).toBe('小宇');
      expect(result?.coreConcern).toContain('模考失利');
    });

    it('performShadowReasoning 在无 API Key 或网络异常时平滑回退至知识库策略', async () => {
      const result = await performShadowReasoning(
        '我总觉得自己什么事都做不好',
        {
          history: [],
          cbtHints: ['苏格拉底提问：寻找相反的反例事实打破绝对化判断'],
        },
        {
          apiKey: '',
        }
      );

      expect(result).not.toBeNull();
      expect(result?.cognitiveHint).toContain('苏格拉底提问');
    });
  });

  describe('模块三：结构化会话沉淀与持久化链路', () => {
    it('generateStructuredReportWithFlash 能正确解析 Strict JSON 报告与跟进建议', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  crisisLevel: 1,
                  isCrisis: false,
                  crisisSummary: '轻度人际适应压力，无自杀自残倾向',
                  coreConcerns: ['宿舍人际关系', '情绪困扰'],
                  emotionalValence: -0.3,
                  cognitiveDistortions: ['个人化归因'],
                  deidentifiedTranscript: '学生来访者表达了与室友作息不一致的困扰...',
                  actionItems: ['建议参加心理中心人际交往团体辅导', '关注下周宿舍调解进展'],
                }),
              },
            },
          ],
        }),
      } as any);

      const report = await generateStructuredReportWithFlash('学生: 我觉得宿舍室友都在针对我...', {
        apiKey: 'test-key',
        model: 'deepseek/deepseek-v4-flash',
      });

      expect(report.crisisLevel).toBe(1);
      expect(report.isCrisis).toBe(false);
      expect(report.coreConcerns).toContain('宿舍人际关系');
      expect(report.actionItems).toBeDefined();
      expect(report.actionItems?.length).toBeGreaterThan(0);
    });

    it('POST /api/voice/session/persist 在端点层正常调度 DeepSeek Flash 评估结果并完成归档', async () => {
      const res = await app.request('/api/voice/session/persist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: 'sess_test_decoupled_001',
          duration: 120,
          stage: 'Socratic_Questioning',
          username: '小明',
          transcript_text: '学生: 老师，我觉得最近压力很大。 智能体: 我听到了，愿不愿意跟我具体聊聊？',
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.ok).toBe(true);
      expect(data.report).toBeDefined();
      expect(data.report.sessionId).toBe('sess_test_decoupled_001');
    });
  });
});
