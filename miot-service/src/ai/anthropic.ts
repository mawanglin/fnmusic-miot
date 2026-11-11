import type { HTTPStream } from '@songloft/plugin-sdk';
import { SSEParser } from './sse';

interface AnthropicMessage { role: 'system' | 'user' | 'assistant'; content: string; }
interface Block { type?: string; text?: string; }
interface MessageBody { type?: string; role?: string; content?: Block[]; stop_reason?: string | null; error?: unknown; }

/** Anthropic Messages 请求体：system 单独放在顶层，messages 只含 user/assistant，max_tokens 必填。 */
export function anthropicRequestBody(model: string, messages: AnthropicMessage[], maxTokens: number, stream: boolean): Record<string, unknown> {
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const turns: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    const last = turns[turns.length - 1];
    // Messages 接口要求角色交替；相邻同角色消息合并，避免 400。
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else turns.push({ role: m.role, content: m.content });
  }
  if (turns.length && turns[0].role !== 'user') turns.unshift({ role: 'user', content: '（继续）' });
  return { model, max_tokens: maxTokens, ...(system ? { system } : {}), messages: turns, stream };
}

/** 只取已完整结束的 assistant 文本（跳过 thinking 块）；工具调用/被截断不当作答案。 */
export function readAnthropicText(value: unknown): string {
  const data = value as MessageBody | null;
  if (!data || data.error || data.type === 'error') throw new Error('AI Anthropic 回答未正常完成');
  if (data.stop_reason === 'tool_use') throw new Error('AI 返回了尚未执行的工具调用');
  if (data.stop_reason === 'refusal') throw new Error('AI 拒绝回答该问题');
  const blocks = Array.isArray(data.content) ? data.content : [];
  const parts = blocks.filter(b => b.type === 'text');
  if (parts.some(b => typeof b.text !== 'string')) throw new Error('AI Anthropic 正文格式无效');
  const text = parts.map(b => b.text).join('');
  if (!text.trim()) throw new Error('AI 返回了空回答');
  return text.trim().slice(0, 16000);
}

/** Anthropic 流式事件以 message_stop 结束；错误以 error 事件到达。 */
export async function readAnthropicStream(stream: HTTPStream, current: () => boolean, progress: (text: string) => void, _onSearchCompleted?: () => void): Promise<string> {
  let answer = '', done = false, stopReason = '';
  const parser = new SSEParser(data => {
    if (done) return;
    const frame = JSON.parse(data);
    if (frame?.type === 'error' || frame?.error) throw new Error('AI 流式响应返回错误');
    if (frame?.type === 'content_block_delta' && frame.delta?.type === 'text_delta') {
      if (typeof frame.delta.text !== 'string') throw new Error('AI 流式正文格式无效');
      if (frame.delta.text && answer.length < 16000) {
        answer = (answer + frame.delta.text).slice(0, 16000);
        progress(answer);
      }
    }
    if (frame?.type === 'message_delta' && frame.delta?.stop_reason) stopReason = frame.delta.stop_reason;
    if (frame?.type === 'message_stop') done = true;
  });
  while (!done) {
    if (!current()) throw new Error('任务已取消');
    const chunk = await stream.read();
    if (!current()) throw new Error('任务已取消');
    if (chunk === null) break;
    parser.feed(chunk);
  }
  if (!done) throw new Error('AI 流式连接中断，回答未完成');
  if (stopReason === 'tool_use') throw new Error('AI 返回了尚未执行的工具调用');
  if (stopReason === 'refusal') throw new Error('AI 拒绝回答该问题');
  if (!answer.trim()) throw new Error('AI 返回了空回答');
  return answer.trim();
}
