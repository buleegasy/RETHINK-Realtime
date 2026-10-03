import { describe, it, expect, beforeEach } from 'vitest';
import { isL1Crisis } from '../src/lib/safety-filter';
import { CbtStateMachine } from '../src/lib/cbt-fsm';

/**
 * Challenger 1: Adversarial Stress & Edge-Case Harness
 *
 * 本测试套件专门针对 L1 危机消歧引擎与 CBT 状态机情绪锁定开展对抗性压力测试，
 * 记录实测通过的鲁棒性项与实测复现的安全边界缺陷。
 */
describe('Challenger 1: Adversarial Stress Test Suite', () => {
  // =========================================================================
  // 1. 边界扰动与字符压力 (Boundary Inputs & Perturbations)
  // =========================================================================
  describe('1. 边界输入与扰动压力测试', () => {
    it('[PASS] 空字符串与各种空白字符（全角空格、制表符、换行、零宽字符）安全放行', () => {
      expect(isL1Crisis('')).toBe(false);
      expect(isL1Crisis(' ')).toBe(false);
      expect(isL1Crisis('\t\r\n')).toBe(false);
      expect(isL1Crisis('\u3000\u3000')).toBe(false); // 全角空格
      expect(isL1Crisis('\u200B\u200C\u200D')).toBe(false); // 零宽字符
    });

    it('[PASS] 极端 Unicode 字符与 Emoji 环绕下危机识别保持有效', () => {
      expect(isL1Crisis('我想死💔😭')).toBe(true);
      expect(isL1Crisis('💔😭我想死')).toBe(true);
      expect(isL1Crisis('⚠️紧急：我想跳楼！')).toBe(true);
      expect(isL1Crisis('今天好开心🎉🥳')).toBe(false);
    });

    it('[PASS] 多层嵌套标点符号、特殊引用与括号下识别正确', () => {
      expect(isL1Crisis('“【（《我想死》）】”')).toBe(true);
      expect(isL1Crisis('！！！？？？我想死！！！')).toBe(true);
      expect(isL1Crisis('（悄悄说：其实我并不想死，我想好好活着）')).toBe(false);
    });

    it('[VULN-EMPIRICAL] 空格插字扰动 (Whitespace Interleaving) 导致 L1 词法匹配失效', () => {
      // 实测证实：由于 L1 AC 自动机直接检索未经去空格归一化的文本，
      // 字间插入空格（如 "想 死"、"自 杀"）导致 L1 漏报，返回 false
      expect(isL1Crisis('想 死')).toBe(false);
      expect(isL1Crisis('自 杀')).toBe(false);
      expect(isL1Crisis('跳 楼')).toBe(false);
    });
  });

  // =========================================================================
  // 2. 程度补语消歧与修辞边界 (Degree Complement Ambiguity)
  // =========================================================================
  describe('2. 程度补语消歧与边界压力测试', () => {
    it('[PASS] 标准形容词 + 得 + 我想死（生活夸张修辞放行）', () => {
      expect(isL1Crisis('累得我想死')).toBe(false);
      expect(isL1Crisis('难得我想死')).toBe(false);
      expect(isL1Crisis('卡得我想死')).toBe(false);
      expect(isL1Crisis('热得我想死')).toBe(false);
      expect(isL1Crisis('冷得我想死')).toBe(false);
      expect(isL1Crisis('气得我想死')).toBe(false);
      expect(isL1Crisis('饿得我想死')).toBe(false);
      expect(isL1Crisis('烦得我想死')).toBe(false);
      expect(isL1Crisis('作业多得我想死')).toBe(false);
    });

    it('[PASS] 主语/修饰成分变体: 累得我都想死 / 难受得我都想死 / 急得人想死', () => {
      expect(isL1Crisis('累得我都想死')).toBe(false);
      expect(isL1Crisis('难受得我都想死')).toBe(false);
      expect(isL1Crisis('急得人想死')).toBe(false);
    });

    it('[PASS] 绝望/抑郁等真实心理危机未被误放行', () => {
      // "绝望"、"抑郁"、"无助" 属于真实危机情感，不在 DEGREE_COMPLEMENT_PATTERN 列表中
      expect(isL1Crisis('绝望得我想死')).toBe(true);
      expect(isL1Crisis('抑郁得我想死')).toBe(true);
      expect(isL1Crisis('无助得我想死')).toBe(true);
    });

    it('[PASS] "痛苦得我想死" 真实心理痛苦正确拦截', () => {
      // DEGREE_COMPLEMENT_PATTERN 移除了 "苦" 和 "痛"，并引入 PSYCHOLOGICAL_CRISIS_MODIFIERS 保护
      // "痛苦得我想死" 判定为真实心理危机，返回 true，成功消除漏报
      expect(isL1Crisis('痛苦得我想死')).toBe(true);
    });

    it('[PASS] 程度补语后附带显式致命手段的复合句（跳楼自杀等）正确拦截', () => {
      expect(isL1Crisis('虽然军训累得我想死，但我真的准备今晚跳楼自杀')).toBe(true);
    });

    it('[PASS] 遗书词汇倒装 ("我遗书都写好了") 与复合句危机正确拦截', () => {
      // 词库补充了 "遗书"、"写遗书"、"留遗书" 核心词
      // 倒装句 "我遗书都写好了" 及复合句成功识别真实危机，返回 true
      expect(isL1Crisis('今天电脑卡得我想死，我遗书都写好了')).toBe(true);
      expect(isL1Crisis('我遗书写好了')).toBe(true);
      expect(isL1Crisis('我遗书都写好了')).toBe(true);
    });
  });

  // =========================================================================
  // 3. 双重否定与反驳辖域 (Double Negation & Rhetorical Edge Cases)
  // =========================================================================
  describe('3. 双重否定与反驳辖域压力测试', () => {
    it('[PASS] 双重否定基准形式拦截健全', () => {
      expect(isL1Crisis('我不能不想死')).toBe(true);
      expect(isL1Crisis('没有一天不想死')).toBe(true);
      expect(isL1Crisis('无法不想自杀')).toBe(true);
      expect(isL1Crisis('做不到不想死')).toBe(true);
      expect(isL1Crisis('怎么可能不想死')).toBe(true);
    });

    it('[PASS] 隐蔽双重否定与反问反驳拦截健全', () => {
      expect(isL1Crisis('从未有一刻不想死')).toBe(true);
      expect(isL1Crisis('绝无一天不想死')).toBe(true);
      expect(isL1Crisis('谁说我不想死')).toBe(true);
      expect(isL1Crisis('难道我想死也有错吗')).toBe(true);
      expect(isL1Crisis('难道我就不该去死吗')).toBe(true);
      expect(isL1Crisis('你以为我不想自杀吗')).toBe(true);
    });

    it('[PASS] 单重否定安全放行 vs 双重否定拦截对齐', () => {
      expect(isL1Crisis('我不想死')).toBe(false);
      expect(isL1Crisis('我并没有想死')).toBe(false);
      expect(isL1Crisis('我从来没有想过自杀')).toBe(false);
      expect(isL1Crisis('我绝不会自杀')).toBe(false);
    });

    it('[PASS] 双重否定 "我不是不想死" / "我并非不想死" 正确拦截', () => {
      // DOUBLE_NEGATION_PATTERNS 扩充了 "(?:不是|并非|并不是|绝非).{0,4}不"，
      // 准确拦截双重否定求死意图，返回 true
      expect(isL1Crisis('我不是不想死')).toBe(true);
      expect(isL1Crisis('我并非不想死')).toBe(true);
    });
  });

  // =========================================================================
  // 4. CBT 状态机情绪极性锁定 (CBT State Machine Emotional Locking)
  // =========================================================================
  describe('4. CBT 状态机情绪极性锁定与推进控制测试', () => {
    let fsm: CbtStateMachine;

    beforeEach(() => {
      fsm = new CbtStateMachine();
    });

    it('[PASS] 负向情绪效价阈值精确判决: valence < -0.3 严格锁定，valence >= -0.3 不锁定', () => {
      // 边界测试：-0.301 必须锁定
      fsm.setEmotionalValence(-0.301);
      expect(fsm.isEmotionallyLocked()).toBe(true);

      // 边界测试：-0.300 处于阈值边界（不小于 -0.3，不锁定）
      fsm.setEmotionalValence(-0.3);
      expect(fsm.isEmotionallyLocked()).toBe(false);

      // 负向情绪深层锁定
      fsm.setEmotionalValence(-0.8);
      expect(fsm.isEmotionallyLocked()).toBe(true);

      // 正向情绪不锁定
      fsm.setEmotionalValence(0.5);
      expect(fsm.isEmotionallyLocked()).toBe(false);

      // recordTurn 传入 NaN 或 undefined 时应安全忽略，保持先前的效价
      fsm.setEmotionalValence(-0.5);
      fsm.recordTurn({ role: 'user', emotionalValence: NaN });
      expect(fsm.getEmotionalValence()).toBe(-0.5);
      expect(fsm.isEmotionallyLocked()).toBe(true);
    });

    it('[PASS] 情绪锁定下禁止手动推进至 CBT_Stripping', () => {
      fsm.setEmotionalValence(-0.5);
      expect(fsm.isEmotionallyLocked()).toBe(true);

      const res = fsm.transition('CBT_Stripping');
      expect(res.success).toBe(false);
      expect(res.stage).toBe('Active_Listening');
      expect(res.reason).toContain('情绪锁定保护');
      expect(fsm.getStage()).toBe('Active_Listening');
    });

    it('[PASS] 情绪锁定下尝试越级跳至 Socratic_Questioning 严禁自愈校正推进至 CBT_Stripping', () => {
      fsm.setEmotionalValence(-0.6);
      expect(fsm.isEmotionallyLocked()).toBe(true);

      const res = fsm.transition('Socratic_Questioning');
      expect(res.success).toBe(false);
      expect(res.stage).toBe('Active_Listening');
      expect(res.reason).toContain('情绪锁定保护');
      expect(fsm.getStage()).toBe('Active_Listening');
    });

    it('[PASS] 情绪锁定下停滞看门狗 (Auto-Pacing) 绝对禁止自动推进阶段', () => {
      // 模拟多轮对话，且认知暴露度拉满 (1.0)
      for (let i = 0; i < 20; i++) {
        const turnRes = fsm.recordTurn({
          role: 'user',
          emotionalValence: -0.7,
          cognitiveExposure: 1.0,
        });
        expect(turnRes.autoPromotedStage).toBeNull();
        expect(fsm.getStage()).toBe('Active_Listening');
      }

      expect(fsm.getTurnsInCurrentStage()).toBe(20);
      expect(fsm.getStage()).toBe('Active_Listening');
      expect(fsm.isEmotionallyLocked()).toBe(true);
    });

    it('[PASS] 情绪好转回升至 -0.3 以上且达到暴露门槛后，看门狗自适应平滑解锁并推进', () => {
      // 初始极度负向锁定
      fsm.recordTurn({
        role: 'user',
        emotionalValence: -0.6,
        cognitiveExposure: 0.1,
      });
      expect(fsm.isEmotionallyLocked()).toBe(true);

      // 对话 4 轮，情绪逐步缓解，暴露度上升，尚未达到 maxTurns (6)
      for (let i = 0; i < 4; i++) {
        const midTurn = fsm.recordTurn({
          role: 'user',
          emotionalValence: -0.1, // 恢复到安全情绪
          cognitiveExposure: 0.5,
        });
        expect(midTurn.autoPromotedStage).toBeNull();
        expect(fsm.getStage()).toBe('Active_Listening');
      }

      // 第 6 轮达到 activeListeningMaxTurns (6) 且 cognitiveExposure >= 0.4
      const nextTurn = fsm.recordTurn({
        role: 'user',
        emotionalValence: 0.0,
        cognitiveExposure: 0.6,
      });

      expect(fsm.isEmotionallyLocked()).toBe(false);
      expect(nextTurn.autoPromotedStage).toBe('CBT_Stripping');
      expect(fsm.getStage()).toBe('CBT_Stripping');
    });

    it('[PASS] 情绪锁定期间依然保持安全危机熔断最高优先级 (Crisis Escalation is ALWAYS allowed)', () => {
      fsm.setEmotionalValence(-0.9);
      expect(fsm.isEmotionallyLocked()).toBe(true);

      // 无论情绪多么负向，安全危机升级必须无条件立即成功
      const crisisRes = fsm.escalateCrisis('检测到用户准备自残');
      expect(crisisRes).toBe('Crisis_Escalation');
      expect(fsm.isCrisis()).toBe(true);
      expect(fsm.getStage()).toBe('Crisis_Escalation');
    });
  });
});
