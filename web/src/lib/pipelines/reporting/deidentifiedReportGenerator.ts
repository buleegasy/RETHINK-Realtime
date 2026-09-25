import type { DialogueTurn, SanitizedCbtReport, CBTStage } from '../../../types';
import type { IReportGenerator, ReportGenerationInput } from './types';

export class DeidentifiedCbtReportGenerator implements IReportGenerator {
  public readonly name = 'DeidentifiedCbtReportGenerator';

  private readonly phoneRegex = /(?:\+?86)?\s*(1[3-9]\d)\d{4}(\d{4})/g;
  private readonly emailRegex = /([a-zA-Z0-9_.+-])[a-zA-Z0-9_.+-]*@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)/g;
  private readonly idCardRegex = /(\d{6})\d{8}(\w{4})/g;

  private readonly distortionPatterns: Array<{ name: string; keywords: string[] }> = [
    {
      name: '非黑即白 (All-or-Nothing)',
      keywords: ['全完了', '必须', '总是', '从没', '绝对', '要么要么', '毫无价值'],
    },
    {
      name: '灾难化思维 (Catastrophizing)',
      keywords: ['天塌了', '万劫不复', '彻底没救了', '受不了了', '完蛋了', '最坏的'],
    },
    {
      name: '以偏概全 (Overgeneralization)',
      keywords: ['每次都这样', '大家都是', '所有人都', '永远做不好'],
    },
    {
      name: '读心术与负面猜测 (Mind Reading)',
      keywords: ['他们肯定讨厌我', '他心里觉得我', '别人都看不起我', '领导一定在想'],
    },
    {
      name: '应该与必须化 (Should Statements)',
      keywords: ['我本应该', '我必须做到', '绝对不能犯错', '他们必须'],
    },
  ];

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

    const userSpeech = turns
      .filter((t) => t.role === 'user')
      .map((t) => this.deidentifyText(t.content))
      .join(' ');

    const detectedDistortions: string[] = [];
    for (const pattern of this.distortionPatterns) {
      for (const kw of pattern.keywords) {
        if (userSpeech.includes(kw)) {
          detectedDistortions.push(pattern.name);
          break;
        }
      }
    }
    if (detectedDistortions.length === 0) {
      detectedDistortions.push('尚未发现典型偏执型认知歪曲（情绪主要受阶段性现实压力引发）');
    }

    const coreConcerns: string[] = [];
    if (/学业|考试|论文|成绩|毕业/.test(userSpeech)) coreConcerns.push('学业考核与未来去向压力');
    if (/工作|领导|同事|升职|考核|加班/.test(userSpeech)) coreConcerns.push('职场人际与职业发展倦怠');
    if (/失眠|睡不着|胸闷|心慌|喘不上气/.test(userSpeech)) coreConcerns.push('躯体化焦虑与植物神经紧张');
    if (/朋友|恋爱|分手|父母|家里|争吵/.test(userSpeech)) coreConcerns.push('亲密关系与家庭互动冲突');
    if (coreConcerns.length === 0) {
      coreConcerns.push('日常偶发性负性情绪倾诉与压力释放');
    }

    const initialEmotion = this.inferInitialEmotion(userSpeech);
    const finalEmotion = this.inferFinalEmotion(stageReached, durationSeconds);

    const keyTakeaways = [
      '接纳情绪本身并无对错，允许自己处于不完美的状态。',
      '情绪往往源自对事件的主观信念评价（B），而非事件本身（A）。',
      '当最坏的灾难化念头出现时，尝试问自己“最现实的结果会是什么”。',
    ];

    const homeworkAction =
      '【5分钟呼吸与微行动】今晚若再次陷入类似负面反刍，先进行 4-7-8 腹式深呼吸 3 次，然后写下一条与该想法相反的客观证据。';

    return {
      sessionId,
      generatedAt: Date.now(),
      durationSeconds,
      userDisplayName,
      cbtStageReached: stageReached,
      coreConcerns,
      cognitiveDistortions: detectedDistortions,
      emotionalTrajectory: {
        initial: initialEmotion,
        final: finalEmotion,
        deltaNotes: '在倾听共鸣与理性梳理下，情绪由紧绷向平静释然迁移。',
      },
      keyTakeaways,
      homeworkAction,
      isDeidentified: true,
    };
  }

  private inferInitialEmotion(text: string): string {
    if (/崩溃|受不了|难受|哭|想死/.test(text)) return '高度痛苦与情绪宣泄';
    if (/慌|焦虑|害怕|担心|紧张/.test(text)) return '焦虑紧张与对未知的不确定感';
    if (/累|没意思|提不起劲|无聊/.test(text)) return '疲惫抑郁与精力耗竭';
    return '中度紧绷与倾诉渴望';
  }

  private inferFinalEmotion(stage: CBTStage, durationSeconds: number): string {
    if (stage === 'Crisis_Escalation') {
      return '危机熔断干预态（建议寻求专业人工心理急救通道）';
    }
    if (stage === 'Socratic_Questioning' || durationSeconds > 180) {
      return '认知重塑，重拾掌控感与微小平静';
    }
    if (stage === 'CBT_Stripping') {
      return '事实与情绪逐步分离，思路逐渐清晰';
    }
    return '情绪获得倾听与接纳，紧绷感初步缓解';
  }
}
