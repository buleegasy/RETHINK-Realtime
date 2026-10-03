import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index';
import { encryptAesGcm, decryptAesGcm } from '../src/lib/crypto-helper';
import {
  getSituationalMemory,
  saveSituationalMemory,
  clearMemoryCache,
} from '../src/lib/memory-store';
import { resetKioskRateLimits } from '../src/routes/auth';
import type { SituationalMemory } from '../src/types';

describe('Milestone M2 核心安全与隐私加固测试套件', () => {
  beforeEach(() => {
    clearMemoryCache();
    resetKioskRateLimits();
  });

  describe('1. 端云统一 AES-GCM 加密封装协议验证', () => {
    it('密文遵循 [Salt (16B)] + [IV (12B)] + [Ciphertext + AuthTag] 结构且两端双向可逆', async () => {
      const passcode = 'teacher-safe-2026';
      const plainText = JSON.stringify({
        username: '匿名来访',
        realName: '匿名同学',
        crisisNote: '突发高危绝望倾向',
      });

      const encrypted = await encryptAesGcm(plainText, passcode);
      expect(typeof encrypted).toBe('string');

      // 验证 Base64 解码后总长度满足 Salt(16B) + IV(12B) + Tag(16B) + 明文长度
      const binary = atob(encrypted);
      expect(binary.length).toBeGreaterThanOrEqual(16 + 12 + 16);

      const decrypted = await decryptAesGcm(encrypted, passcode);
      expect(decrypted).toBe(plainText);
      expect(JSON.parse(decrypted).realName).toBe('匿名同学');
    });

    it('错误口令严格拒绝解密，不泄露任何明文片段', async () => {
      const encrypted = await encryptAesGcm('敏感家庭创伤档案', 'teacher-safe-2026');
      await expect(decryptAesGcm(encrypted, 'invalid-teacher-passcode')).rejects.toThrow();
    });
  });

  describe('2. 匿名咨询个案在教师后台解除脱敏 (Unmask) 100% 成功且无 500 异常', () => {
    it('匿名会话危机解密正确返回脱敏身份画像，不抛出 500', async () => {
      // 1. 获取有效教师 Token
      const loginRes = await app.request('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'teacher',
          password: 'counselor2026',
        }),
      });
      const loginData: any = await loginRes.json();
      const teacherToken = loginData.token;
      expect(loginData.success).toBe(true);

      // 2. 模拟前端通过统一端云协议加密的匿名会话报表
      const anonymousSessionId = `sess_anon_crisis_${Date.now()}`;
      const plainPayload = JSON.stringify({
        turns: [{ role: 'user', content: '我好绝望，不想活了' }],
        report: { emotionalValence: -0.8, crisisLevel: 3 },
      });

      const encryptedBundle = await encryptAesGcm(plainPayload, 'teacher-safe-2026');

      // 3. 提交持久化
      const persistRes = await app.request('/api/voice/session/persist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: anonymousSessionId,
          duration: 180,
          stage: 'Crisis_Escalation',
          username: '', // 匿名进线
          encrypted_payload: encryptedBundle,
          transcript_text: '我好绝望，不想活了',
        }),
      });
      expect(persistRes.status).toBe(200);

      // 4. 教师后台使用二次口令解除脱敏
      const unmaskRes = await app.request('/api/admin/crisis/unmask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherToken}`,
        },
        body: JSON.stringify({
          session_id: anonymousSessionId,
          secondary_passcode: 'teacher-safe-2026',
          operator_name: '李老师',
        }),
      });

      expect(unmaskRes.status).toBe(200);
      const unmaskData: any = await unmaskRes.json();
      expect(unmaskData.success).toBe(true);
      expect(unmaskData.realIdentity).toBeDefined();
      expect(unmaskData.realIdentity.realName).toBe('匿名同学');
      expect(unmaskData.realIdentity.username).toBe('匿名来访');
      expect(unmaskData.auditLog.operator_name).toBe('李老师');
    });
  });

  describe('3. memory-store.ts 跨学生创伤记忆严格隔离与防穿透', () => {
    it('相同姓名但不同学号的同学，情景创伤记忆 100% 物理隔离不串线', async () => {
      const mockEnv: any = {}; // 内存模式

      const memoryStudentA: SituationalMemory = {
        userId: 'stu_202401',
        userName: '李华',
        identityContext: '高二(3)班',
        coreConcerns: ['严重父母离异创伤', '家庭暴力倾诉'],
        significantOthers: ['母亲'],
        recentSituations: ['上周末家庭冲突'],
        effectiveStrategies: ['深呼吸放松'],
        summaryParagraph: '该生存在较深家庭心理创伤',
        lastUpdated: Date.now(),
      };

      const memoryStudentB: SituationalMemory = {
        userId: 'stu_202499',
        userName: '李华',
        identityContext: '高三(1)班',
        coreConcerns: ['高考模考发挥失常', '时间管理焦虑'],
        significantOthers: ['班主任'],
        recentSituations: ['一模数学成绩下滑'],
        effectiveStrategies: ['番茄工作法'],
        summaryParagraph: '该生学业压力较大，无家庭创伤史',
        lastUpdated: Date.now(),
      };

      // 写入学生 A
      await saveSituationalMemory(mockEnv, memoryStudentA);

      // 学生 B (亦叫李华) 查询自己记忆：此时学生 B 尚未记录任何记忆，应返回 null，严禁穿透读取学生 A 的家庭创伤
      const memBBeforeSave = await getSituationalMemory(mockEnv, 'stu_202499');
      expect(memBBeforeSave).toBeNull();

      // 按姓名 "李华" 查询应当无法查询（禁用按用户名查询与索引）
      const queryByName = await getSituationalMemory(mockEnv, '李华');
      expect(queryByName).toBeNull();

      // 写入学生 B 记忆
      await saveSituationalMemory(mockEnv, memoryStudentB);

      // 分别读取 A 与 B，确保完全隔离
      const memA = await getSituationalMemory(mockEnv, 'stu_202401');
      const memB = await getSituationalMemory(mockEnv, 'stu_202499');

      expect(memA?.coreConcerns).toContain('严重父母离异创伤');
      expect(memA?.coreConcerns).not.toContain('高考模考发挥失常');

      expect(memB?.coreConcerns).toContain('高考模考发挥失常');
      expect(memB?.coreConcerns).not.toContain('严重父母离异创伤');
    });

    it('匿名会话标识 (sess_*) 与通用占位符不污染或串联任何跨会话记忆', async () => {
      const mockEnv: any = {};
      const anonMemory: SituationalMemory = {
        userId: 'sess_anonymous_999',
        userName: '来访者',
        coreConcerns: ['匿名倾诉'],
        summaryParagraph: '测试',
        lastUpdated: Date.now(),
      };

      await saveSituationalMemory(mockEnv, anonMemory);
      const readResult = await getSituationalMemory(mockEnv, 'sess_anonymous_999');
      expect(readResult).toBeNull();

      const placeholderRead = await getSituationalMemory(mockEnv, 'student_user');
      expect(placeholderRead).toBeNull();
    });

    it('情景记忆缓存容量超过上限 (500条) 时自动遵循先进先出 (FIFO) 淘汰最早条目', async () => {
      clearMemoryCache();
      const mockEnv: any = {};

      for (let i = 1; i <= 501; i++) {
        await saveSituationalMemory(mockEnv, {
          userId: `student_fifo_${i}`,
          userName: `学生${i}`,
          coreConcerns: [`焦虑${i}`],
          summaryParagraph: `摘要${i}`,
          lastUpdated: Date.now(),
        });
      }

      const oldest = await getSituationalMemory(mockEnv, 'student_fifo_1');
      expect(oldest).toBeNull();

      const second = await getSituationalMemory(mockEnv, 'student_fifo_2');
      expect(second).not.toBeNull();
      expect(second?.userId).toBe('student_fifo_2');

      const latest = await getSituationalMemory(mockEnv, 'student_fifo_501');
      expect(latest).not.toBeNull();
      expect(latest?.userId).toBe('student_fifo_501');
    });
  });

  describe('4. 教师后台鉴权防提权硬性门禁测试', () => {
    it('非白名单/未注册用户即使获知教师口令亦返回 401 严禁提权', async () => {
      const res = await app.request('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'attacker_fake_counselor',
          password: 'counselor2026',
        }),
      });

      expect(res.status).toBe(401);
      const data: any = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('不存在或未被授权');
    });
  });

  describe('5. Kiosk 终端设备密钥校验与请求频次限流测试', () => {
    it('当配置了 KIOSK_DEVICE_KEY 时，缺少或错误设备密钥返回 401', async () => {
      const envWithDeviceKey: any = {
        KIOSK_DEVICE_KEY: 'pi-secure-booth-key-2026',
      };

      // 1. 无设备密钥请求拦截
      const rejectRes = await app.request(
        '/api/auth/kiosk-login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: 'booth-01' }),
        },
        envWithDeviceKey,
      );
      expect(rejectRes.status).toBe(401);
      const rejectData: any = await rejectRes.json();
      expect(rejectData.success).toBe(false);
      expect(rejectData.error).toContain('设备密钥校验失败');

      // 2. 携带有效设备密钥头放行
      const passRes = await app.request(
        '/api/auth/kiosk-login',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Kiosk-Device-Key': 'pi-secure-booth-key-2026',
          },
          body: JSON.stringify({ deviceId: 'booth-01' }),
        },
        envWithDeviceKey,
      );
      expect(passRes.status).toBe(200);
      const passData: any = await passRes.json();
      expect(passData.success).toBe(true);
      expect(passData.token).toBeDefined();
    });

    it('超频请求触发 429 频次限制', async () => {
      // 连续发送 30 次正常请求
      for (let i = 0; i < 30; i++) {
        const res = await app.request('/api/auth/kiosk-login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'cf-connecting-ip': '192.168.1.100',
          },
          body: JSON.stringify({ deviceId: 'test-kiosk' }),
        });
        expect(res.status).toBe(200);
      }

      // 第 31 次请求应被 429 频次限制拦截
      const limitRes = await app.request('/api/auth/kiosk-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-connecting-ip': '192.168.1.100',
        },
        body: JSON.stringify({ deviceId: 'test-kiosk' }),
      });
      expect(limitRes.status).toBe(429);
      const limitData: any = await limitRes.json();
      expect(limitData.success).toBe(false);
      expect(limitData.error).toContain('频次限制');
    });
  });
});
