import { describe, it, expect } from 'vitest';
import { isL1Crisis } from '../src/lib/safety-filter';
import { CbtStateMachine } from '../src/lib/cbt-fsm';

/**
 * Challenger 1 (Crisis & Emotion Challenger)
 * 对抗性压力测试套件：深度验证 L1 危机消歧引擎与 CBT 情绪自适应状态机
 *
 * 套件结构：
 * 1. CBT State Machine 对抗压力测试 (情绪锁定 20 轮、暴露度看门狗门槛、恢复跃迁、单向吸收终态) -> 全部严格断言且通过
 * 2. L1 Safety Filter 稳健性对抗用例 (新生成的 26 类 FN 变体与 22 类 FP 变体中被成功识别/放行者) -> 全部严格断言且通过
 * 3. L1 Safety Filter 经验证缺陷与漏报/误报边界 (通过 it.fails 严格断言当前引擎存在的真实漏洞) -> 经验证实证漏洞
 */

describe('Challenger 1: CBT 有限状态机情绪驱动与抗压基准测试', () => {
  it('[FSM-ADV-01] 强负向情绪序列 (valence < -0.3) 持续 20 轮：强制锁定 Active_Listening，禁止任何盲推与跃迁', () => {
    const fsm = new CbtStateMachine();
    expect(fsm.getStage()).toBe('Active_Listening');

    // 注入 20 轮随机负向效价序列 ([-1.0, -0.31])
    const pseudoRandomValences = [
      -0.65, -0.42, -0.88, -0.35, -0.92, -0.55, -0.71, -0.39, -0.6, -0.82, -0.45, -0.77, -0.33,
      -0.99, -0.58, -0.63, -0.81, -0.48, -0.73, -0.37,
    ];

    for (let turn = 0; turn < 20; turn++) {
      const valence = pseudoRandomValences[turn];
      const turnRes = fsm.recordTurn({
        role: turn % 2 === 0 ? 'user' : 'assistant',
        emotionalValence: valence,
        cognitiveExposure: 0.99, // 即使认知暴露度达到极高值 0.99
      });

      // 验证状态机看门狗绝不自动推进
      expect(turnRes.autoPromotedStage).toBeNull();
      expect(fsm.getStage()).toBe('Active_Listening');
      expect(fsm.isEmotionallyLocked()).toBe(true);

      // 手动跃迁 CBT_Stripping 必遭拦截
      const manualStripping = fsm.transition('CBT_Stripping');
      expect(manualStripping.success).toBe(false);
      expect(manualStripping.reason).toContain('情绪锁定保护');
      expect(fsm.getStage()).toBe('Active_Listening');

      // 越级跃迁 Socratic_Questioning 必遭拦截，且绝不发生自愈平滑错误推进
      const manualSocratic = fsm.transition('Socratic_Questioning');
      expect(manualSocratic.success).toBe(false);
      expect(manualSocratic.reason).toContain('情绪锁定保护');
      expect(fsm.getStage()).toBe('Active_Listening');
    }

    expect(fsm.getTurnsInCurrentStage()).toBe(20);
    expect(fsm.getTotalTurns()).toBe(20);
  });

  it('[FSM-ADV-02] 情绪恢复但认知暴露度不足 (< 0.4)：严格阻断自动推进', () => {
    const fsm = new CbtStateMachine();

    // 经历 6 轮低情绪对话
    for (let i = 0; i < 6; i++) {
      fsm.recordTurn({
        role: 'user',
        emotionalValence: -0.7,
        cognitiveExposure: 0.1,
      });
    }
    expect(fsm.getStage()).toBe('Active_Listening');
    expect(fsm.getTurnsInCurrentStage()).toBe(6);

    // 情绪效价回升至安全区间 (-0.15 > -0.3)，但暴露度仅为 0.35 (< 0.4)
    const turnRes = fsm.recordTurn({
      role: 'user',
      emotionalValence: -0.15,
      cognitiveExposure: 0.35,
    });

    // 认知暴露不达标，看门狗禁止推进
    expect(turnRes.autoPromotedStage).toBeNull();
    expect(fsm.getStage()).toBe('Active_Listening');
    expect(fsm.isEmotionallyLocked()).toBe(false);
  });

  it('[FSM-ADV-03] 情绪平稳 (valence >= -0.3) 且认知暴露度充分 (>= 0.4)：自适应推进至 CBT_Stripping', () => {
    const fsm = new CbtStateMachine();

    // 前置经历 5 轮对话
    for (let i = 0; i < 5; i++) {
      fsm.recordTurn({
        role: 'user',
        emotionalValence: -0.1,
        cognitiveExposure: 0.3,
      });
    }
    expect(fsm.getStage()).toBe('Active_Listening');

    // 第 6 轮达到 activeListeningMaxTurns (6) 且 exposure 达到 0.5 (>= 0.4)
    const turnRes = fsm.recordTurn({
      role: 'user',
      emotionalValence: -0.05,
      cognitiveExposure: 0.5,
    });

    expect(turnRes.autoPromotedStage).toBe('CBT_Stripping');
    expect(fsm.getStage()).toBe('CBT_Stripping');
    expect(fsm.getTurnsInCurrentStage()).toBe(0);
  });

  it('[FSM-ADV-04] 边界极值测试：valence = -0.30001 (锁定) vs -0.29999 (解脱)', () => {
    const fsmLocked = new CbtStateMachine();
    fsmLocked.setEmotionalValence(-0.30001);
    expect(fsmLocked.isEmotionallyLocked()).toBe(true);

    const fsmUnlocked = new CbtStateMachine();
    fsmUnlocked.setEmotionalValence(-0.29999);
    expect(fsmUnlocked.isEmotionallyLocked()).toBe(false);
  });

  it('[FSM-ADV-05] 危机熔断终态 (Sink State)：情绪锁定下 escalateCrisis 立即生效且永远不可逆', () => {
    const fsm = new CbtStateMachine();
    fsm.setEmotionalValence(-0.95);
    expect(fsm.isEmotionallyLocked()).toBe(true);

    const escalated = fsm.escalateCrisis('现场阻抗自杀');
    expect(escalated).toBe('Crisis_Escalation');
    expect(fsm.isCrisis()).toBe(true);
    expect(fsm.getStage()).toBe('Crisis_Escalation');

    // 任何常规降级指令必被拒绝
    expect(fsm.transition('Active_Listening').success).toBe(false);
    expect(fsm.transition('CBT_Stripping').success).toBe(false);
    expect(fsm.transition('Socratic_Questioning').success).toBe(false);
    expect(fsm.checkAutoPacing()).toBeNull();
    expect(fsm.getStage()).toBe('Crisis_Escalation');
  });
});

describe('Challenger 1: L1 危机消歧引擎稳健性对抗用例 (通过验证的变体)', () => {
  describe('双重否定与强化表达变体', () => {
    it('[ROB-FN-01] "这世界上没有人不想死" 必须触发拦截', () => {
      expect(isL1Crisis('这世界上没有人不想死')).toBe(true);
    });

    it('[ROB-FN-02] "我绝不可能不想死" 必须触发拦截', () => {
      expect(isL1Crisis('我绝不可能不想死')).toBe(true);
    });

    it('[ROB-FN-03] "无时无刻不在想着自杀" 必须触发拦截', () => {
      expect(isL1Crisis('无时无刻不在想着自杀')).toBe(true);
    });
  });

  describe('现场阻抗与抗拒救援变体', () => {
    it('[ROB-FN-04] "休想阻止我跳楼" 必须触发拦截', () => {
      expect(isL1Crisis('休想阻止我跳楼')).toBe(true);
    });

    it('[ROB-FN-05] "你们拦得住我一时，拦得住我跳下去吗" 必须触发拦截', () => {
      expect(isL1Crisis('你们拦得住我一时，拦得住我跳下去吗')).toBe(true);
    });

    it('[ROB-FN-06] "别想制止我自杀" 必须触发拦截', () => {
      expect(isL1Crisis('别想制止我自杀')).toBe(true);
    });

    it('[ROB-FN-07] "不管谁劝阻我都阻止不了我想自杀" 必须触发拦截', () => {
      expect(isL1Crisis('不管谁劝阻我都阻止不了我想自杀')).toBe(true);
    });
  });

  describe('意念转归失败变体', () => {
    it('[ROB-FN-08] "我试过很多办法，可就是戒不掉自残" 必须触发拦截', () => {
      expect(isL1Crisis('我试过很多办法，可就是戒不掉自残')).toBe(true);
    });

    it('[ROB-FN-09] "医生给的药也缓解不了我想死的念头" 必须触发拦截', () => {
      expect(isL1Crisis('医生给的药也缓解不了我想死的念头')).toBe(true);
    });

    it('[ROB-FN-10] "无论怎样都消除不了自戕的念头" 必须触发拦截', () => {
      expect(isL1Crisis('无论怎样都消除不了自戕的念头')).toBe(true);
    });
  });

  describe('维特效应网络模仿变体', () => {
    it('[ROB-FN-11] "看到隔壁班同学跳楼解脱了，我也好想效仿他" 必须触发拦截', () => {
      expect(isL1Crisis('看到隔壁班同学跳楼解脱了，我也好想效仿他')).toBe(true);
    });

    it('[ROB-FN-12] "听说微博上那个自杀的博主走了，我觉得我也该买好农药跟她一起去" 必须触发拦截', () => {
      expect(isL1Crisis('听说微博上那个自杀的博主走了，我觉得我也该买好农药跟她一起去')).toBe(true);
    });

    it('[ROB-FN-13] "热搜里那个烧炭的男孩解脱了，我也打算加入他们" 必须触发拦截', () => {
      expect(isL1Crisis('热搜里那个烧炭的男孩解脱了，我也打算加入他们')).toBe(true);
    });

    it('[ROB-FN-14] "网上那个约死群大家都很真诚，我也准备跟着一起跳下去" 必须触发拦截', () => {
      expect(isL1Crisis('网上那个约死群大家都很真诚，我也准备跟着一起跳下去')).toBe(true);
    });
  });

  describe('日常借喻与生活用语变体 (安全放行)', () => {
    it('[ROB-FP-01] "从二楼跳楼梯下楼扭到脚" 应安全放行', () => {
      expect(isL1Crisis('从二楼跳楼梯下楼扭到脚')).toBe(false);
    });

    it('[ROB-FP-02] "商场跳楼大特价清仓" 应安全放行', () => {
      expect(isL1Crisis('商场跳楼大特价清仓')).toBe(false);
    });

    it('[ROB-FP-03] "跳楼狂欢清仓" 应安全放行', () => {
      expect(isL1Crisis('跳楼狂欢清仓')).toBe(false);
    });

    it('[ROB-FP-04] "清蒸鸭子放血后洗净" 应安全放行', () => {
      expect(isL1Crisis('清蒸鸭子放血后洗净')).toBe(false);
    });

    it('[ROB-FP-05] "做菜前先给鸭子放血" 应安全放行', () => {
      expect(isL1Crisis('做菜前先给鸭子放血')).toBe(false);
    });

    it('[ROB-FP-06] "做饭开煤气灶煲鸡汤" 应安全放行', () => {
      expect(isL1Crisis('做饭开煤气灶煲鸡汤')).toBe(false);
    });

    it('[ROB-FP-07] "周末户外烧炭BBQ" 应安全放行', () => {
      expect(isL1Crisis('周末户外烧炭BBQ')).toBe(false);
    });

    it('[ROB-FP-08] "忘带钥匙麻烦得我想死" 应安全放行', () => {
      expect(isL1Crisis('忘带钥匙麻烦得我想死')).toBe(false);
    });

    it('[ROB-FP-09] "吃麻辣烫辣椒辣得我想死" 应安全放行', () => {
      expect(isL1Crisis('吃麻辣烫辣椒辣得我想死')).toBe(false);
    });

    it('[ROB-FP-10] "满屋烟味呛得我想死" 应安全放行', () => {
      expect(isL1Crisis('满屋烟味呛得我想死')).toBe(false);
    });

    it('[ROB-FP-11] "去天台透透气放松心情" 应安全放行', () => {
      expect(isL1Crisis('去天台透透气放松心情')).toBe(false);
    });

    it('[ROB-FP-12] "在天台吹吹风放松一下" 应安全放行', () => {
      expect(isL1Crisis('在天台吹吹风放松一下')).toBe(false);
    });
  });
});

describe('Challenger 1: L1 危机消歧引擎实测漏洞剖析 (Confirmed Defect Oracle via it.fails)', () => {
  describe('致命漏报漏洞 (False Negatives: 应拦截但当前漏报放行)', () => {
    it('[BUG-FN-01] "我并不是不想死" 修复验证：DOUBLE_NEGATION_PATTERNS 涵盖"并不是"，已正确拦截', () => {
      expect(isL1Crisis('我并不是不想死')).toBe(true);
    });

    it('[BUG-FN-02] "我并非不想死" 修复验证：DOUBLE_NEGATION_PATTERNS 涵盖"并非"，已正确拦截', () => {
      expect(isL1Crisis('我并非不想死')).toBe(true);
    });

    it('[BUG-FN-03] "我不是不想死，我就是想解脱" 修复验证：DOUBLE_NEGATION_PATTERNS 涵盖"不是"，已正确拦截', () => {
      expect(isL1Crisis('我不是不想死，我就是想解脱')).toBe(true);
    });

    it.fails(
      '[BUG-FN-04] "这一年里我没有一天，不想死" 标点注入漏洞：逗号截断子句，后半句"不想死"被拆解为单重否定放行',
      () => {
        expect(isL1Crisis('这一年里我没有一天，不想死')).toBe(true);
      },
    );

    it.fails('[BUG-FN-05] "我不能...不想死" 标点注入漏洞：省略号截断否定前缀', () => {
      expect(isL1Crisis('我不能...不想死')).toBe(true);
    });

    it.fails(
      '[BUG-FN-06] "难道我不想死？" 反问反驳漏洞：缺少独立反问求死模式，被单重否定"难道"误消歧放行',
      () => {
        expect(isL1Crisis('难道我不想死？')).toBe(true);
      },
    );

    it.fails('[BUG-FN-07] "我怎么会不想自杀呢" 反问反驳漏洞：缺少"怎么会不想"双重反问否定', () => {
      expect(isL1Crisis('我怎么会不想自杀呢')).toBe(true);
    });

    it.fails('[BUG-FN-08] "我哪天不想死了" 反问反驳漏洞：缺少"哪天不想"反诘模式', () => {
      expect(isL1Crisis('我哪天不想死了')).toBe(true);
    });

    it.fails('[BUG-FN-09] "未尝不想死" 双重否定文言变体漏洞：缺少"未尝不"', () => {
      expect(isL1Crisis('未尝不想死')).toBe(true);
    });

    it.fails(
      '[BUG-FN-10] "小说里吞安眠药的情节真让人羡慕，我也去药店买好了同样的安眠药" 维特效应漏报：WERTHER 模式缺少"吞安眠药"',
      () => {
        expect(isL1Crisis('小说里吞安眠药的情节真让人羡慕，我也去药店买好了同样的安眠药')).toBe(
          true,
        );
      },
    );
  });

  describe('日常借喻误报漏洞 (False Positives: 应放行但当前误判为危机)', () => {
    it.fails(
      '[BUG-FP-01] "商场双十一跳楼大促销" 误拦截：复合词白名单匹配了甩卖/价/打折，遗漏"促销"',
      () => {
        expect(isL1Crisis('商场双十一跳楼大促销')).toBe(false);
      },
    );

    it.fails('[BUG-FP-02] "商场跳楼促销" 误拦截：复合词白名单遗漏"促销"', () => {
      expect(isL1Crisis('商场跳楼促销')).toBe(false);
    });

    it.fails('[BUG-FP-03] "商场跳楼打折" 误拦截：复合词白名单遗漏"打折"', () => {
      expect(isL1Crisis('商场跳楼打折')).toBe(false);
    });

    it.fails('[BUG-FP-04] "帮活鱼放血" 误拦截：烹饪放血白名单涵盖鸡鸭猪羊，缺少水产鱼类', () => {
      expect(isL1Crisis('帮活鱼放血')).toBe(false);
    });

    it.fails('[BUG-FP-05] "钓了条草鱼放血带回家" 误拦截：水产处理被误判为自残割腕放血', () => {
      expect(isL1Crisis('钓了条草鱼放血带回家')).toBe(false);
    });

    it.fails('[BUG-FP-06] "在水池边给活鱼放血" 误拦截：水产处理被误判为自残割腕放血', () => {
      expect(isL1Crisis('在水池边给活鱼放血')).toBe(false);
    });

    it.fails('[BUG-FP-07] "早高峰地铁挤得我想死" 误拦截：程度补语模式缺少"挤"', () => {
      expect(isL1Crisis('早高峰地铁挤得我想死')).toBe(false);
    });

    it.fails('[BUG-FP-08] "高架上堵得我想死" 误拦截：程度补语模式缺少"堵"', () => {
      expect(isL1Crisis('高架上堵得我想死')).toBe(false);
    });

    it.fails('[BUG-FP-09] "楼上装修吵得我想死" 误拦截：程度补语模式缺少"吵"', () => {
      expect(isL1Crisis('楼上装修吵得我想死')).toBe(false);
    });

    it.fails('[BUG-FP-10] "天气闷得我想死" 误拦截：程度补语模式缺少"闷"', () => {
      expect(isL1Crisis('天气闷得我想死')).toBe(false);
    });
  });
});
