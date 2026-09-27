import { describe, it, expect, beforeEach } from 'vitest';
import { CbtStateMachine } from '../src/lib/cbt-fsm';

describe('Worker CbtStateMachine (服务端对齐验证)', () => {
  let fsm: CbtStateMachine;

  beforeEach(() => {
    fsm = new CbtStateMachine();
  });

  it('初始状态为 Active_Listening 且正常流转至 Socratic_Questioning', () => {
    expect(fsm.getStage()).toBe('Active_Listening');
    const res1 = fsm.transition('CBT_Stripping');
    expect(res1.success).toBe(true);
    expect(fsm.getStage()).toBe('CBT_Stripping');

    const res2 = fsm.transition('Socratic_Questioning');
    expect(res2.success).toBe(true);
    expect(fsm.getStage()).toBe('Socratic_Questioning');
  });

  it('危机升级为终态，拒绝任何后续降级', () => {
    fsm.escalateCrisis();
    expect(fsm.isCrisis()).toBe(true);
    expect(fsm.canTransition('Active_Listening').allowed).toBe(false);
    expect(fsm.transition('Active_Listening').success).toBe(false);
    expect(fsm.getStage()).toBe('Crisis_Escalation');
  });

  it('自动看门狗与越级校正', () => {
    const res = fsm.transition('Socratic_Questioning');
    expect(res.success).toBe(true);
    expect(res.stage).toBe('CBT_Stripping');
  });
});
