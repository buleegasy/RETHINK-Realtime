import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index';
import { encryptAesGcm, decryptAesGcm } from '../src/lib/crypto-helper';
import { AdminService } from '../src/services/admin-service';
import { SessionRepository } from '../src/repositories/session-repository';
import {
  getSituationalMemory,
  saveSituationalMemory,
  clearMemoryCache,
} from '../src/lib/memory-store';
import { RealtimeGatewayAdapter } from '../src/adapters/realtime-gateway-adapter';
import { BargeInCoordinator } from '../src/services/voice/barge-in-coordinator';
import type { SituationalMemory, SessionRecord, Env } from '../src/types';

describe('Challenger 2 Empirical Deep Stress: Security, Crypto, Memory Isolation & Timing', () => {
  const teacherPasscode = 'teacher-safe-2026';
  const testEnv: Env = {
    ENVIRONMENT: 'development',
    TEACHER_SECONDARY_PASSCODE: teacherPasscode,
    SESSION_CRYPTO_KEY: 'session-master-key-2026',
  } as any;

  beforeEach(() => {
    clearMemoryCache();
  });

  describe('1. AES-GCM Decryption & Admin Crisis Unmask Deep Stress (Never HTTP 500)', () => {
    it('decryptAesGcm 面对极端损坏与对抗输入严格优雅抛出 Error，无未捕获异常或挂死', async () => {
      const validPlain = JSON.stringify({ student: '测试学生', status: 'safe' });
      const validCipher = await encryptAesGcm(validPlain, teacherPasscode);

      // 解码获得原始字节用于位翻转与截断对抗测试
      const rawBinary = atob(validCipher);
      const rawBytes = new Uint8Array(rawBinary.length);
      for (let i = 0; i < rawBinary.length; i++) {
        rawBytes[i] = rawBinary.charCodeAt(i);
      }

      // 构造极端对抗样本集
      const corruptedFuzzPayloads: string[] = [
        '', // 空串
        '   ', // 纯空白
        '!!!@@@###$$$%%%^^^&&&', // 非 Base64 字符
        'not_base64!', // 包含非法字符
        btoa('short'), // 5 字节 (< 12 字节)
        btoa('123456789012'), // 正好 12 字节 (仅 IV 长度，无数据)
        btoa('1234567890123456'), // 16 字节 (仅 Salt 长度)
        btoa('123456789012345678901234567'), // 27 字节 (< 28 字节头)
        btoa(String.fromCharCode(...rawBytes.slice(0, 28))), // 正好 28 字节头，无密文
        btoa(String.fromCharCode(...rawBytes.slice(0, 32))), // 28 字节头 + 4 字节截断数据
      ];

      // 位翻转对抗样本：Salt 翻转、IV 翻转、密文翻转、Tag 翻转
      const saltTampered = new Uint8Array(rawBytes);
      saltTampered[2] ^= 0xff;
      corruptedFuzzPayloads.push(btoa(String.fromCharCode(...saltTampered)));

      const ivTampered = new Uint8Array(rawBytes);
      ivTampered[18] ^= 0xff;
      corruptedFuzzPayloads.push(btoa(String.fromCharCode(...ivTampered)));

      const bodyTampered = new Uint8Array(rawBytes);
      bodyTampered[30] ^= 0xff;
      corruptedFuzzPayloads.push(btoa(String.fromCharCode(...bodyTampered)));

      const tagTampered = new Uint8Array(rawBytes);
      tagTampered[tagTampered.length - 2] ^= 0xff;
      corruptedFuzzPayloads.push(btoa(String.fromCharCode(...tagTampered)));

      for (const payload of corruptedFuzzPayloads) {
        await expect(decryptAesGcm(payload, teacherPasscode)).rejects.toThrow();
      }

      // 验证有效密文搭配错误口令优雅失败
      const wrongPasscodes = [
        'wrong-passcode',
        'TEACHER-SAFE-2026',
        'teacher-safe-2026 ',
        ' teacher-safe-2026',
        '',
        '123',
      ];
      for (const wrongPass of wrongPasscodes) {
        await expect(decryptAesGcm(validCipher, wrongPass)).rejects.toThrow();
      }
    }, 15000);

    it('AdminService.unmaskCrisis 在各类极端入参、损坏密文及非 JSON 载荷下绝对不抛 500', async () => {
      // 场景 A: 密文损坏但二次口令正确 -> 必须返回 400，严禁 500
      const corruptSessionId = `sess_stress_corrupt_${Date.now()}`;
      const corruptRecord: SessionRecord = {
        id: `rec_corrupt_${Date.now()}`,
        session_id: corruptSessionId,
        duration: 100,
        stage: 'Crisis',
        is_crisis: 1,
        crisis_level: 3,
        encrypted_real_identity: 'MalformedBase64_Payload_Not_Valid_At_All',
        created_at: Math.floor(Date.now() / 1000),
      };
      await SessionRepository.save(testEnv, corruptRecord);

      const resCorrupt = await AdminService.unmaskCrisis(testEnv, {
        session_id: corruptSessionId,
        secondary_passcode: teacherPasscode,
        operator_name: '压力测试员',
      });
      expect(resCorrupt.status).toBe(400);
      expect(resCorrupt.success).toBe(false);
      expect(resCorrupt.status).not.toBe(500);

      // 场景 B: 密文成功解密但解密后是无效 JSON 字符串 -> 必须返回 400，严禁 500
      const plainNotJson = 'This is a raw text string, NOT a valid JSON object!';
      const cipherNotJson = await encryptAesGcm(plainNotJson, teacherPasscode);
      const notJsonSessionId = `sess_stress_notjson_${Date.now()}`;
      const notJsonRecord: SessionRecord = {
        id: `rec_notjson_${Date.now()}`,
        session_id: notJsonSessionId,
        duration: 90,
        stage: 'Crisis',
        is_crisis: 1,
        crisis_level: 3,
        encrypted_real_identity: cipherNotJson,
        created_at: Math.floor(Date.now() / 1000),
      };
      await SessionRepository.save(testEnv, notJsonRecord);

      const resNotJson = await AdminService.unmaskCrisis(testEnv, {
        session_id: notJsonSessionId,
        secondary_passcode: teacherPasscode,
        operator_name: '压力测试员',
      });
      expect(resNotJson.status).toBe(400);
      expect(resNotJson.success).toBe(false);
      expect(resNotJson.status).not.toBe(500);

      // 场景 C: 记录中 encrypted_real_identity 为空字符串或未定义
      const emptyIdentitySessionId = `sess_stress_empty_id_${Date.now()}`;
      const emptyIdentityRecord: SessionRecord = {
        id: `rec_empty_${Date.now()}`,
        session_id: emptyIdentitySessionId,
        duration: 50,
        stage: 'Crisis',
        is_crisis: 1,
        crisis_level: 3,
        encrypted_real_identity: '',
        created_at: Math.floor(Date.now() / 1000),
      };
      await SessionRepository.save(testEnv, emptyIdentityRecord);

      const resEmpty = await AdminService.unmaskCrisis(testEnv, {
        session_id: emptyIdentitySessionId,
        secondary_passcode: teacherPasscode,
      });
      expect(resEmpty.status).toBe(400);
      expect(resEmpty.success).toBe(false);
      expect(resEmpty.status).not.toBe(500);

      // 场景 D: session_id 不存在 -> 404，严禁 500
      const res404 = await AdminService.unmaskCrisis(testEnv, {
        session_id: 'non_existent_session_id_999999',
        secondary_passcode: teacherPasscode,
      });
      expect(res404.status).toBe(404);
      expect(res404.success).toBe(false);

      // 场景 E: 口令错误 -> 403，严禁 500
      const res403 = await AdminService.unmaskCrisis(testEnv, {
        session_id: corruptSessionId,
        secondary_passcode: 'wrong_secondary_pass',
      });
      expect(res403.status).toBe(403);
      expect(res403.success).toBe(false);
    });

    it('通过 HTTP 端点 /api/admin/crisis/unmask 发送对抗载荷，100% 杜绝 HTTP 500 响应', async () => {
      // 1. 获取教师 Token
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
      expect(loginRes.status).toBe(200);

      // 2. 准备合规加密的匿名危机记录与损坏记录
      const validSessionId = `sess_http_valid_${Date.now()}`;
      const validCipher = await encryptAesGcm(
        JSON.stringify({
          realName: '匿名危机测试生',
          studentId: '20240001',
          emergencyContact: '13900000000',
        }),
        teacherPasscode,
      );

      await SessionRepository.save(testEnv, {
        id: `rec_hvalid_${Date.now()}`,
        session_id: validSessionId,
        duration: 120,
        stage: 'Crisis',
        is_crisis: 1,
        crisis_level: 3,
        encrypted_real_identity: validCipher,
        created_at: Math.floor(Date.now() / 1000),
      });

      const brokenSessionId = `sess_http_broken_${Date.now()}`;
      await SessionRepository.save(testEnv, {
        id: `rec_hbroken_${Date.now()}`,
        session_id: brokenSessionId,
        duration: 120,
        stage: 'Crisis',
        is_crisis: 1,
        crisis_level: 3,
        encrypted_real_identity: '!!!corrupted-ciphertext-12345!!!',
        created_at: Math.floor(Date.now() / 1000),
      });

      // 3. 对抗请求测试矩阵
      const attackTestCases = [
        {
          name: '空请求体',
          body: '',
          expectedStatus: 400,
        },
        {
          name: '非 JSON 损坏请求体',
          body: '{ invalid_json_syntax: true',
          expectedStatus: 400,
        },
        {
          name: '缺少 session_id',
          body: JSON.stringify({ secondary_passcode: teacherPasscode }),
          expectedStatus: 400,
        },
        {
          name: '缺少 secondary_passcode',
          body: JSON.stringify({ session_id: validSessionId }),
          expectedStatus: 400,
        },
        {
          name: '错误二次口令',
          body: JSON.stringify({ session_id: validSessionId, secondary_passcode: 'wrong-pass' }),
          expectedStatus: 403,
        },
        {
          name: '不存在的 session_id',
          body: JSON.stringify({
            session_id: 'no_such_session',
            secondary_passcode: teacherPasscode,
          }),
          expectedStatus: 404,
        },
        {
          name: '密文损坏会话解密',
          body: JSON.stringify({
            session_id: brokenSessionId,
            secondary_passcode: teacherPasscode,
          }),
          expectedStatus: 400,
        },
      ];

      for (const tc of attackTestCases) {
        const res = await app.request(
          '/api/admin/crisis/unmask',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${teacherToken}`,
            },
            body: tc.body,
          },
          testEnv,
        );

        expect(res.status).not.toBe(500);
        expect(res.status).toBe(tc.expectedStatus);
      }

      // 4. 正确解密基准验证
      const validRes = await app.request(
        '/api/admin/crisis/unmask',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${teacherToken}`,
          },
          body: JSON.stringify({
            session_id: validSessionId,
            secondary_passcode: teacherPasscode,
            operator_name: '正向验收员',
          }),
        },
        testEnv,
      );

      expect(validRes.status).toBe(200);
      const validData: any = await validRes.json();
      expect(validData.success).toBe(true);
      expect(validData.realIdentity.realName).toBe('匿名危机测试生');
    });

    it('高并发混合解密请求下，系统稳定响应，0 次 HTTP 500 崩溃', async () => {
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

      // 创建测试用例
      const validSess = `sess_stress_concur_valid_${Date.now()}`;
      const validEnc = await encryptAesGcm(
        JSON.stringify({ realName: '并发测试生', studentId: '20249999' }),
        teacherPasscode,
      );
      await SessionRepository.save(testEnv, {
        id: `rec_concur_${Date.now()}`,
        session_id: validSess,
        duration: 100,
        stage: 'Crisis',
        is_crisis: 1,
        crisis_level: 3,
        encrypted_real_identity: validEnc,
        created_at: Math.floor(Date.now() / 1000),
      });

      // 40 个并发请求：混合合法、错误口令、损坏载荷
      const runRequest = async (i: number): Promise<Response> => {
        const isCorrupt = i % 4 === 1;
        const isWrongPass = i % 4 === 2;
        const isMissingId = i % 4 === 3;

        let payload: any;
        if (isMissingId) {
          payload = { secondary_passcode: teacherPasscode };
        } else if (isWrongPass) {
          payload = { session_id: validSess, secondary_passcode: 'bad-pass' };
        } else if (isCorrupt) {
          payload = { session_id: 'not_exist_session', secondary_passcode: teacherPasscode };
        } else {
          payload = { session_id: validSess, secondary_passcode: teacherPasscode };
        }

        const res = await app.request(
          '/api/admin/crisis/unmask',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${teacherToken}`,
            },
            body: JSON.stringify(payload),
          },
          testEnv,
        );
        return res;
      };

      const promises: Promise<Response>[] = [];
      for (let i = 0; i < 40; i++) {
        promises.push(runRequest(i));
      }

      const results = await Promise.all(promises);
      for (const r of results) {
        expect(r.status).not.toBe(500);
        expect([200, 400, 403, 404]).toContain(r.status);
      }
    });
  });

  describe('2. Physical Memory Store Isolation by user_id Deep Stress', () => {
    it('SQL 注入与恶意特殊字符构造的 userId 严格隔离且绝不穿透数据', async () => {
      const mockEnv: any = {};

      // 写入合法的对照学生数据
      const victimStudent: SituationalMemory = {
        userId: 'student_legit_001',
        userName: '李华',
        identityContext: '高二(1)班',
        coreConcerns: ['家庭暴力秘密'],
        summaryParagraph: '受害同学档案',
        lastUpdated: Date.now(),
      };
      await saveSituationalMemory(mockEnv, victimStudent);

      // 尝试使用 SQL 注入模式与特异字符构造 userId
      const adversarialUserIds = [
        "' OR '1'='1",
        "student_legit_001' OR '1'='1",
        "admin' --",
        "'; DROP TABLE user_situational_memories; --",
        "' UNION SELECT * FROM user_situational_memories --",
        '__proto__',
        'constructor',
        'prototype',
        'toString',
        'valueOf',
        '../../etc/passwd',
        'student_legit_001\0nullbyte',
        'student_legit_001%20',
        ' ',
        '   ',
        '\t\n',
        'sess_temp_bypass',
        '来访者',
        'student_user',
      ];

      for (const maliciousId of adversarialUserIds) {
        // 尝试使用恶意 ID 读取
        const retrieved = await getSituationalMemory(mockEnv, maliciousId);
        // 绝不能读取出 victimStudent 的家庭创伤秘密
        if (retrieved) {
          expect(retrieved.userId).toBe(maliciousId.trim());
          expect(retrieved.coreConcerns).not.toContain('家庭暴力秘密');
        } else {
          expect(retrieved).toBeNull();
        }

        // 尝试使用恶意 ID 写入
        const attackMemory: SituationalMemory = {
          userId: maliciousId,
          userName: '恶意注入攻击',
          coreConcerns: ['注入污染'],
          summaryParagraph: '注入测试段落',
          lastUpdated: Date.now(),
        };
        await saveSituationalMemory(mockEnv, attackMemory);

        // 再次确认 victimStudent 依然完好无损，未被污染或覆盖
        const victimCheck = await getSituationalMemory(mockEnv, 'student_legit_001');
        expect(victimCheck).not.toBeNull();
        expect(victimCheck?.coreConcerns).toEqual(['家庭暴力秘密']);
      }
    });

    it('20 名同名同班级同姓名的学生并发读写，情景创伤记忆 100% 物理隔离', async () => {
      const mockEnv: any = {};
      const studentCount = 20;

      // 构造 20 名姓名完全相同（均为"张伟"）、班级完全相同（"高三(1)班"）但学号独立的档案
      const students: SituationalMemory[] = Array.from({ length: studentCount }, (_, i) => ({
        userId: `stu_zhangwei_${String(i).padStart(3, '0')}`,
        userName: '张伟',
        identityContext: '高三(1)班',
        coreConcerns: [`独立创伤主题_${i}_专属代号_${i * 7}`],
        significantOthers: [`关系人_${i}`],
        recentSituations: [`独立事件_${i}`],
        effectiveStrategies: [`应对方案_${i}`],
        summaryParagraph: `张伟第${i}号的独立隐私档案`,
        lastUpdated: Date.now() + i,
      }));

      // 并发写入
      await Promise.all(students.map((s) => saveSituationalMemory(mockEnv, s)));

      // 并发随机打乱读取
      const readPromises = students.map(async (expectedStudent, index) => {
        const mem = await getSituationalMemory(mockEnv, expectedStudent.userId);
        expect(mem).not.toBeNull();
        expect(mem?.userId).toBe(expectedStudent.userId);
        expect(mem?.userName).toBe('张伟');
        expect(mem?.coreConcerns).toEqual([`独立创伤主题_${index}_专属代号_${index * 7}`]);
        expect(mem?.summaryParagraph).toBe(`张伟第${index}号的独立隐私档案`);

        // 验证绝对不包含其他 19 位同学的任何创伤关键词
        for (let j = 0; j < studentCount; j++) {
          if (j !== index) {
            expect(mem?.coreConcerns).not.toContain(`独立创伤主题_${j}_专属代号_${j * 7}`);
          }
        }
      });

      await Promise.all(readPromises);

      // 验证通过全局姓名 "张伟" 检索必须返回 null（防止同名全局共享缓存漏洞复活）
      const nameQueryResult = await getSituationalMemory(mockEnv, '张伟');
      expect(nameQueryResult).toBeNull();
    });

    it('Mock D1 持久化存储严格按 user_id 过滤，SQL 语句无 OR user_name 跨表串线', async () => {
      const executedSqls: string[] = [];
      const boundParams: any[] = [];
      const d1Store = new Map<string, any>();

      const mockDb: any = {
        prepare: (sql: string) => {
          executedSqls.push(sql);
          let currentParams: any[] = [];
          return {
            bind: (...params: any[]) => {
              currentParams = params;
              boundParams.push(params);
              return {
                run: async () => {
                  if (sql.includes('INSERT INTO user_situational_memories')) {
                    d1Store.set(currentParams[0], {
                      user_id: currentParams[0],
                      user_name: currentParams[1],
                      memory_json: currentParams[8],
                    });
                  }
                  return { success: true };
                },
                first: async () => {
                  if (sql.includes('SELECT * FROM user_situational_memories WHERE user_id = ?')) {
                    const row = d1Store.get(currentParams[0]);
                    return row || null;
                  }
                  return null;
                },
              };
            },
            run: async () => ({ success: true }),
          };
        },
      };

      const d1Env: Env = { DB: mockDb } as any;

      // 写入两名学生
      await saveSituationalMemory(d1Env, {
        userId: 'stu_d1_001',
        userName: '李华',
        coreConcerns: ['D1创伤1'],
        summaryParagraph: 'D1学生1档案',
        lastUpdated: Date.now(),
      });

      await saveSituationalMemory(d1Env, {
        userId: 'stu_d1_002',
        userName: '李华',
        coreConcerns: ['D1创伤2'],
        summaryParagraph: 'D1学生2档案',
        lastUpdated: Date.now(),
      });

      // 清除内存缓存强制触发 D1 查询
      clearMemoryCache();

      const mem1 = await getSituationalMemory(d1Env, 'stu_d1_001');
      clearMemoryCache();
      const mem2 = await getSituationalMemory(d1Env, 'stu_d1_002');

      expect(mem1?.coreConcerns).toEqual(['D1创伤1']);
      expect(mem2?.coreConcerns).toEqual(['D1创伤2']);

      // 审计执行过的所有 SELECT SQL 语句
      const selectSqls = executedSqls.filter((s) => s.includes('SELECT'));
      for (const sql of selectSqls) {
        expect(sql).toContain('WHERE user_id = ?');
        expect(sql).not.toContain('user_name = ?');
        expect(sql).not.toContain('OR user_name');
      }
    });
  });

  describe('3. Voice Streaming Timing, Barge-In & Concurrency Stress', () => {
    it('BargeInCoordinator 高频并发打断与轮次推进保证单调序列与精准作废', () => {
      const coordinator = new BargeInCoordinator();

      // 验证初始状态
      expect(coordinator.getSequenceId()).toBe(0);

      const abortedSignals: boolean[] = [];

      // 连续开启 10 轮
      for (let i = 1; i <= 10; i++) {
        const turn = coordinator.nextTurn();
        expect(turn.sequenceId).toBe(i);
        expect(coordinator.isValid(turn.sequenceId)).toBe(true);

        // 前一轮必定失效
        expect(coordinator.isValid(turn.sequenceId - 1)).toBe(false);

        // 监听 signal abort
        const sig = turn.signal;
        sig.addEventListener('abort', () => {
          abortedSignals.push(true);
        });
      }

      // 执行主动打断
      const interruptSeq = coordinator.interrupt();
      expect(interruptSeq).toBe(11);
      expect(coordinator.isValid(10)).toBe(false);
      expect(coordinator.isValid(11)).toBe(true);

      // 全部前 10 轮的 AbortController 都触发了 abort
      expect(abortedSignals.length).toBe(10);
    });

    it('RealtimeGatewayAdapter 对各类畸形 turn_detection 强行归整为 create_response: false', () => {
      const malformedPayloads = [
        { turn_detection: null },
        { turn_detection: undefined },
        { turn_detection: {} },
        { turn_detection: { create_response: true } },
        { turn_detection: { type: 'server_vad', create_response: true, threshold: 0.9 } },
        { turn_detection: { type: 'client_vad', create_response: true } },
        { turn_detection: 'invalid_string' },
        {},
      ];

      for (const payload of malformedPayloads) {
        const normalized = RealtimeGatewayAdapter.normalizeSessionUpdatePayload(payload as any);
        const vad = normalized.turn_detection as Record<string, unknown> | null | undefined;
        if (vad && typeof vad === 'object') {
          expect(vad.create_response).toBe(false);
        }
      }
    });
  });
});
