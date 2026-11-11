/**
 * AI 服务商预设。与 Octop（mawanglin.octop 的 providers 预设）对齐：
 * 服务商 / 接入地址 / 模型清单沿用其 OpenAI 兼容预设，默认模型挑选低延迟的 Flash/Lite 档，
 * 适合口令分析与语音对话。`models` 仅作离线兜底：连上服务商后以「获取模型」的实时结果为准。
 */
export interface AIPresetModel {
  id: string;
  name: string;
  /** 上下文窗口（token），未知则省略 */
  contextWindow?: number;
  /** 支持图像 / 视频输入 */
  multimodal?: boolean;
  /** 默认带思考（推理）能力 */
  reasoning?: boolean;
}

export interface AIPresetProvider {
  id: string;
  name: string;
  baseUrl: string;
  defaultModel: string;
  websiteUrl: string;
  apiKeyUrl: string;
  /** API Key 的常见前缀，仅用于输入提示 */
  keyPrefix?: string;
  /** 历史 / 备用接入地址：按地址识别当前所选服务商时一并匹配 */
  aliases?: string[];
  models: AIPresetModel[];
}

export const AI_PRESET_PROVIDERS: AIPresetProvider[] = [
  {
    id: 'siliconflow',
    name: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V4.1-Flash',
    websiteUrl: 'https://siliconflow.cn',
    apiKeyUrl: 'https://cloud.siliconflow.cn/account/ak',
    keyPrefix: 'sk-',
    models: [
      { id: 'deepseek-ai/DeepSeek-V4.1-Flash', name: 'DeepSeek V4.1 Flash', contextWindow: 1048576, multimodal: true },
      { id: 'deepseek-ai/DeepSeek-V4-Pro', name: 'DeepSeek V4 Pro', contextWindow: 1048576 },
      { id: 'deepseek-ai/DeepSeek-V4-Flash', name: 'DeepSeek V4 Flash', contextWindow: 1048576 },
      { id: 'zai-org/GLM-5.3', name: 'GLM-5.3', contextWindow: 1048576 },
      { id: 'zai-org/GLM-5.3-Flash', name: 'GLM-5.3 Flash', contextWindow: 1048576, multimodal: true },
      { id: 'zai-org/GLM-5.2', name: 'GLM-5.2', contextWindow: 1048576 },
      { id: 'Pro/moonshotai/Kimi-K2.6', name: 'Kimi K2.6', contextWindow: 262144, multimodal: true },
      { id: 'moonshotai/Kimi-K2.7-Code', name: 'Kimi K2.7 Code', contextWindow: 262144, multimodal: true },
      { id: 'Qwen/Qwen3.8-27B', name: 'Qwen3.8 27B', contextWindow: 262144, multimodal: true },
      { id: 'Qwen/Qwen3.6-35B-A3B', name: 'Qwen3.6 35B A3B', contextWindow: 262144, multimodal: true },
      { id: 'meituan-longcat/LongCat-2.0', name: 'LongCat 2.0', contextWindow: 1048576 },
      { id: 'tencent/Hy4-preview', name: 'Hy4 Preview', contextWindow: 1048576 },
      { id: 'deepseek-ai/DeepSeek-V3.2', name: 'DeepSeek V3.2', contextWindow: 163840 },
      { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', contextWindow: 163840, reasoning: true },
    ],
  },
  {
    id: 'zhipu',
    name: '智谱 BigModel',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-5.3-flash',
    websiteUrl: 'https://open.bigmodel.cn',
    apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    models: [
      { id: 'glm-5.3', name: 'GLM-5.3', contextWindow: 1000000, reasoning: true },
      { id: 'glm-5.3-flash', name: 'GLM-5.3 Flash', contextWindow: 1000000, multimodal: true, reasoning: true },
      { id: 'glm-5.3-flashx', name: 'GLM-5.3 FlashX', contextWindow: 1000000, multimodal: true, reasoning: true },
      { id: 'glm-4.7-flash', name: 'GLM-4.7-Flash', contextWindow: 200000, reasoning: true },
      { id: 'glm-5', name: 'GLM-5', contextWindow: 200000, reasoning: true },
      { id: 'glm-5.1', name: 'GLM-5.1', contextWindow: 200000, reasoning: true },
      { id: 'glm-5.2', name: 'GLM-5.2', contextWindow: 1000000, reasoning: true },
      { id: 'glm-5-turbo', name: 'GLM-5 Turbo', contextWindow: 200000, reasoning: true },
      { id: 'glm-5v-turbo', name: 'GLM-5V Turbo', contextWindow: 200000, multimodal: true, reasoning: true },
    ],
  },
  {
    id: 'dashscope',
    name: '阿里云百炼 DashScope',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen3.8-flash',
    websiteUrl: 'https://dashscope.aliyuncs.com',
    apiKeyUrl: 'https://bailian.console.aliyun.com/#/api-key',
    keyPrefix: 'sk-',
    models: [
      { id: 'qwen3.8-max', name: 'Qwen3.8 Max', contextWindow: 1000000, multimodal: true, reasoning: true },
      { id: 'qwen3.8-flash', name: 'Qwen3.8 Flash', contextWindow: 1000000, multimodal: true, reasoning: true },
      { id: 'qwen3.7-max', name: 'Qwen3.7 Max', contextWindow: 1000000, reasoning: true },
      { id: 'qwen3.7-flash', name: 'Qwen3.7 Flash', contextWindow: 1000000, multimodal: true, reasoning: true },
      { id: 'qwen3.7-plus', name: 'Qwen3.7 Plus', contextWindow: 1000000, multimodal: true, reasoning: true },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek 官方',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-flash',
    websiteUrl: 'https://platform.deepseek.com',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    keyPrefix: 'sk-',
    models: [
      { id: 'deepseek-flash', name: 'DeepSeek Flash', contextWindow: 1000000, multimodal: true, reasoning: true },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', contextWindow: 1000000, reasoning: true },
    ],
  },
  {
    id: 'volcengine',
    name: '火山方舟 Ark',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-seed-2-1-lite-260915',
    websiteUrl: 'https://www.volcengine.com',
    apiKeyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    models: [
      { id: 'doubao-seed-2-1-pro-260915', name: 'Doubao-Seed-2.1-pro', contextWindow: 1048576, multimodal: true, reasoning: true },
      { id: 'doubao-seed-2-1-lite-260915', name: 'Doubao-Seed-2.1-lite', contextWindow: 1048576, multimodal: true, reasoning: true },
      { id: 'doubao-seed-2-1-turbo-260628', name: 'Doubao-Seed-2.1-turbo', contextWindow: 262144, multimodal: true, reasoning: true },
      { id: 'doubao-seed-evolving', name: 'Doubao-Seed-evolving', contextWindow: 1048576, multimodal: true, reasoning: true },
      { id: 'glm-5-3-flash-260828', name: 'GLM-5.3-Flash 260828', contextWindow: 1048576, multimodal: true },
      { id: 'glm-5-2-260617', name: 'GLM-5.2 260617', contextWindow: 1048576 },
      { id: 'kimi-k3-1-pro-261024', name: 'Kimi-K3.1-Pro 261024', contextWindow: 1048576, multimodal: true },
      { id: 'deepseek-v4-1-flash-261017', name: 'DeepSeek-V4.1-Flash 261017', contextWindow: 1048576, multimodal: true, reasoning: true },
      { id: 'deepseek-v4-1-flash-economy-261017', name: 'DeepSeek-V4.1-Flash-Economy 261017', contextWindow: 1048576, multimodal: true, reasoning: true },
      { id: 'deepseek-v4-pro-ga-260813', name: 'DeepSeek-V4-Pro GA 260813', contextWindow: 1048576, reasoning: true },
      { id: 'deepseek-v4-flash-ga-260731', name: 'DeepSeek-V4-Flash GA 260731', contextWindow: 1048576, reasoning: true },
      { id: 'doubao-seed-2-0-lite-260428', name: 'Doubao-Seed-2.0-lite', contextWindow: 262144, multimodal: true, reasoning: true },
      { id: 'doubao-seed-2-0-mini-260428', name: 'Doubao-Seed-2.0-mini', contextWindow: 262144, multimodal: true, reasoning: true },
      { id: 'doubao-seed-character-251128', name: 'Doubao-Seed-Character', contextWindow: 131072 },
    ],
  },
  {
    id: 'moonshot',
    name: 'Kimi / Moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k3.1-pro-highspeed',
    websiteUrl: 'https://platform.moonshot.cn',
    apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
    keyPrefix: 'sk-',
    models: [
      { id: 'kimi-k3.1-pro', name: 'Kimi K3.1 Pro', contextWindow: 1048576, multimodal: true, reasoning: true },
      { id: 'kimi-k3.1-pro-highspeed', name: 'Kimi K3.1 Pro Highspeed', contextWindow: 1048576, multimodal: true, reasoning: true },
      { id: 'kimi-k3', name: 'Kimi K3', contextWindow: 1000000, multimodal: true, reasoning: true },
    ],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/v1',
    defaultModel: 'MiniMax-M3.1-Flash',
    websiteUrl: 'https://www.minimaxi.com',
    apiKeyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    aliases: ['https://api.minimax.chat/v1'],
    models: [
      { id: 'MiniMax-M3.1-Flash', name: 'MiniMax M3.1 Flash', contextWindow: 1000000, multimodal: true, reasoning: true },
      { id: 'MiniMax-M3', name: 'MiniMax M3', contextWindow: 1000000, multimodal: true, reasoning: true },
    ],
  },
  {
    id: 'hunyuan',
    name: '腾讯云 TokenHub（混元等）',
    baseUrl: 'https://tokenhub.tencentmaas.com/v1',
    defaultModel: 'deepseek-v4.1-flash',
    websiteUrl: 'https://cloud.tencent.com',
    apiKeyUrl: 'https://console.cloud.tencent.com/tokenhub',
    aliases: ['https://api.hunyuan.cloud.tencent.com/v1'],
    models: [
      { id: 'deepseek-v4.1-flash-1017', name: 'DeepSeek-V4.1-Flash-1017', contextWindow: 1000000, multimodal: true, reasoning: true },
      { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro', contextWindow: 1000000, reasoning: true },
      { id: 'kimi-k2.7-code-highspeed', name: 'Kimi K2.7 Code HighSpeed', contextWindow: 262144, multimodal: true, reasoning: true },
      { id: 'hy4-preview', name: 'Hy4 Preview', contextWindow: 1000000, reasoning: true },
      { id: 'hy3', name: 'Hy3', contextWindow: 256000, reasoning: true },
      { id: 'deepseek-v4.1-flash', name: 'DeepSeek-V4.1-Flash', contextWindow: 1000000, multimodal: true, reasoning: true },
      { id: 'deepseek-v4-pro-0813', name: 'DeepSeek-V4-Pro 0813', contextWindow: 1000000, reasoning: true },
      { id: 'glm-5.3', name: 'GLM-5.3', contextWindow: 1000000, reasoning: true },
      { id: 'glm-5.3-flash', name: 'GLM-5.3-Flash', contextWindow: 1000000, multimodal: true, reasoning: true },
      { id: 'glm-5.3-flashx', name: 'GLM-5.3-FlashX', contextWindow: 1000000, multimodal: true, reasoning: true },
      { id: 'glm-5.2', name: 'GLM-5.2', contextWindow: 1000000, reasoning: true },
      { id: 'kimi-k3.1-pro', name: 'Kimi K3.1 Pro', contextWindow: 1000000, multimodal: true, reasoning: true },
      { id: 'kimi-k3.1-pro-highspeed', name: 'Kimi K3.1 Pro HighSpeed', contextWindow: 1000000, multimodal: true, reasoning: true },
      { id: 'kimi-k3', name: 'Kimi K3', contextWindow: 1000000, multimodal: true, reasoning: true },
      { id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code', contextWindow: 262144, multimodal: true, reasoning: true },
      { id: 'kimi-k2.6', name: 'Kimi-K2.6', contextWindow: 262144, multimodal: true, reasoning: true },
      { id: 'minimax-m3.1-flash', name: 'MiniMax-M3.1-Flash', contextWindow: 1000000, multimodal: true, reasoning: true },
      { id: 'minimax-m3', name: 'MiniMax-M3', contextWindow: 1000000, multimodal: true, reasoning: true },
      { id: 'mimo-v2.6-pro', name: 'MiMo-V2.6-Pro', contextWindow: 1000000, multimodal: true },
      { id: 'mimo-v2.6-flash', name: 'MiMo-V2.6-Flash', contextWindow: 1000000, multimodal: true },
      { id: 'hy4', name: 'Hy4', contextWindow: 1024000, multimodal: true, reasoning: true },
    ],
  },
  {
    id: 'mimo',
    name: '小米 MiMo',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    defaultModel: 'mimo-v2.6-flash',
    websiteUrl: 'https://platform.xiaomimimo.com',
    apiKeyUrl: 'https://platform.xiaomimimo.com/#/console/api-keys',
    models: [
      { id: 'mimo-v2.6-pro', name: 'MiMo V2.6 Pro', contextWindow: 1048576, multimodal: true, reasoning: true },
      { id: 'mimo-v2.6-flash', name: 'MiMo V2.6 Flash', contextWindow: 1048576, multimodal: true, reasoning: true },
    ],
  },
  {
    id: 'modelscope',
    name: '魔搭 ModelScope',
    baseUrl: 'https://api-inference.modelscope.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V4.1-Flash',
    websiteUrl: 'https://modelscope.cn',
    apiKeyUrl: 'https://modelscope.cn/my/myaccesstoken',
    models: [
      { id: 'moonshotai/Kimi-K3.1-Pro', name: 'Kimi-K3.1-Pro' },
      { id: 'MiniMax/MiniMax-M3', name: 'MiniMax-M3' },
      { id: 'deepseek-ai/DeepSeek-V4.1-Flash', name: 'DeepSeek-V4.1-Flash' },
      { id: 'Qwen/Qwen3.8-27B', name: 'Qwen3.8-27B' },
      { id: 'ZhipuAI/GLM-5.2', name: 'GLM-5.2' },
      { id: 'Qwen/Qwen3.5-122B-A10B', name: 'Qwen3.5-122B-A10B', contextWindow: 131072 },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-6-luna',
    websiteUrl: 'https://platform.openai.com',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    keyPrefix: 'sk-',
    models: [
      { id: 'gpt-6-astra', name: 'GPT-6 Astra', contextWindow: 1050000, multimodal: true, reasoning: true },
      { id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol', contextWindow: 1050000, multimodal: true, reasoning: true },
      { id: 'gpt-6.1-terra', name: 'GPT-6.1 Terra', contextWindow: 1050000, multimodal: true, reasoning: true },
      { id: 'gpt-6-luna', name: 'GPT-6 Luna', contextWindow: 1050000, multimodal: true, reasoning: true },
      { id: 'gpt-5.2', name: 'GPT-5.2', contextWindow: 400000, multimodal: true, reasoning: true },
    ],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.8-flash',
    websiteUrl: 'https://ai.google.dev',
    apiKeyUrl: 'https://aistudio.google.com/apikey',
    models: [
      { id: 'gemini-4-carbon', name: 'Gemini 4 Carbon', contextWindow: 1048576, multimodal: true, reasoning: true },
      { id: 'gemini-4-argon', name: 'Gemini 4 Argon', contextWindow: 1048576, multimodal: true, reasoning: true },
      { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', contextWindow: 1048576, multimodal: true, reasoning: true },
      { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', contextWindow: 1048576, multimodal: true, reasoning: true },
      { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', contextWindow: 1048576, multimodal: true, reasoning: true },
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', contextWindow: 1048576, multimodal: true, reasoning: true },
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', contextWindow: 1048576, multimodal: true, reasoning: true },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', contextWindow: 1048576, multimodal: true, reasoning: true },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'openai/gpt-oss-20b',
    websiteUrl: 'https://groq.com',
    apiKeyUrl: 'https://console.groq.com/keys',
    keyPrefix: 'gsk_',
    models: [
      { id: 'qwen/qwen3.8-27b', name: 'Qwen3.8 27B (preview)', contextWindow: 131072, multimodal: true, reasoning: true },
      { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', contextWindow: 131072, reasoning: true },
      { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', contextWindow: 131072, reasoning: true },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'deepseek/deepseek-v4-pro',
    websiteUrl: 'https://openrouter.ai',
    apiKeyUrl: 'https://openrouter.ai/keys',
    keyPrefix: 'sk-or-',
    models: [
      { id: 'anthropic/claude-fable-5.2', name: 'Claude Fable 5.2', contextWindow: 1000000, multimodal: true, reasoning: true },
      { id: 'anthropic/claude-opus-5.5', name: 'Claude Opus 5.5', contextWindow: 1000000, multimodal: true, reasoning: true },
      { id: 'anthropic/claude-sonnet-5.5', name: 'Claude Sonnet 5.5', contextWindow: 1000000, multimodal: true, reasoning: true },
      { id: 'openai/gpt-6.1-sol', name: 'GPT-6.1 Sol', contextWindow: 1050000, multimodal: true },
      { id: 'google/gemini-4-carbon', name: 'Gemini 4 Carbon', contextWindow: 1048576, multimodal: true },
      { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro', contextWindow: 1048576 },
      { id: 'moonshotai/kimi-k3.1-pro', name: 'Kimi K3.1 Pro', contextWindow: 1048576, multimodal: true },
      { id: 'z-ai/glm-5.3', name: 'GLM-5.3', contextWindow: 1048576 },
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama（本机）',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'qwen3',
    websiteUrl: 'https://ollama.com',
    apiKeyUrl: 'https://ollama.com/library',
    models: [
      { id: 'qwen3', name: 'qwen3' },
      { id: 'gpt-oss', name: 'gpt-oss' },
      { id: 'gemma4', name: 'gemma4' },
      { id: 'llama3', name: 'llama3', contextWindow: 8192 },
      { id: 'mistral', name: 'mistral', contextWindow: 32768 },
    ],
  },
];
