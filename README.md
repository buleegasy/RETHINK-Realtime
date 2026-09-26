# RETHINK Realtime

> 校园场景端到端全双工实时语音交互与心理危机干预系统
> (Campus Real-time Full-Duplex Voice Dialogue & Psychological Crisis Interception Architecture)

---

## 1. 系统定义与设计边界

RETHINK Realtime 是一套面向校园心理健康支持场景构建的端到端全双工语音交互与危机干预系统。系统以认知行为疗法（Cognitive Behavioral Therapy, CBT）为理论方法论支撑，在边缘计算节点实现双向低延迟音频流处理、双层异步认知推演、向量检索增强（RAG）以及多级安全熔断。

### 1.1 核心指标与设计约束
- **端到端音频通信延迟**：物理采集至远端首包到达控制在 600ms 以内；打断响应（Barge-in）时延小于 150ms。
- **认知影子推演时延预算**：在线旁路推理控制在 300ms 以内，不阻塞实时语音合成发声。
- **对话输出约束**：实时语音输出限制为 1-2 句同伴平视口语（单次字数 $\le 40$ 字），避免长篇说教与成人/职场词汇泛化。
- **隐私保护原则**：全链路去除明文个人可识别信息（PII），高危身份采用 AES-256-GCM 加密，解密受限于独立二次安全口令认证。

---

## 2. 系统总体技术架构

系统涵盖前端音频捕获、边缘路由转发、云端实时语音生成、异步影子大脑分析以及安全管理后台。

![端到端流式语音管道与边缘转写架构拓扑图](./docs/assets/figure_pipeline_architecture.svg)

### 2.1 模块分层职责矩阵

| 层次 | 核心模块 | 技术实现 | 核心职责 |
| :--- | :--- | :--- | :--- |
| **终端交互层** | `VoiceView`<br>`VoiceOrb`<br>`AudioResampler` | React 18 / TypeScript<br>Web Audio API<br>Canvas 2D / WebGL | 麦克风硬件采集、声学回声消除（AEC）、44.1k/48k 转 24kHz 线性插值重采样、全双工状态机驱动、实时音频频域水波渲染。 |
| **边缘网关层** | `voiceRouter`<br>`minimax-voice-relay`<br>`safety-filter` | Cloudflare Workers<br>Hono 框架<br>WebSocketPair | 零拷贝双向流转发（RFC 6455）、L1 正则硬过滤与否定消歧、会话时序控制器（Sequence ID）、动态保活心跳。 |
| **语音合成层** | `MiniMaxRealtimeClient`<br>语音实时服务 | MiniMax Realtime 协议<br>Server-side VAD | 端到端 24kHz / 16-bit PCM 流式生成、自然呼吸感 Maple 音色、服务端静音与发音断句切片。 |
| **认知计算层** | `deepseek-flash`<br>双层认知引擎 | DeepSeek V4 Flash<br>Serverless 并发调用 | **Tier 1 (影子大脑)**：<300ms 实时旁路推演，向语音流注入引导指令。<br>**Tier 2 (个案评估)**：离线抽取 ABC 歪曲、情绪差值计算与作业生成。 |
| **策略检索层** | `BgeRetriever`<br>`cbt-capsules` | BGE-M3 稠密向量嵌入<br>点积相似度算法 | 四维临床 CBT 干预胶囊检索（学业、同伴、家庭、自我）、向量阈值裁剪、BM25 词法确定性降级。 |
| **管理审计中心**| `AdminPortal`<br>`CampusPulse`<br>`crypto-helper` | Zustand 状态流<br>Web Crypto API<br>Cloudflare D1 存储 | 实证数据趋势监控、高危个案分诊响应（Triage）、AES-256-GCM 凭证鉴权二次解密、留痕审计日志。 |

---

## 3. 核心技术方案路径详解

### 3.1 端到端全双工实时音频管道 (Full-Duplex Audio Pipeline)

系统构建了低时延的双向音频流拓扑，支持用户在智能体播报时随时进行打断。

![全双工实时音频交互与打断时序图](./docs/assets/figure_audio_bargein_sequence.svg)

#### 3.1.1 信号采集与数字信号处理（DSP）
1. **硬件约束接入**：前端调用 `navigator.mediaDevices.getUserMedia` 时配置声学约束：
   ```typescript
   {
     audio: {
       echoCancellation: true, // 声学回声消除
       noiseSuppression: true, // 背景噪声抑制
       autoGainControl: true,  // 自动增益控制
       channelCount: 1         // 单声道
     }
   }
   ```
2. **动态重采样算法 (`AudioResampler`)**：
   - 浏览器音频上下文（`AudioContext`）硬件原生采集率通常为 44,100Hz 或 48,000Hz，流式语音模型标准采样率为 24,000Hz。
   - 系统在音频处理节点中使用线性插值抗混叠算法：
     $$x_{\text{target}}[n] = x_{\text{source}}[k] + (k_{\text{frac}}) \cdot (x_{\text{source}}[k+1] - x_{\text{source}}[k])$$
   - 将 32 位浮点型（`Float32Array`，范围 $[-1.0, 1.0]$）量化转换为 16 位有符号整型（`Int16Array`，范围 $[-32768, 32767]$），转码为 Base64 块后分帧推送。

#### 3.1.2 服务端语音活性检测 (Server-side VAD)
网关向下游语音模型会话初始化配置标准化 VAD 状态机：
- `threshold: 0.5`：能量判决阈值；
- `prefix_padding_ms: 300`：保留发音起始前 300ms 音频，防止爆破音丢失；
- `silence_duration_ms: 600`：说话结束判定静音窗口，达到 600ms 自动断句并触发转写。

#### 3.1.3 打断与并发取消控制 (Barge-in & Cancellation)
- 当用户发声触发 `input_audio_buffer.speech_started` 事件时：
  1. **网关层**：递增会话序列号 `sequenceId++`，并调用 `thinkingController.abort()` 丢弃当前正在执行的影子推演异步任务。
  2. **上游层**：网关向语音模型推送 `response.cancel`，中止后续音频帧生成。
  3. **客户端**：前端音频调度队列执行 `AudioBufferSourceNode.stop()`，切断当前正在扬声器缓冲区的回放数据并清空 FIFO 队列，完成音频通道重置。

---

### 3.2 DeepSeek V4 Flash 双层认知引擎架构

系统解耦为双层异步计算流，以平衡实时交互时延与心理干预分析深度：

![文本转写并发与异步影子推演时序图](./docs/assets/figure_dual_tier_cognitive.svg)

#### 3.2.1 Tier 1: 在线影子大脑 (Shadow Brain Pipeline)
- **触发时机**：捕获转写完成事件 `conversation.item.input_audio_transcription.completed`。
- **执行环境**：边缘并行轻量 Worker 进程，时延预算 $<300\text{ms}$。
- **输入特征**：
  - 最近 4 轮精简历史对话序列；
  - 来访学生情景记忆槽位（包含既往议题、应对偏好）；
  - BGE-M3 检索匹配到的针对性干预指引。
- **动态干预机制**：
  影子大脑通过 DeepSeek V4 Flash 推演出针对性引导提示词后，并不直接向学生发声，而是通过 WebSocket 向当前活跃的语音模型链路发送 `conversation.item.create` 注入系统上下文：
  ```json
  {
    "type": "conversation.item.create",
    "item": {
      "type": "message",
      "role": "system",
      "content": [{
        "type": "input_text",
        "text": "【指令】：引导对方识别当前‘要是考不好人生就全完了’属于灾难化思维，温和发问最坏结果的发生概率。（注意：你的回复必须严格控制在 1-2 句话以内）"
      }]
    }
  }
  ```
  语音模型在发声时即时应用该引导策略，兼顾流式发声与定向干预。

#### 3.2.2 Tier 2: 离线会话结构化评估与建档 (Session Report Pipeline)
- **触发时机**：会话关闭（WebSocket `close`）或用户手动挂机。
- **执行内容**：调用 DeepSeek V4 Flash 对全量对话转写执行多维度 CBT 结构化解构：
  1. **CBT 阶段标定**：标定本次通话达到的阶段（`Active_Listening`、`CBT_Stripping`、`Socratic_Questioning` 或 `Crisis_Escalation`）。
  2. **认知歪曲分类提取**：基于 Beck 认知扭曲标准分类模型进行标注（全或无思维、以偏概全、心理过滤、灾难化、读心术等）。
  3. **情绪效价轨迹量化**：提取初始情绪标签、结束情绪标签与效价变化量（Valence Delta）。
  4. **定制化课后微行动作业 (Homework Action)**：生成 1 项具体、可落地的行为实验或认知记录练习。

---

### 3.3 CBT 阶段状态机与策略干预胶囊 (FSM & RAG)

系统以有限状态机为骨架，驱动对话进程：

![CBT 阶段有限状态转移图](./docs/assets/figure_cbt_fsm.svg)

#### 3.3.1 状态转移矩阵与流转机制
- **积极倾听 (`Active_Listening`)**：共情接纳与情绪容纳，不急于给出认知重构。
- **事实剥离 (`CBT_Stripping`)**：引导区分客观诱发事件（A）与主观信念想象（B）。
- **认知重构 (`Socratic_Questioning`)**：通过启发式提问引导审视证据，寻找平衡的替代认知。
- **微行动赋能**：提炼低阻抗微行动，打破消极循环。
- **危机熔断 (`Crisis_Escalation`)**：吸收态，切断常规分析，转入线下生命守护接管流程。

#### 3.3.2 BGE-M3 向量检索与降级路径
系统内置标准认知行为干预胶囊库（`cbt-capsules.ts`），覆盖 4 大核心维度：
- 学业压力 (`academic`)、同伴交往 (`peer`)、家庭动力 (`family`)、自我认同 (`self_worth`)。
- **稠密语义检索**：计算查询向量 $\mathbf{u} = \text{Embed}(q)$ 与胶囊向量 $\mathbf{v}_i$ 的点积相似度 $S(q, \mathbf{c}_i) = \mathbf{u} \cdot \mathbf{v}_i$，筛选满足 $S \ge 0.50$ 的策略。
- **词法确定性降级**：若嵌入向量接口发生异常，系统自动回退至关键词加权 BM25 算法，确保核心干预指引零依赖产出。

---

### 3.4 双速危机多级熔断与安全工程

针对自伤、自杀等心理危机，系统设立确定性规则与深度语义双轨判决管线：

1. **L1 边缘正则即时硬过滤 (<5ms)**：
   - 快速扫描自杀方式、致命工具、极端厌世等文本模式。
   - **否定消歧引擎（Negation Disambiguation）**：引入反向否定断言过滤算法（匹配“并不想死”、“打消自杀念头”、“阻止跳楼”等模式串），先行剔除否定上下文，避免误拦截。
2. **L2 旁路深度语义熔断**：
   - 并发由 DeepSeek V4 Flash 语义分类器进行旁路评估，捕捉隐晦告别、间接隐喻等潜在危机。
3. **L3 响应与物理干预阻断机制**：
   - 触发 L1 或 L2 警报后，网关立即下发 `response.cancel` 阻断音频流输出；
   - 客户端激活全屏 `CrisisOverlay` 守护界面，引导求助热线与线下值班室；
   - 异步触发 Webhook 向校园安全值班端推送高危工单。

---

### 3.5 密码学方案与去标识化工程

为保障学生心理档案的隐私性，系统建立“数据去标识化 + 高危身份独立对称加密 + 二次凭证鉴权”的三重安全体系：

- **去标识化（PII Stripping）**：所有非危机档案入库前，学生姓名均转换为掩码格式（如 `陈*同学`），屏蔽强特征实体。
- **真实身份 AES-256-GCM 封装**：
  当且仅当判定 L3 危机时，学生的真实姓名、班级与紧急联络人经由 Web Crypto API 加密处理：
  $$\text{Ciphertext} = \text{AES-256-GCM}(\text{Key}_{\text{secret}}, \text{IV}, \text{Payload})$$
  生成包含密文、IV（96-bit）与认证标签（Auth Tag 128-bit）的密文字符串写入持久层。
- **二次凭证鉴权审查（Dual-Key Protocol）**：
  管理端常规操作仅可检索脱敏简报；仅在启动物理干预时，专职心理教师须输入独立的二次安全口令（`TEACHER_SECONDARY_PASSCODE`），通过服务端严格鉴权后方可解密明文联系方式。

---

## 4. 工程目录与模块划分

```
RETHINK-Realtime/
├── docs/                              # 系统架构与文档
│   └── assets/                        # 架构与流程图静态资源
│       ├── figure_pipeline_architecture.svg   # 语音管道与边缘转写架构
│       ├── figure_audio_bargein_sequence.svg  # 全双工打断时序
│       ├── figure_dual_tier_cognitive.svg     # 影子推演与转写并发时序
│       └── figure_cbt_fsm.svg                 # CBT 阶段有限状态机流转
│
├── web/                               # 前端交互与管理工程 (React 18 + Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── admin/                 # 校园大盘、危机响应中心、个案抽屉、解密模态框
│   │   │   ├── auth/                  # 登录模块 (LoginWall)
│   │   │   ├── common/                # 危机接管覆盖层 (CrisisOverlay)
│   │   │   └── voice/                 # 语音渲染组件 (VoiceOrb, VoiceView)
│   │   ├── hooks/                     # 语音状态机、音频图谱管理、看门狗 Hook
│   │   ├── lib/
│   │   │   ├── audio/                 # Web Audio API 音频重采样、DTMF、节点拓扑
│   │   │   └── minimax/               # MiniMax 实时流客户端与事件调度器
│   │   └── store/                     # Zustand 状态中心 (Booth / Admin / Auth)
│   └── package.json
│
├── worker/                            # 边缘网关与认知调度层 (Cloudflare Workers)
│   ├── src/
│   │   ├── routes/
│   │   │   ├── voice.ts               # WebSocket 双向中继、音频转发、会话持久化
│   │   │   ├── admin.ts               # 大盘聚合、危机队列分诊、安全解密审查
│   │   │   └── auth.ts                # 教师登录与身份核验
│   │   ├── lib/
│   │   │   ├── deepseek-flash.ts      # DeepSeek V4 Flash 影子大脑与评估逻辑
│   │   │   ├── minimax-voice-relay.ts # MiniMax 实时语音协议中继适配
│   │   │   ├── safety-filter.ts       # L1/L2 危机熔断与否定语义消歧
│   │   │   ├── crypto-helper.ts       # Web Crypto API AES-256-GCM 封装
│   │   │   └── rag/                   # BGE-M3 向量检索与 CBT 策略胶囊集
│   │   └── index.ts                   # Hono 应用入口与中间件注册
│   ├── wrangler.toml                  # Cloudflare Workers 边缘拓扑配置
│   └── package.json
│
└── package.json                       # 根工作区构建脚本与全局依赖调度
```

---

## 5. 配置参数与环境变量

边缘 Worker 运行依赖的环境变量定义如下（可在 `worker/.dev.vars` 或 Cloudflare Dashboard 中配置）：

| 变量名 | 类型 | 必填 | 职责说明 |
| :--- | :--- | :---: | :--- |
| `MINIMAX_API_KEY` | String | 是 | MiniMax 实时语音服务中继凭证 |
| `MINIMAX_BASE_URL` | String | 否 | MiniMax 网关接入端点（默认指向官方实时语音服务） |
| `OPENROUTER_API_KEY` | String | 是 | DeepSeek V4 Flash 认知推理引擎凭证 |
| `OPENROUTER_BASE_URL` | String | 否 | 认知推理服务网关端点 |
| `OPENROUTER_MODEL` | String | 否 | 评估模型，配置为 `deepseek/deepseek-v4-flash` |
| `EMBEDDING_API_KEY` | String | 是 | BGE-M3 向量表征计算凭据 |
| `EMBEDDING_API_URL` | String | 否 | 向量检索嵌入计算端点（默认指向嵌入计算服务） |
| `TEACHER_SECONDARY_PASSCODE` | String | 是 | 危机个案 AES-256-GCM 解密所需的二次授权口令 |
| `CRISIS_WEBHOOK_URL` | String | 否 | 校园危机应急联络 Webhook 推送地址（飞书/钉钉/企业微信） |
| `DB` | D1Database | 否 | Cloudflare D1 边缘关系型数据库绑定 |

---

## 6. 本地开发与部署流水线

### 6.1 环境依赖要求
- Node.js >= 18.0.0
- npm >= 9.0.0
- Cloudflare Wrangler CLI >= 3.0.0

### 6.2 本地运行与调试

1. **安装 Monorepo 依赖**：
   ```bash
   npm install
   ```

2. **初始化环境变量**：
   ```bash
   cp worker/.dev.vars.example worker/.dev.vars
   # 编辑 worker/.dev.vars 填入相关服务的 API 密钥与二次解密口令
   ```

3. **启动客户端交互开发服务器**：
   ```bash
   npm run dev
   ```

4. **启动边缘网关服务**：
   ```bash
   npm run dev:worker
   ```

### 6.3 生产构建与发布流水线

- **前端静态包编译与产物输出**：
  ```bash
  npm run build
  ```
  *说明：构建任务编译 `web` 子包产物，并自动规整输出至根目录 `dist/`，兼容 Cloudflare Pages 及主流 CDN 托管环境。*

- **边缘 Worker 部署**：
  ```bash
  cd worker && wrangler deploy
  ```
