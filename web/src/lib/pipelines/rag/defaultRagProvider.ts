import type { IRagProvider, RagChunk, RagQueryOptions } from './types';
import { apiFetch } from '../../api';

export class DefaultRagProvider implements IRagProvider {
  public readonly name = 'DefaultRagProvider';

  private readonly endpoint: string;
  private readonly fallbackKnowledge: RagChunk[] = [
    {
      id: 'acad_exam_catastrophizing',
      category: 'academic',
      title: '学业焦虑：月考与模考失利的去灾难化认知重构',
      content:
        '[学业焦虑：月考与模考失利的去灾难化认知重构] 中学生面对重要考试失利时，常陷入全或无和灾难化的自动负性思维，将单次测验分数直接等同于个人智力能力或未来人生的全面失败。在CBT干预中，首要步骤是共情并接纳其失落与恐慌情绪，切忌急于劝慰或分析试卷。随后引导其运用ABC理论剖析：A为试卷分数客观事实，B为“我完蛋了/考不上高中大学了”的主观信念，C为绝望与躯体化紧绷反应。通过苏格拉底式提问展开去灾难化三连问，促使其审视最坏后果的真实概率与自身尚存的学科支持资源，最终将注意力转移到当下具体的复盘微行动。',
      score: 1.0,
      tags: ['考砸', '排名', '月考', '模拟考', '考不上', '学业'],
      empathyLead:
        '听得出来你现在心里特别沉重和委屈，辛辛苦苦准备了那么久却没有拿到预期的成绩，换作任何人都会觉得非常挫败。',
      socraticPivot:
        '我们先退后半步来看，如果把镜头拉长到整个求学阶段，这次单次的分数真的能够直接决定你整个人生是否成功吗？它更像是在全面否定你，还是只暴露出某几个具体的考点需要弥补？',
      tabooPhrases: ['别难过', '下次努力就行了', '你想太多了', '谁叫你平时不认真'],
    },
    {
      id: 'peer_group_exclusion',
      category: 'peer',
      title: '同伴人际：宿舍与班级冷暴力孤立的心理边界确立',
      content:
        '[同伴人际：宿舍与班级冷暴力孤立的心理边界确立] 青少年时期同伴归属感处于自我认同的核心，遭受宿舍小团体冷落或班级孤立会诱发深层的社交遗弃创伤与过度反思。学生常产生“是不是我性格太古怪他们才讨厌我”的内归因自责倾向，或陷入“读心术”偏差。CBT应对着重于理清人际控制圈：他人的态度与行为属于他人课题，超出个人可控范围；唯有自身的自尊与边界属于自身课题。引导学生打破“必须让宿舍所有人喜欢我”的绝对化信念，将精力投注于班级外、兴趣社团或真正志同道合的健康关系。',
      score: 0.95,
      tags: ['不理我', '孤立', '冷暴力', '寝室', '排挤', '没有朋友'],
      empathyLead:
        '走在走廊里或者回到寝室，感觉自己被一层无形的墙隔开、没人搭话，那种孤单和委屈确实特别令人心酸。',
      socraticPivot:
        '当他们聚在一起低语或者冷淡的时候，我们脑海里自动冒出的“他们全都在针对我”这个猜测，是百分之百被证实的客观事实，还是我们因为害怕受伤而做出的最坏推想？一个宿舍的氛围，真的能够给你的全部社交价值盖棺定论吗？',
      tabooPhrases: ['一个巴掌拍不响', '反思一下自己为什么不合群', '讨好他们一下不就好了'],
    },
    {
      id: 'fam_overcontrol_privacy',
      category: 'family',
      title: '家庭互动：父母过度控制与空间越界的非暴力沟通',
      content:
        '[家庭互动：父母过度控制与空间越界的非暴力沟通] 青春期个体会产生强烈的心理独立与隐私空间需求，而传统家庭教育模式常伴随查阅手机、进门不敲门、私翻日记等控制行为，极易诱发激烈的亲子冲突或深度压抑。学生在此情境下常产生“他们根本不爱我，只把我当提线木偶”的绝望念头。CBT介入需引导其区分父母行为的动机（源于父母自身的焦虑与不安全感）与行为的边界侵犯事实。指导学生采取结构化非暴力表达模型：陈述观察到的具体事实、表达自身受侵犯的真实情绪感受，而非发起对抗性人身攻击。',
      score: 0.9,
      tags: ['看我手机', '管太多', '翻日记', '我妈', '我爸', '没有自由', '监控我'],
      empathyLead:
        '连自己的房间和日记都不能拥有安全的边界，这种随时随地被审视的窒息感，换作是谁都会感到愤怒和抓狂。',
      socraticPivot:
        '如果我们放下双方情绪激动时的争吵控诉，试着用最平静但清晰的声音告诉他们：“当我看到日记被翻动时，我感到我的尊严被伤害了，我希望我们能有基本的信任”，你觉得这会不会比愤怒摔门更能让他们听见你的底线？',
      tabooPhrases: ['父母都是为了你好', '别不知足了', '天下无不是的父母'],
    },
    {
      id: 'self_appearance_anxiety',
      category: 'self_worth',
      title: '自我认同：容貌身材焦虑与聚光灯效应认知校正',
      content:
        '[自我认同：容貌身材焦虑与聚光灯效应认知校正] 青少年由于身体第二性征快速发育以及社交媒体单一审美符号的轰炸，极易陷入身体畸形焦虑或对自身容貌细节的放大审视。学生往往深陷“聚光灯效应”，深信全班同学都在时刻紧盯自己的痘痘、体型或五官缺陷并暗自嘲笑。在CBT层面，通过认知证据检验技术，引导其核查“他人关注度”的现实证据；借助接纳承诺疗法（ACT）身体中立隐喻，将身体视作承载生命感知与行动的精密工具，而非供他人评判的静态展品。',
      score: 0.88,
      tags: ['觉得自己丑', '长相', '身材', '胖', '容貌焦虑', '自卑', '脸大'],
      empathyLead:
        '把目光盯在镜子里不满意的地方，甚至觉得走在人群里每个人都在对你指指点点，那种恨不得缩起来的自卑感非常辛苦。',
      socraticPivot:
        '回忆一下今天早上走进教室时，你能准确记清前桌同学今天长了哪颗新痘痘或者穿了什么鞋子吗？如果大多数人都在忙着顾虑自己的形象，他们真的有空闲把全部注意力集中在你的细节上吗？',
      tabooPhrases: ['内涵比长相重要', '你不丑啊挺好看的', '别那么虚荣'],
    },
  ];

  constructor(endpoint: string = '/api/voice/knowledge') {
    this.endpoint = endpoint;
  }

  public async retrieve(query: string, options?: RagQueryOptions): Promise<RagChunk[]> {
    const topK = options?.topK ?? 1;
    const cleanQuery = (query || '').trim();
    if (!cleanQuery) return [];

    try {
      const res = await apiFetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: cleanQuery, topK }),
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        if (Array.isArray(data.chunks) && data.chunks.length > 0) {
          return data.chunks;
        }
      }
    } catch (_err) {
      // 离线或服务端不可用时降级至本地知识库
    }

    const qLower = cleanQuery.toLowerCase();
    return this.fallbackKnowledge
      .map((item) => {
        let score = 0;
        if (
          qLower.includes(item.title.toLowerCase()) ||
          item.title.toLowerCase().includes(qLower)
        ) {
          score += 0.5;
        }
        for (const tag of item.tags || []) {
          if (qLower.includes(tag.toLowerCase())) {
            score += 0.35;
          }
        }
        if (item.content.toLowerCase().includes(qLower)) {
          score += 0.15;
        }
        return { ...item, score: Math.min(1.0, score) };
      })
      .filter((item) => item.score >= 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  public formatContext(chunks: RagChunk[]): string {
    if (!chunks || chunks.length === 0) {
      return '未匹配到特定干预方案。请保持同龄好友平视视角，以积极倾听和情绪共鸣为主，避免讲大道理或随意评价。每次回复必须在1-2句话以内。';
    }
    const primary = chunks[0];
    const parts: string[] = [`[CBT微干预引导: ${primary.title}]`];
    if (primary.empathyLead) {
      parts.push(`1. 共情切入: ${primary.empathyLead}`);
    }
    if (primary.socraticPivot) {
      parts.push(`2. 启发提问: ${primary.socraticPivot}`);
    }
    if (primary.tabooPhrases && primary.tabooPhrases.length > 0) {
      parts.push(
        `3. 禁忌雷区: 严禁说“${primary.tabooPhrases.slice(0, 3).join('、')}”。请用同龄好友口吻在1-2句话内温和回应，严禁超过两句话。`,
      );
    }
    return parts.join('\n');
  }
}
