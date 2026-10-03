# Project: RETHINK Realtime Voice Refactoring & Hardening

## Architecture
RETHINK Realtime Voice 是校园全双工语音心理咨询系统，包含三大部分：
1. **Web 前端 (React + Vite)**: 电话亭交互（`useTelephoneBooth`）、全双工流式会话控制（`useVoiceSession`）、音频图谱处理（`AudioGraphService`）、端侧 WebCrypto 加密（`WebCryptoAesGcm`）、教师管理后台视图。
2. **Cloudflare Worker 服务端**: 
   - 实时中继调度中心（`RelaySessionCoordinator`、`RealtimeGatewayAdapter`、`MinimaxVoiceRelay`）
   - L1 本地安全过滤与消歧引擎（`safety-filter.ts`）与 L2 旁路安全分析
   - 情绪感知与 CBT 认知行为疗法状态机（`packages/shared` 与 `shadowPipeline`）
   - 隐私情景记忆隔离仓储（`memory-store.ts`）与端云统一加密解密（`crypto-helper.ts`）
   - 管理后台服务（`admin-service.ts`）与鉴权路由（`routes/auth.ts`）
3. **Cloudflare Pages 边缘代理**: `functions/api/[[path]].js` 处理 API 转发与 WebSocket 101 双向协议升级。

## Code Layout
- `worker/src/lib/safety-filter.ts`: L1 危机消歧引擎与敏感词过滤
- `worker/src/lib/crypto-helper.ts`: 服务端 AES-GCM 加密与 PBKDF2 密钥派生
- `web/src/lib/pipelines/security/webCryptoAesGcm.ts`: 前端 WebCrypto AES-GCM 加解密
- `worker/src/lib/memory-store.ts`: D1 数据库情景记忆存取
- `worker/src/services/admin-service.ts`: 教师鉴权、危机解密脱敏、分析统计 (Facade)
- `worker/src/services/admin/`: 拆分后的高内聚后台子服务 (Auth, Crisis, Reporting)
- `worker/src/routes/auth.ts`: 用户登录与 Kiosk 设备认证
- `worker/src/adapters/realtime-gateway-adapter.ts`: 实时网关协议适配与 Server VAD 配置
- `worker/src/services/voice/relay-session-coordinator.ts`: 实时双向音频会话协调与影子大脑调度
- `worker/src/services/voice/crisis-handler.ts`: 危机事件拦截与连接断流
- `functions/api/[[path]].js`: Cloudflare Pages 边缘 WebSocket 101 升级代理
- `web/src/lib/audio/audioGraph.ts`: 麦克风录音与音频播放图谱 (stopRecording)
- `web/src/components/common/CrisisOverlay.tsx`: 危机弹窗与挂机联动
- `packages/shared/src/`: CBT 状态机定义与情绪驱动流转契约
- `web/src/hooks/useTelephoneBooth.ts`: 电话亭摘机按键监听 (admin 隔离)
- `web/src/hooks/useVoiceSession.ts`: 语音会话状态管理 (解耦后的轻量协调层)
- `web/src/hooks/useVoiceAudio.ts`: 音频图与音量可视化子 Hook
- `web/src/hooks/useSessionPersistence.ts`: 加密与持久化同步子 Hook
- `worker/src/lib/rag/bge-retriever.ts`: 胶囊检索器 (清理伪 BM25 与死代码)

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | 词边界切分与程度补语消歧 | 使用 `Intl.Segmenter` 切分词边界，识别“跳楼梯/跳楼机”及“形容词+得+我想死”程度补语，杜绝 22 类误报 | M1 | R1 |
| F2 | 复合词与日常修辞白名单 | 对“放血/开煤气/烧炭/天台吹风”等日常料理与生活修辞实施上下文判定 | M1 | R1 |
| F3 | 句法否定与阻抗消歧状态机 | 识别双重否定、反问反驳、现场阻抗、意念转归失败与维特效应模仿，消除 26 类漏报 | M1 | R1 |
| F4 | 端云 AES-GCM 封装协议对齐 | 前端与后端统一采用 `[Salt 16B] + [IV 12B] + [Ciphertext + Tag]` 配合 100k PBKDF2，彻底修复 Unmask 500 异常 | M2 | R2 |
| F5 | 跨学生情景记忆严格隔离 | 移除 `OR user_name = ?` 及以姓名为键的共享全局缓存，强制仅按 `user_id` 物理隔离 | M2 | R2 |
| F6 | 教师后台鉴权与 Kiosk 防提权 | 修复 `authenticateTeacher` 针对未注册用户的提权后门；为 `kiosk-login` 增加设备密钥与频次限流 | M2 | R2 |
| F7 | Server VAD 与影子大脑时序消歧 | `turn_detection` 调整为 `create_response: false`，由影子大脑注入 CBT 决策后显式调用 `response.create` | M3 | R3 |
| F8 | Cloudflare Pages WebSocket 101 代理 | 引入 `WebSocketPair` 显式返回 101 Switching Protocols，解决边缘握手失效 | M3 | R3 |
| F9 | 危机干预闭环断流 | 危机触发时，前端停止录音采集、弹窗关闭强制挂机、服务端切断双向 WebSocket | M3 | R3 |
| F10 | CBT 状态机情绪极性与认知暴露驱动 | 废除固定 2/4 轮盲推，引入 `emotionalValence` 负极性阻滞与暴露度评估自适应流转 | M4 | R4 |
| F11 | 电话亭全局按键隔离 | 针对 Admin 模式隔离 Space/Enter 键盘监听，防止后台管理操作误拨号 | M4 | R4 |
| F12 | 上帝模块解耦与代码异味清理 | 拆解 `useVoiceSession.ts` 与 `admin-service.ts`，清理 `bge-retriever.ts` 伪 BM25 与死代码，治理空 catch 块 | M4 | R4 |
| F13 | 64 组高危对抗基准测试集 | 建立 26 FN + 22 FP + 16 CTL 的刚性回归门禁，确保准确率 100% | M5 (Test Track) | R5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | R1 危机消歧与安全拦截引擎 | F1, F2, F3 | none | DONE |
| M2 | R2 数据安全与身份隐私协议 | F4, F5, F6 | none | DONE |
| M3 | R3 全双工流式时序与边缘代理 | F7, F8, F9 | none | DONE |
| M4 | R4 CBT 状态机与架构异味重构 | F10, F11, F12 | none | DONE |
| M5 | R5 对抗基准与全量 E2E 门禁验收 | F13, 全量验收 | M1, M2, M3, M4 | IN_PROGRESS |

