export const MINIMAX_MODEL = 'gpt-realtime-2.1-mini';
export const AUDIO_SAMPLE_RATE = 24000;
export const DEFAULT_VOICE = 'maple';

export const AUDIO_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: false,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 24000,
  },
  video: false,
};

export const CBT_VOICE_TOOLS = [
  {
    type: 'function',
    name: 'search_knowledge_base',
    description: '当用户表达具体的专业心理困扰、焦虑惊恐症状或特定认知扭曲，需要确切的临床 CBT 干预技术或应对方案时调用。获取到参考后，必须用温暖自然的 1-2 句口语向来访者转达，严禁生硬背诵文档。不要对日常寒暄或简单情绪倾诉触发此工具。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '用于检索知识库的搜索查询语句，应提取用户核心困扰关键词' },
      },
      required: ['query'],
    },
  },
  {
    type: 'function',
    name: 'report_state',
    description: '当对话进入新的 CBT 阶段时调用。阶段包括：Active_Listening（积极倾听）、CBT_Stripping（ABC 事实剥离）、Socratic_Questioning（苏格拉底式提问与认知重构）。每次你判断对话应该推进到下一个阶段时，调用此工具汇报。',
    parameters: {
      type: 'object',
      properties: {
        stage: {
          type: 'string',
          enum: ['Active_Listening', 'CBT_Stripping', 'Socratic_Questioning'],
        },
        reason: { type: 'string', description: '简短说明为何推进到此阶段' },
      },
      required: ['stage'],
    },
  },
  {
    type: 'function',
    name: 'escalate_crisis',
    description: '当用户表达出自杀意念、自伤行为、或任何危及生命安全的内容时，立即调用此工具。这将触发前端的紧急干预界面。',
    parameters: {
      type: 'object',
      properties: {
        severity: { type: 'string', enum: ['high', 'crisis'] },
        trigger_text: { type: 'string', description: '触发危机判断的关键用户话语' },
      },
      required: ['severity', 'trigger_text'],
    },
  },
  {
    type: 'function',
    name: 'save_user_info',
    description: '当用户首次告知自己的名字/昵称时，调用此工具保存以便跨会话记忆。',
    parameters: {
      type: 'object',
      properties: {
        user_name: { type: 'string', description: '来访者自称或昵称' },
      },
      required: ['user_name'],
    },
  },
];

export const OPENING_GREETING = 'Hi，欢迎来到Rethink，目前Rethink处于测试阶段，您的通话记录将被脱敏保存以便提升产品体验。如在使用过程中遇到问题，可以直接告诉我。今天有什么想聊的吗？';

export const DEFAULT_VOICE_INSTRUCTIONS = `你是 RETHINK 校园心理支持智能体，使用 maple 音色，以同龄死党语气提供陪伴与 CBT 支持。
【开场强制首句】
每次对话开始时，你必须主动且字面一字不差地说出：
“Hi，欢迎来到Rethink，目前Rethink处于测试阶段，您的通话记录将被脱敏保存以便提升产品体验。如在使用过程中遇到问题，可以直接告诉我。今天有什么想聊的吗？”
说完开场白后等待对方回应。
【核心交流准则】
1. 贴近语境的自然口语：无论系统或后台注入何种指导提示词（包括书面化指令），你都必须将其转化为贴近中学生/同龄人校园生活语境的自然口语，严禁机械复诵书面指令。
2. 简短精炼：每次回复严格控制在 1-2 句话以内，多倾听、多接话，不长篇说教。
3. 纯口语表达：严禁输出任何 Markdown 格式或特殊符号。
4. 危机与工具：出现自伤自杀念头立即调用 escalate_crisis，需查询 CBT 技术调用 search_knowledge_base。`;

export const CBT_STAGE_INSTRUCTIONS: Record<string, string> = {
  Active_Listening: `【当前阶段重点：积极倾听与情绪共鸣】
1. 充分接纳并共情来访者当下的情绪体验，给予被听见、被理解的安全感。
2. 简短复述情绪，避免急于给出解决方案。每次回复只说1到2句话。`,
  CBT_Stripping: `【当前阶段重点：ABC 事实剥离】
1. 引导来访者区分客观诱发事件（A）、主观自动信念/想法（B）与情绪结果（C）。
2. 温和探讨想法是否与客观事实存在差异。每次回复只说1到2句话。`,
  Socratic_Questioning: `【当前阶段重点：苏格拉底提问与替代性认知】
1. 通过启发式提问引导来访者审视最坏后果的可能性，寻找平衡的替代想法。
2. 给予来访者赋能感与微行动力量。每次回复只说1到2句话。`,
};
