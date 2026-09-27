import { describe, it, expect, beforeEach } from 'vitest';
import { CbtStateMachine } from '../src/lib/cbt/cbtStateMachine';

describe('CbtStateMachine (CBT 有限状态机流转严密性测试)', () => {
  let fsm: CbtStateMachine;

  beforeEach(() => {
    fsm = new CbtStateMachine({
      initialStage: 'Active_Listening',
      minDwellTurns: 2,
      oscillationThreshold: 2,
      oscillationCooldownTurns: 3,
      activeListeningMaxTurns: 5,
      strippingMaxTurns: 6,
    });
  });

  it('初始状态应为 Active_Listening，轮次为 0', () => {
    expect(fsm.getStage()).toBe('Active_Listening');
    expect(fsm.getTurnsInCurrentStage()).toBe(0);
    expect(fsm.isCrisis()).toBe(false);
  });

  it('合法正向流转: Active_Listening -> CBT_Stripping -> Socratic_Questioning', () => {
    const res1 = fsm.transition('CBT_Stripping', '事实浮现');
    expect(res1.success).toBe(true);
    expect(res1.stage).toBe('CBT_Stripping');
    expect(fsm.getStage()).toBe('CBT_Stripping');

    const res2 = fsm.transition('Socratic_Questioning', '识别自动思维');
    expect(res2.success).toBe(true);
    expect(res2.stage).toBe('Socratic_Questioning');
    expect(fsm.getStage()).toBe('Socratic_Questioning');
  });

  it('越级跃迁拦截与自愈: Active_Listening 直接跳 Socratic_Questioning 应自动平滑修正为 CBT_Stripping', () => {
    const res = fsm.transition('Socratic_Questioning', '越级请求');
    expect(res.success).toBe(true);
    expect(res.stage).toBe('CBT_Stripping');
    expect(res.reason).toContain('修正');
    expect(fsm.getStage()).toBe('CBT_Stripping');
  });

  it('滞后保护 (Hysteresis): CBT_Stripping 未停留足够轮次时禁止回退至 Active_Listening', () => {
    fsm.transition('CBT_Stripping');
    // 刚进入 CBT_Stripping，轮次为 0 < minDwellTurns (2)
    const res = fsm.transition('Active_Listening', '学生抗拒');
    expect(res.success).toBe(false);
    expect(res.stage).toBe('CBT_Stripping');
    expect(res.reason).toContain('滞后保护');

    // 经历 2 轮对话
    fsm.recordTurn('user');
    fsm.recordTurn('assistant');
    expect(fsm.getTurnsInCurrentStage()).toBe(2);

    // 此时满足停留门槛，允许受控回退
    const resAfterDwell = fsm.transition('Active_Listening', '学生情绪反弹');
    expect(resAfterDwell.success).toBe(true);
    expect(resAfterDwell.stage).toBe('Active_Listening');
  });

  it('防循环活锁与震荡抑制 (Anti-Oscillation): 反复往返达阈值后触发抑制锁定', () => {
    // 模拟合法的往返流转
    // 1. 推进到 Stripping
    fsm.transition('CBT_Stripping');
    fsm.recordTurn('user');
    fsm.recordTurn('assistant');

    // 2. 第一次回退到 Active_Listening
    fsm.transition('Active_Listening');
    fsm.recordTurn('user');
    fsm.recordTurn('user');
    fsm.recordTurn('user'); // 消耗 cooldown

    // 3. 再次推进到 Stripping
    fsm.transition('CBT_Stripping');
    fsm.recordTurn('user');
    fsm.recordTurn('assistant');

    // 4. 第二次尝试往返触发震荡检测
    const resBlocked = fsm.transition('Active_Listening');
    expect(resBlocked.success).toBe(false);
    expect(resBlocked.isOscillationBlocked).toBe(true);
    expect(fsm.getStage()).toBe('CBT_Stripping');
  });

  it('停滞看门狗 (Auto-Pacing Watchdog): 超过最大轮次自动推进', () => {
    expect(fsm.getStage()).toBe('Active_Listening');

    // 连续 4 轮
    for (let i = 0; i < 4; i++) {
      const r = fsm.recordTurn('user');
      expect(r.autoPromotedStage).toBeNull();
    }

    // 第 5 轮达阈值，看门狗推进到 CBT_Stripping
    const r5 = fsm.recordTurn('user');
    expect(r5.autoPromotedStage).toBe('CBT_Stripping');
    expect(fsm.getStage()).toBe('CBT_Stripping');
  });

  it('危机单向吸收终态 (Sink State): 一旦进入 Crisis_Escalation，普通指令绝对禁止降级', () => {
    fsm.escalateCrisis('检测到自残风险');
    expect(fsm.isCrisis()).toBe(true);
    expect(fsm.getStage()).toBe('Crisis_Escalation');

    // 尝试转回普通咨询状态
    const res1 = fsm.transition('Active_Listening');
    expect(res1.success).toBe(false);
    expect(fsm.getStage()).toBe('Crisis_Escalation');

    const res2 = fsm.transition('Socratic_Questioning');
    expect(res2.success).toBe(false);
    expect(fsm.getStage()).toBe('Crisis_Escalation');
  });
});
