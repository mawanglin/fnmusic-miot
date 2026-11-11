import type { AIConfig } from '../types';

const RESERVED_HEADERS = new Set(['authorization', 'x-api-key', 'content-type', 'host', 'content-length', 'transfer-encoding', 'connection', 'x-fetch-timeout-ms']);

/** 配置与发送共用校验；错误中不回显可能含凭据的输入。 */
export function validateAIHeaders(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('自定义请求头必须是 JSON 对象，值必须是字符串');
  const entries: [string, string][] = [], names = new Set<string>();
  for (const [key, value] of Object.entries(raw)) {
    const name = key.toLowerCase();
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(key) || typeof value !== 'string' || /[\x00-\x1f\x7f]/.test(value))
      throw new Error('自定义请求头名称无效或值包含控制字符，值必须是字符串');
    if (RESERVED_HEADERS.has(name))
      throw new Error('自定义请求头不能覆盖认证、JSON 类型、连接或超时请求头');
    if (names.has(name))
      throw new Error('自定义请求头名称不能重复（不区分大小写）');
    names.add(name);
    entries.push([name, value]);
  }
  return Object.fromEntries(entries);
}

/** 设置页允许留空；与后端使用同一套字段校验。 */
export function parseAIHeaders(text: string): Record<string, string> {
  let raw: unknown;
  try { raw = JSON.parse(text.trim() || '{}'); }
  catch { throw new Error('自定义请求头 JSON 格式无效'); }
  return validateAIHeaders(raw);
}

/** 连接是否使用 Anthropic Messages 格式（默认连接看 api_format，对话连接看 api_protocol）。 */
export function isAnthropicConnection(config: { api_format?: string; api_protocol?: string }): boolean {
  return config.api_protocol === 'anthropic' || config.api_format === 'anthropic';
}

export function aiRequestHeaders(config: Pick<AIConfig, 'api_key' | 'custom_headers' | 'api_format'> & { api_protocol?: string }): Record<string, string> {
  if (isAnthropicConnection(config))
    // anthropic-version 允许用自定义请求头覆盖（如使用 beta 版本）。
    return { 'anthropic-version': '2023-06-01', ...validateAIHeaders(config.custom_headers ?? {}), 'Content-Type': 'application/json', 'x-api-key': config.api_key };
  return { ...validateAIHeaders(config.custom_headers ?? {}), 'Content-Type': 'application/json', Authorization: `Bearer ${config.api_key}` };
}
