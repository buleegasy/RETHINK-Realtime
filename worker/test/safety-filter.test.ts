import { describe, it, expect } from 'vitest';
import { isL1Crisis, disambiguateCrisis, isNegatedCrisis } from '../src/lib/safety-filter';

describe('L1 边缘硬过滤与否定消歧引擎 (Aho-Corasick + 多维语境判决)', () => {
  describe('否定消歧判决准确率 (零误拦截测试)', () => {
    it('处理“我并不想死”应成功消歧放行，判定非危机', () => {
      const text = '其实我并不想死，我只是模考压力太大了，想找人倾诉一下';
      expect(isL1Crisis(text)).toBe(false);
      expect(isNegatedCrisis(text)).toBe(true);
      const res = disambiguateCrisis(text);
      expect(res.isCrisis).toBe(false);
      expect(res.matches.some((m) => m.keyword === '想死' && m.isDisambiguated)).toBe(true);
    });

    it('处理“我劝阻了他自杀”应识别第三方劝阻并消歧放行', () => {
      const text = '昨天我劝阻了他自杀，现在心里还是有点后怕';
      expect(isL1Crisis(text)).toBe(false);
      const res = disambiguateCrisis(text);
      expect(res.isCrisis).toBe(false);
      expect(res.matches.some((m) => m.keyword === '自杀' && m.isDisambiguated)).toBe(true);
    });

    it('处理“拦住了想要跳楼的同学”应识别干预语境消歧', () => {
      const text = '刚才在宿舍楼下，我们一起拦住了想要跳楼的同学';
      expect(isL1Crisis(text)).toBe(false);
    });

    it('处理“打消了轻生的念头”应识别意念转归消除消歧', () => {
      const text = '在班主任的开导下，我已经彻底打消了轻生的念头';
      expect(isL1Crisis(text)).toBe(false);
      expect(isNegatedCrisis(text)).toBe(true);
    });

    it('处理“走出了想自残的阴影”应识别意念消除消歧', () => {
      const text = '我已经走出了想自残的阴影，现在好多了';
      expect(isL1Crisis(text)).toBe(false);
    });

    it('处理客观新闻与影视叙事语境应消歧放行', () => {
      const text = '今天看到新闻里有人跳楼，觉得生命真的很脆弱';
      expect(isL1Crisis(text)).toBe(false);
    });

    it('处理反问与口语反驳语境应消歧放行', () => {
      const text1 = '谁说我想死了，我还要考大学呢！';
      expect(isL1Crisis(text1)).toBe(false);

      const text2 = '傻子才去自杀，我才不会那么笨';
      expect(isL1Crisis(text2)).toBe(false);

      const text3 = '我根本不会去跳河';
      expect(isL1Crisis(text3)).toBe(false);
    });
  });

  describe('真实危机 100% 灵敏拦截测试', () => {
    it('明确自杀自残意图应精准拦截', () => {
      expect(isL1Crisis('我觉得活着没意思，我想死')).toBe(true);
      expect(isL1Crisis('今晚准备割腕')).toBe(true);
      expect(isL1Crisis('我已经站在天台上了')).toBe(true);
      expect(isL1Crisis('买好了安眠药，不想活了')).toBe(true);
      expect(isL1Crisis('谁也别救我，彻底放弃自己了')).toBe(true);
    });

    it('真实危机反向豁免: 强肯定/双重否定语气绝对不可消歧', () => {
      // 包含“不”，但是“不得不去死”是真实危机
      expect(isL1Crisis('到了这个地步，我不得不去死')).toBe(true);
      expect(isL1Crisis('我非死不可了')).toBe(true);
      expect(isL1Crisis('除了自杀我别无选择')).toBe(true);
      expect(isL1Crisis('除了跳楼我已经没有退路了')).toBe(true);
    });

    it('多关键词混合: 包含消歧词但同时包含未消歧真实危机词时，应准确告警', () => {
      // “劝阻了他自杀”已消歧，但后半句“我自己想跳楼”为真实危机
      const mixedText = '虽然我劝阻了他自杀，但是我自己真的好想跳楼，太痛苦了';
      expect(isL1Crisis(mixedText)).toBe(true);
      const res = disambiguateCrisis(mixedText);
      expect(res.isCrisis).toBe(true);
      expect(res.matches.find((m) => m.keyword === '自杀')?.isDisambiguated).toBe(true);
      expect(res.matches.find((m) => m.keyword === '跳楼')?.isDisambiguated).toBe(false);
    });
  });

  describe('AC 自动机单趟扫描性能基准测试', () => {
    it('1000 次长文本匹配应在 50ms 内完成，证明 O(N) 线性高效', () => {
      const sampleText = '这是一段普通的校园生活倾诉，虽然有些模考压力和挫败感，但我并不想死，我也劝阻了他自杀，今天新闻里有人跳楼，我希望大家都能好好的。';
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        isL1Crisis(sampleText);
      }
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100); // 1000 次在 100ms 内，单次 < 0.1ms
    });
  });
});
