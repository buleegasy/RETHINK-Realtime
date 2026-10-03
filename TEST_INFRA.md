# E2E Test Infra: RETHINK Realtime Voice

## Test Philosophy
- Opaque-box & Requirement-driven: 完全从 ORIGINAL_REQUEST.md 的验收指标出发，不依赖内部临时变量。
- Methodology: Category-Partition (26 FN + 22 FP), Boundary Value Analysis, Negative Testing, Real-World Full Flow Testing.
- Zero False Negatives (26 类复杂危机反转句 0 漏报) & Zero False Positives (22 类日常生活借喻 0 误拦截).

## Feature Inventory & Test Coverage
| # | Feature | Source | Tier 1 (Isolation) | Tier 2 (Boundary) | Tier 3 (Interaction) | Tier 4 (E2E Flow) |
|---|---------|--------|:------------------:|:-----------------:|:--------------------:|:-----------------:|
| 1 | R1 L1 危机消歧引擎 | ORIGINAL_REQUEST §R1 | 26 危机反转用例 | 22 误报词边界用例 | 16 正常/极值对照用例 | 端到端拦截挂机用例 |
| 2 | R2 端云 AES-GCM 加密 | ORIGINAL_REQUEST §R2 | 加解密双向验证 | 16B Salt / 12B IV 边界 | 前端加密-后端解密联动 | 教师后台 Unmask 流程 |
| 3 | R2 情景记忆隔离 | ORIGINAL_REQUEST §R2 | 单用户正常存取 | 同名/空名边界隔离 | 跨会话并发写入 | 真实咨询上下文抽取 |
| 4 | R2 鉴权与提权防护 | ORIGINAL_REQUEST §R2 | 正常管理员登录 | 未注册账号/空口令拦截 | Kiosk 设备密钥校验 | 越权访问控制拦截 |
| 5 | R3 全双工流式时序 | ORIGINAL_REQUEST §R3 | `create_response: false` 验证 | 1200ms 超时降级 | 影子大脑注入与发声时序 | 打断与 sequenceId 失效 |
| 6 | R3 Pages WebSocket 代理 | ORIGINAL_REQUEST §R3 | 101 Upgrade 响应头 | 非法升级请求降级 | 双向消息管道转发 | 真实 WebSocket 通信 |
| 7 | R3 危机断流闭环 | ORIGINAL_REQUEST §R3 | `stopRecording` 单元测试 | 弹窗取消触发挂机 | 双向连接切断验证 | 全链路危机触发关断 |
| 8 | R4 CBT 状态机情绪驱动 | ORIGINAL_REQUEST §R4 | 基础轮数流转测试 | 负向情绪极性阻滞 (< -0.3) | 认知暴露度推进计算 | 完整多轮咨询阶段递进 |
| 9 | R4 全局事件与异味治理 | ORIGINAL_REQUEST §R4 | admin 模式禁用 Space | 输入框焦点事件边界 | 多模式切换状态隔离 | 伪 BM25 与死代码清理 |

## Test Architecture
- Test Runner: `npm test` (基于 Vitest，分别运行 web 与 worker 测试套件)
- Adversarial Test Suite: `worker/test/adversarial-safety.test.ts` (涵盖 64 组高危反转与借喻用例)
- Security Test Suite: `worker/test/security-crypto.test.ts` 与 `worker/test/auth-guard.test.ts`
- Streaming Test Suite: `worker/test/streaming-timing.test.ts`
- Pass/Fail Semantics: 退出码 0，无未捕获异常，0 failed tests。
