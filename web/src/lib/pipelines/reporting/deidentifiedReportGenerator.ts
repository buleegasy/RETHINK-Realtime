import type { DialogueTurn, SanitizedCbtReport, CBTStage } from '../../../types';
import type { IReportGenerator, ReportGenerationInput } from './types';

export class DeidentifiedCbtReportGenerator implements IReportGenerator {
  public readonly name = 'DeidentifiedCbtReportGenerator';

  private readonly phoneRegex = /(?:\+?86)?\s*(1[3-9]\d)\d{4}(\d{4})/g;
  private readonly emailRegex = /([a-zA-Z0-9_.+-])[a-zA-Z0-9_.+-]*@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)/g;
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
    const userSpeech = userTurns
      .map((t) => this.deidentifyText(t.content))
      .join(' ')
      .trim();

    const coreConcerns: string[] = [];
    if (/学业|考试|论文|成绩|排名|毕业|考研|高考/.test(userSpeech)) {
      coreConcerns.push('学业成绩与考核压力');
    }
    if (/宿舍|室友|同学|朋友|人际|孤立|排挤/.test(userSpeech)) {
      coreConcerns.push('同伴相处与人际交往困惑');
    }
    if (/父母|爸妈|家里|父亲|母亲|争吵|沟通/.test(userSpeech)) {
      coreConcerns.push('家庭沟通与亲子关系冲突');
    }
    if (/失眠|睡不着|心慌|头疼|胸闷|不想吃/.test(userSpeech)) {
      coreConcerns.push('压力引发的身体躯体化反应');
    }
    if (coreConcerns.length === 0 && userSpeech) {
      const summaryExcerpt = userSpeech.slice(0, 18);
      coreConcerns.push(`“${summaryExcerpt}...”现实压力倾诉`);
    }

    const cognitiveDistortions: string[] = [];
    if (/全完了|绝对|必须|总是|从没|毫无价值/.test(userSpeech)) {
      cognitiveDistortions.push('绝对化与非黑即白倾向');
    }
    if (/天塌了|完蛋了|彻底没救了|万劫不复/.test(userSpeech)) {
      cognitiveDistortions.push('灾难化灾难预期');
    }
    if (/他们肯定讨厌我|都看不起我|心里肯定觉得我/.test(userSpeech)) {
      cognitiveDistortions.push('负向读心术倾向');
    }

    const initialEmotion = this.inferInitialEmotion(userSpeech);
    const finalEmotion = this.inferFinalEmotion(stageReached, durationSeconds);
    const mainTopic = coreConcerns[0] || '本次探讨的具体困扰';

    return {
      sessionId,
      generatedAt: Date.now(),
      durationSeconds,
      userDisplayName,
      cbtStageReached: stageReached,
      coreConcerns: coreConcerns.length > 0 ? coreConcerns : ['当前阶段性现实压力探讨'],
      cognitiveDistortions: cognitiveDistortions.length > 0 ? cognitiveDistortions : ['未见明显偏执型认知歪曲'],
      emotionalTrajectory: {
        initial: initialEmotion,
        final: finalEmotion,
        deltaNotes: `围绕${mainTopic}展开梳理，由进线时的“${initialEmotion}”逐步转向挂机时的“${finalEmotion}”。`,
      },
      keyTakeaways: [
        `理清客观发生的事实与主观评价之间的边界，避免将单一现实挫折推导为全面否定。`,
      ],
      homeworkAction: `针对本次探讨的“${mainTopic}”，记录下一次发生类似情绪触发点时的客观事实与当下第一反应，并在纸上写下一种替代性的温和看法。`,
      isDeidentified: true,
    };
  }

  private inferInitialEmotion(text: string): string {
    if (/崩溃|受不了|难受|哭|绝望/.test(text)) return '高度压力与强烈情绪宣泄';
    if (/慌|焦虑|害怕|担心|紧张/.test(text)) return '焦虑不安与不确定感';
    if (/累|没意思|提不起劲|无聊/.test(text)) return '身心疲惫与精力损耗';
    return '情绪承压与倾诉渴望';
  }

  private inferFinalEmotion(stage: CBTStage, durationSeconds: number): string {
    if (stage === 'Crisis_Escalation') {
      return '触发危机升级转介通道';
    }
    if (stage === 'Socratic_Questioning' || durationSeconds > 180) {
      return '事实逐步厘清，恢复理性掌控感';
    }
    if (stage === 'CBT_Stripping') {
      return '情绪获得承接，开始剥离主观认知';
    }
    return '初步倾诉释放，紧绷状态有所松弛';
  }
}
