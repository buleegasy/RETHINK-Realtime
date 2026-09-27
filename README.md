# RETHINK Realtime

RETHINK Realtime 是一套面向校园心理健康与情绪陪伴场景设计的全双工实时语音交互与危机干预系统。系统结合认知行为疗法（CBT）结构化对话流，基于 Cloudflare Workers 边缘计算与现代 Web Audio 技术构建，提供低延迟语音交互、实时打断（Barge-in）、敏感词消歧硬过滤、双轨危机熔断及教师管理后台。

---

## 核心特性

- **全双工流式交互与即时打断 (Barge-in)**：基于 Web Audio API（优先启用 `AudioWorkletNode` 独立渲染线程，自动降级）与标准 WebSocket 双向流式通信，支持用户在智能体发声时随时插话打断，扬声器瞬态保护抑制自激回声。
- **CBT 有限状态机 (FSM) 对话流转**：同构状态机严密驱动会话由「积极倾听」到「ABC 事实与主观认知剥离」，再到「苏格拉底式提问与认知重塑」，防止无意义寒暄或陷入重复死锁。
- **双轨危机干预与否定语义消歧引擎**：
  - **L1 边缘硬过滤**：基于 AC 自动机多模式串与四重否定消除算法（识别“我并不想死”、“劝阻他自杀”等反向语境），实现 <5ms 零误报快速判决；
  - **L2 异步语义熔断**：DeepSeek V4 Flash 旁路语义分析，精准识别隐晦绝望与告别意图；
  - **L3 实体阻断与联动**：触发危机时切断语音、弹出紧急守护面板并向校园管理端发送 Webhook 告警。
- **双层认知架构 (Dual-Tier Engine)**：
  - **实时影子大脑 (Shadow Brain)**：用户转写完成后并行推演（<300ms），向语音流注入 1-2 句精准认知引导指令；
  - **挂机评估简报 (Session Report)**：挂机后异步提炼 ABC 认知歪曲、情绪轨迹及定制化课后微行动。
- **隐私保护与教师管理审计后台**：
  - 会话数据去标识化归档；
  - 仅在触发危机时将真实身份通过 AES-256-GCM 密文存储；
  - 专职心理教师通过独立二次安全口令鉴权核验后方可解密，全程审计留痕。

---

## 系统架构拓扑

```
[ 客户端浏览器 / 树莓派终端 ]
       │
       │ (PCM 24kHz / AudioWorkletNode / WebSocket)
       ▼
[ Cloudflare Workers 边缘网关 ]
  ├── routes/voice.ts (轻量路由控制器)
  ├── services/voice-service.ts (全双工打断时序协调、BGE 知识检索)
  ├── adapters/realtime-gateway-adapter.ts (实时语音协议适配层)
  └── repositories/session-repository.ts (D1 数据库单例持久化)
       │
       ├── MiniMax Realtime (实时全双工语音服务)
       ├── DeepSeek V4 Flash (影子大脑推演与建档简报)
       └── BGE-M3 (CBT 心理干预策略向量检索)
```

---

## 项目结构

```
RETHINK-Realtime/
├── web/                               # 前端工程 (React 18 + Vite + Tailwind CSS)
│   ├── src/
│   │   ├── components/
│   │   │   ├── admin/                 # 心理教师大盘、危机分诊中心、个案抽屉
│   │   │   ├── voice/                 # 实时语音界面与动效球 (VoiceOrb, VoiceView)
│   │   │   └── common/                # 危机接管浮层 (CrisisOverlay)
│   │   ├── hooks/                     # 语音会话状态机与看门狗 Hook
│   │   ├── lib/
│   │   │   ├── audio/                 # AudioWorkletProcessor、重采样、音频图谱
│   │   │   ├── cbt/                   # CBT 有限状态机核心实现
│   │   │   └── minimax/               # MiniMax Realtime 客户端驱动
│   │   └── store/                     # Zustand 状态管理中心
│   └── test/                          # 前端单元测试 (Vitest)
│
├── worker/                            # 边缘服务端 (Cloudflare Workers + Hono)
│   ├── migrations/                    # Cloudflare D1 规范迁移脚本
│   ├── src/
│   │   ├── adapters/                  # 协议适配层 (realtime-gateway-adapter)
│   │   ├── repositories/              # 数据持久层 (session-repository, audit-repository)
│   │   ├── services/                  # 业务服务层 (voice-service, admin-service)
│   │   ├── routes/                    # 轻量薄路由 (voice.ts, admin.ts, auth.ts)
│   │   ├── lib/                       # 安全过滤、向量检索、加密解密工具
│   │   └── index.ts                   # Hono 入口与全局中间件
│   └── test/                          # 服务端单元测试 (Vitest)
│
└── package.json                       # Monorepo 依赖管理与发布脚本
```

---

## 快速开始

### 1. 运行环境准备
- Node.js >= 18.0.0
- npm >= 9.0.0
- Cloudflare Wrangler CLI >= 3.0.0

### 2. 安装项目依赖
```bash
npm install
```

### 3. 配置服务端环境变量
复制 `worker/.dev.vars.example` 为 `worker/.dev.vars`，填入对应配置：

```ini
# 实时语音网关配置 (MiniMax Realtime)
REALTIME_UPSTREAM_KEY=your_minimax_realtime_key
REALTIME_UPSTREAM_URL=https://api.apiyi.com/v1
REALTIME_MODEL=minimax-realtime

# 影子大脑与评估模型配置 (DeepSeek V4 Flash)
OPENROUTER_API_KEY=your_deepseek_flash_key
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=deepseek/deepseek-v4-flash

# BGE-M3 向量检索配置 (可选)
EMBEDDING_API_KEY=your_embedding_api_key
EMBEDDING_API_URL=https://api.apiyi.com/v1

# 危机干预与教师管理
TEACHER_SECONDARY_PASSCODE=teacher-safe-2026
CRISIS_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxxx
```

### 4. 初始化 D1 数据库
```bash
cd worker
wrangler d1 migrations apply DB --local
cd ..
```

### 5. 启动本地开发
```bash
# 启动前端开发服务器 (默认端口 5173)
npm run dev

# 在另一个终端启动边缘 Worker 开发服务
npm run dev:worker
```

---

## 自动化测试与构建

项目采用 Vitest 进行端到端全链路单元测试，包括状态机死锁边界、否定消歧过滤算法、音频打断时序以及管理后台接口：

```bash
# 运行全量单元测试 (前端 + 服务端)
npm test

# 分别运行子模块测试
npm test --workspace=web
npm test --workspace=worker

# 生产环境打包构建
npm run build
```

---

## 生产部署

### 前端部署 (Cloudflare Pages)
由于采用了 NPM Workspace 结构，在 Cloudflare Pages 设置中将根目录保持为空（仓库根目录），构建命令填入：
```bash
npm run build
```
输出目录填入：`dist`

### 服务端部署 (Cloudflare Workers)
在 `worker/` 目录下执行部署：
```bash
cd worker
wrangler deploy
```

---

## 常见问题

- **Q: 为什么在无可用麦克风硬件的环境中（如自动化测试），音频捕获能够正常运行？**
  系统内置环境嗅探与自动降级机制：在缺乏 `AudioWorklet` 的 JSDOM / Node.js 虚拟环境中，自动回退到轻量处理管道，确保业务测试与非安全域运行时的连续性。
- **Q: 学生通话中断或网络抖动后，历史对话与情景记忆如何保障？**
  服务端由 `BargeInCoordinator` 进行会话 Sequence 追踪，通话关闭时由 `VoiceService` 自动执行记忆提炼并增量回写到记忆库，学生再次连入时自动携带既往认知背景。
