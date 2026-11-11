#!/usr/bin/env python3
"""从 Octop 导出的 provider 预设生成 frontend/src/aiPresets.ts。

用法：
  1. 在 Octop 仓库导出预设 JSON：
       PYTHONPATH=src .venv/bin/python -c "import json; from octop.infra.agents.providers.presets import load_provider_presets as f; json.dump(f(), open('octop_presets.json','w'), ensure_ascii=False)"
  2. python3 scripts/gen-ai-presets.py octop_presets.json frontend/src/aiPresets.ts
Octop 新增了对话类预设而这里没映射时会直接报错，提醒补上中文名与 Key 页。
"""
import json, sys
if len(sys.argv) != 3:
    sys.exit('用法: gen-ai-presets.py <octop_presets.json> <输出 aiPresets.ts>')
SRC, OUT = sys.argv[1], sys.argv[2]
ps = {p['id']: p for p in json.load(open(SRC))}

ALI_CN = 'https://bailian.console.aliyun.com/#/api-key'
ALI_INTL = 'https://modelstudio.console.alibabacloud.com/#/api-key'
ARK = 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey'
TC_LKEAP = 'https://console.cloud.tencent.com/lkeap'
TC_HUB = 'https://console.cloud.tencent.com/tokenhub'
# (分组, octop id, 中文名, 官网, Key 页, 默认模型或 None=自动挑选)
SPEC = [
 ('阿里云', 'dashscope', '阿里云百炼（国内）', 'https://bailian.console.aliyun.com', ALI_CN, 'qwen3.8-flash'),
 ('阿里云', 'dashscope-intl', '阿里云百炼（新加坡）', 'https://modelstudio.console.alibabacloud.com', ALI_INTL, 'qwen3.8-flash'),
 ('阿里云', 'dashscope-us', '阿里云百炼（美国）', 'https://modelstudio.console.alibabacloud.com', ALI_INTL, 'qwen3.8-flash'),
 ('阿里云', 'aliyun-codingplan-cn', '阿里云 Coding Plan（国内）', 'https://bailian.console.aliyun.com', ALI_CN, None),
 ('阿里云', 'aliyun-codingplan-intl', '阿里云 Coding Plan（国际）', 'https://modelstudio.console.alibabacloud.com', ALI_INTL, None),
 ('阿里云', 'aliyun-tokenplan', '阿里云 Token Plan（国内）', 'https://bailian.console.aliyun.com', ALI_CN, 'qwen3.8-flash'),
 ('阿里云', 'aliyun-tokenplan-intl', '阿里云 Token Plan（国际）', 'https://modelstudio.console.alibabacloud.com', ALI_INTL, 'qwen3.8-flash'),
 ('火山引擎', 'volcengine-cn', '火山方舟', 'https://www.volcengine.com/product/ark', ARK, 'doubao-seed-2-1-lite-260915'),
 ('火山引擎', 'volcengine-cn-codingplan', '火山方舟 Coding Plan', 'https://www.volcengine.com/product/ark', ARK, 'doubao-seed-2.1-lite'),
 ('火山引擎', 'volcengine-cn-agentplan', '火山方舟 Agent Plan', 'https://www.volcengine.com/product/ark', ARK, 'doubao-seed-2.1-lite'),
 ('腾讯云', 'tencent-tokenhub', '腾讯云 TokenHub', 'https://cloud.tencent.com', TC_HUB, 'deepseek-v4.1-flash'),
 ('腾讯云', 'tencent-coding-plan', '腾讯云 Coding Plan', 'https://cloud.tencent.com', TC_LKEAP, None),
 ('腾讯云', 'tencent-token-plan', '腾讯云 Token Plan', 'https://cloud.tencent.com', TC_LKEAP, 'deepseek-v4.1-flash-1017'),
 ('腾讯云', 'tencent-token-plan-enterprise-cn', '腾讯云 Token Plan 企业版', 'https://cloud.tencent.com', TC_HUB, 'deepseek-v4.1-flash'),
 ('腾讯云', 'tencent-hy-token-plan', '腾讯云混元 Token Plan', 'https://cloud.tencent.com', TC_LKEAP, 'hy4'),
 ('腾讯云', 'tencent-hai', '腾讯云 HAI', 'https://cloud.tencent.com/product/hai', 'https://console.cloud.tencent.com/hai', 'deepseek-flash'),
 ('智谱', 'zhipu-cn', '智谱 BigModel（国内）', 'https://open.bigmodel.cn', 'https://open.bigmodel.cn/usercenter/apikeys', 'glm-5.3-flash'),
 ('智谱', 'zhipu-intl', '智谱 Z.AI（国际）', 'https://z.ai', 'https://z.ai/manage-apikey/apikey-list', 'glm-5.3-flash'),
 ('智谱', 'zhipu-cn-codingplan', '智谱 Coding Plan（国内）', 'https://open.bigmodel.cn', 'https://open.bigmodel.cn/usercenter/apikeys', 'glm-5.3-flash'),
 ('智谱', 'zhipu-intl-codingplan', '智谱 Coding Plan（Z.AI）', 'https://z.ai', 'https://z.ai/manage-apikey/apikey-list', 'glm-5.3-flash'),
 ('Kimi', 'kimi-cn', 'Kimi（国内）', 'https://platform.moonshot.cn', 'https://platform.moonshot.cn/console/api-keys', 'kimi-k3.1-pro-highspeed'),
 ('Kimi', 'kimi-intl', 'Kimi（国际）', 'https://platform.moonshot.ai', 'https://platform.moonshot.ai/console/api-keys', 'kimi-k3.1-pro-highspeed'),
 ('Kimi', 'kimi-codingplan', 'Kimi Coding Plan', 'https://www.kimi.com/coding', 'https://www.kimi.com/coding', 'k3.1-pro-highspeed'),
 ('MiniMax', 'minimax-cn', 'MiniMax（国内）', 'https://www.minimaxi.com', 'https://platform.minimaxi.com/user-center/basic-information/interface-key', 'MiniMax-M3.1-Flash'),
 ('MiniMax', 'minimax-intl', 'MiniMax（国际）', 'https://www.minimax.io', 'https://platform.minimax.io/user-center/basic-information/interface-key', 'MiniMax-M3.1-Flash'),
 ('DeepSeek', 'deepseek', 'DeepSeek 官方', 'https://platform.deepseek.com', 'https://platform.deepseek.com/api_keys', 'deepseek-flash'),
 ('硅基流动', 'siliconflow-cn', '硅基流动（国内）', 'https://siliconflow.cn', 'https://cloud.siliconflow.cn/account/ak', 'deepseek-ai/DeepSeek-V4.1-Flash'),
 ('硅基流动', 'siliconflow-intl', '硅基流动（国际）', 'https://siliconflow.com', 'https://cloud.siliconflow.com/account/ak', 'deepseek-ai/DeepSeek-V4.1-Flash'),
 ('小米', 'mimo', '小米 MiMo', 'https://platform.xiaomimimo.com', 'https://platform.xiaomimimo.com', 'mimo-v2.6-flash'),
 ('讯飞', 'iflytek-astron-token-plan', '讯飞星辰 Token Plan', 'https://maas.xfyun.cn', 'https://maas.xfyun.cn', 'xsparkx2flash'),
 ('魔搭', 'modelscope', '魔搭 ModelScope', 'https://modelscope.cn', 'https://modelscope.cn/my/myaccesstoken', 'deepseek-ai/DeepSeek-V4.1-Flash'),
 ('OpenCode', 'opencode-zen-openai', 'OpenCode Zen（OpenAI 兼容）', 'https://opencode.ai', 'https://opencode.ai/auth', 'deepseek-v4.1-flash'),
 ('OpenCode', 'opencode-zen-anthropic', 'OpenCode Zen（Anthropic）', 'https://opencode.ai', 'https://opencode.ai/auth', 'claude-haiku-5-5'),
 ('OpenCode', 'opencode-go-openai', 'OpenCode Go（OpenAI 兼容）', 'https://opencode.ai', 'https://opencode.ai/auth', 'deepseek-v4.1-flash'),
 ('OpenCode', 'opencode-go-anthropic', 'OpenCode Go（Anthropic）', 'https://opencode.ai', 'https://opencode.ai/auth', 'minimax-m3.1-flash'),
 ('海外', 'openai', 'OpenAI', 'https://platform.openai.com', 'https://platform.openai.com/api-keys', 'gpt-6-luna'),
 ('海外', 'anthropic', 'Anthropic', 'https://www.anthropic.com', 'https://console.anthropic.com/settings/keys', 'claude-haiku-5-5'),
 ('海外', 'gemini', 'Google Gemini', 'https://ai.google.dev', 'https://aistudio.google.com/apikey', 'gemini-3.8-flash'),
 ('海外', 'groq', 'Groq', 'https://groq.com', 'https://console.groq.com/keys', 'openai/gpt-oss-20b'),
 ('海外', 'openrouter', 'OpenRouter', 'https://openrouter.ai', 'https://openrouter.ai/keys', 'deepseek/deepseek-v4-pro'),
 ('本机', 'ollama', 'Ollama（本机）', 'https://ollama.com', 'https://ollama.com/library', 'qwen3'),
]
# 旧版预设地址：按地址识别时一并匹配，升级后设置页仍能认出所选服务商
ALIASES = {'minimax-cn': ['https://api.minimax.chat/v1'], 'tencent-tokenhub': ['https://api.hunyuan.cloud.tencent.com/v1']}
SKIP = {'openai-codex', 'onnx', 'siliconflow-embedding-cn', 'dashscope-embedding'}

covered = {s[1] for s in SPEC}
missing = [i for i, p in ps.items() if i not in covered and i not in SKIP and p.get('purpose') != 'embedding']
assert not missing, f'Octop 有未纳入的预设：{missing}'

def q(s): return "'" + str(s).replace('\\', '\\\\').replace("'", "\\'") + "'"
def pick_default(models):
    ids = [m['id'] for m in models]
    for key in ('flash', 'lite', 'turbo', 'mini'):
        for i in ids:
            if key in i.lower() and 'free' not in i.lower(): return i
    return ids[0]

out = ["""// 此文件由 scripts/gen-ai-presets.py 从 Octop（mawanglin.octop）的 providers 预设生成，请勿手改；
// 同步方法见该脚本开头的说明。
// 服务商 / 接入地址 / 接口格式 / 模型清单与 Octop 一致（排除需 ChatGPT 登录的 openai-codex 与仅向量的 embedding 预设），
// 默认模型挑选低延迟的 Flash/Lite 档，适合口令分析与语音对话。`models` 是离线兜底：连上服务商后以「获取模型」的实时结果为准。

export type AIFormat = 'openai' | 'anthropic';

export interface AIPresetModel {
  id: string;
  name: string;
  /** 上下文窗口（token），未知则省略 */
  contextWindow?: number;
  /** 支持图像 / 视频输入 */
  multimodal?: boolean;
  /** 带思考（推理）能力 */
  reasoning?: boolean;
}

export interface AIPresetProvider {
  /** 与 Octop 预设 id 一致 */
  id: string;
  name: string;
  /** 厂商分组，用于下拉框显示 */
  group: string;
  /** 接口格式：openai（OpenAI 兼容）或 anthropic（Messages） */
  format: AIFormat;
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

export const AI_PRESET_PROVIDERS: AIPresetProvider[] = ["""]
for group, oid, name, web, key, dm in SPEC:
    p = ps[oid]
    models = p['models']
    ids = [m['id'] for m in models]
    dm = dm or pick_default(models)
    assert dm in ids, (oid, dm)
    fmt = 'anthropic' if p.get('protocol') == 'anthropic' else 'openai'
    assert p.get('protocol') in ('openai', 'anthropic'), oid
    out.append('  {')
    out.append(f"    id: {q(oid)},\n    name: {q(name)},\n    group: {q(group)},\n    format: {q(fmt)},\n    baseUrl: {q(p['base_url'])},\n    defaultModel: {q(dm)},\n    websiteUrl: {q(web)},\n    apiKeyUrl: {q(key)},")
    if p.get('api_key_prefix'): out.append(f"    keyPrefix: {q(p['api_key_prefix'])},")
    if oid in ALIASES: out.append('    aliases: [' + ', '.join(q(a) for a in ALIASES[oid]) + '],')
    out.append('    models: [')
    for m in models:
        f = [f"id: {q(m['id'])}", f"name: {q(m.get('name') or m['id'])}"]
        if m.get('context_window'): f.append(f"contextWindow: {m['context_window']}")
        inp = m.get('input') or []
        if 'image' in inp or 'video' in inp: f.append('multimodal: true')
        if m.get('reasoning'): f.append('reasoning: true')
        out.append('      { ' + ', '.join(f) + ' },')
    out.append('    ],\n  },')
out.append('];\n')
open(OUT, 'w').write('\n'.join(out))
print(len(SPEC), 'presets')
