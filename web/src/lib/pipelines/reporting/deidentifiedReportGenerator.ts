import type { SanitizedCbtReport } from '../../../types';
import type { IReportGenerator, ReportGenerationInput } from './types';

export class DeidentifiedCbtReportGenerator implements IReportGenerator {
  public readonly name = 'DeidentifiedCbtReportGenerator';

  private readonly phoneRegex = /(?:\+?86)?\s*(1[3-9]\d)\d{4}(\d{4})/g;
  private readonly emailRegex =
    /([a-zA-Z0-9_.+-])[a-zA-Z0-9_.+-]*@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)/g;
  private readonly idCardRegex = /(\d{6})\d{8}(\w{4})/g;

  public deidentifyText(text: string): string {
    if (!text) return '';
    return text
      .replace(this.phoneRegex, '$1****$2')
      .replace(this.emailRegex, '$1***@$2')
      .replace(this.idCardRegex, '$1********$2');
  }

  public deidentifyName(rawName?: string): string {
    if (!rawName || rawName.trim().length === 0) {
      return '来访者';
    }
    const clean = rawName.trim();
    if (clean.length === 1) return `${clean}同学`;
    if (clean.length === 2) return `${clean[0]}*`;
    return `${clean[0]}*${clean.slice(-1)}`;
  }

  public async generate(input: ReportGenerationInput): Promise<SanitizedCbtReport> {
    const { sessionId, durationSeconds, stageReached, rawUserName, turns } = input;
    const userDisplayName = this.deidentifyName(rawUserName);

    const userTurns = turns.filter((t) => t.role === 'user');
    const userSpeechList = userTurns
      .map((t) => this.deidentifyText(t.content).trim())
      .filter(Boolean);

    const primaryUtterance = userSpeechList[0] || '';
    const mainTopic = primaryUtterance ? `“${primaryUtterance.slice(0, 24)}...”` : '本次会话陈述';

    const coreConcerns: string[] = primaryUtterance
      ? [`围绕${mainTopic}展开的真实倾诉`]
      : ['来访者进行了短时间陈述，尚未展开核心议题'];

    const initialEmotion = '情绪承压与倾诉表达';
    const finalEmotion =
      stageReached === 'Crisis_Escalation'
        ? '转入专业安全转介通道'
        : durationSeconds > 180
          ? '事实逐步理清，紧绷状态缓解'
          : '完成初步表达';

    return {
      sessionId,
      generatedAt: Date.now(),
      durationSeconds,
      userDisplayName,
      cbtStageReached: stageReached,
      coreConcerns,
      cognitiveDistortions: ['待通过 DeepSeek V4 Flash 深度提取'],
      emotionalTrajectory: {
        initial: initialEmotion,
        final: finalEmotion,
        deltaNotes: `通话中学生重点表达了${mainTopic}，进线时呈现“${initialEmotion}”，挂机时转为“${finalEmotion}”。`,
      },
      keyTakeaways: [`理清客观发生的事实与主观评价之间的边界，避免单一挫折泛化。`],
      homeworkAction:
        primaryUtterance && primaryUtterance.length > 5
          ? `针对本次探讨的${mainTopic}，记录下一次发生类似情绪触发点时的客观事实，尝试写下一种更客观的看待角度。`
          : '',
      isDeidentified: true,
    };
  }
}
