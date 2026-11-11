// 连接探测：服务不提供 /models（如火山方舟 Coding / Agent Plan）时，用一次极小的对话请求
// 验证「地址 + 密钥 + 模型」是否可用。只看 HTTP 状态，不解析回答（max_tokens 很小，可能被截断）。
import type { AIConfig } from '../types';
import { aiAnthropicMessagesUrl, aiChatCompletionsUrl } from '../utils/ai_url';
import { aiRequestHeaders, isAnthropicConnection } from '../utils/ai_headers';
import { canDisableDashScopeThinking } from '../utils/ai_thinking';
import { requestAI } from '../utils/ai_request';

type ProbeConfig = Pick<AIConfig, 'api_url' | 'api_key' | 'model' | 'timeout' | 'custom_headers' | 'api_format'> & { api_protocol?: string };

export function probeRequest(config: ProbeConfig): { endpoint: string; body: Record<string, unknown> } {
  const messages = [{ role: 'user', content: 'ping' }];
  if (isAnthropicConnection(config))
    return { endpoint: aiAnthropicMessagesUrl(config.api_url), body: { model: config.model, max_tokens: 8, messages } };
  const endpoint = aiChatCompletionsUrl(config.api_url);
  return {
    endpoint,
    body: { model: config.model, max_tokens: 8, messages, ...(canDisableDashScopeThinking(endpoint, config.model) ? { enable_thinking: false } : {}) },
  };
}

export async function probeChat(config: ProbeConfig): Promise<void> {
  if (!config.model) throw new Error('该服务不提供模型列表，请先选择或手动填写模型名后再检测');
  const { endpoint, body } = probeRequest(config);
  await requestAI(endpoint, { method: 'POST', headers: aiRequestHeaders(config), body: JSON.stringify(body) },
    config.timeout, { kind: 'models', model: config.model }, async (resp) => {
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`对话请求失败 (${resp.status}): ${text.slice(0, 200)}`);
      }
    });
}

/** 模型列表端点不存在（404/405）时才回退探测；鉴权等错误照常报告。 */
export function isListUnsupported(message: string): boolean {
  return /[(（：:]\s*(404|405)\b|not found/i.test(message);
}
