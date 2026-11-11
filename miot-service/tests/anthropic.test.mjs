import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// 把 TS 源码打成单个 ESM，避免 node 对无扩展名导入的解析限制。
async function load(entry) {
  const out = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
}
const entry = new URL('./anthropic_entry.ts', import.meta.url).pathname;
import fs from 'node:fs';
fs.writeFileSync(entry, `
export { anthropicRequestBody, readAnthropicText, readAnthropicStream } from '../src/ai/anthropic';
export { createAIRequest } from '../src/ai/protocol';
export { aiRequestHeaders, isAnthropicConnection, validateAIHeaders } from '../src/utils/ai_headers';
export { aiModelsUrl, aiAnthropicMessagesUrl } from '../src/utils/ai_url';
export { chatConnection, validateChatConfig, DEFAULT_CHAT_CONFIG } from '../src/chat/types';
`);
const m = await load(entry);
fs.rmSync(entry);

const stream = (frames) => {
  const bytes = new TextEncoder().encode(frames.map(f => `event: ${f.type}\ndata: ${JSON.stringify(f)}\n\n`).join(''));
  let sent = false;
  return { read: async () => (sent ? null : (sent = true, bytes)) };
};

test('请求体：system 提到顶层，相邻同角色合并，首条必须是 user', () => {
  const b = m.anthropicRequestBody('claude-haiku-5-5', [
    { role: 'system', content: 'S1' }, { role: 'system', content: 'S2' },
    { role: 'assistant', content: 'a' }, { role: 'user', content: 'u1' }, { role: 'user', content: 'u2' },
  ], 1200, false);
  assert.equal(b.system, 'S1\n\nS2');
  assert.equal(b.max_tokens, 1200);
  assert.deepEqual(b.messages.map(x => x.role), ['user', 'assistant', 'user']);
  assert.equal(b.messages[2].content, 'u1\n\nu2');
  assert.equal(b.stream, false);
});

test('createAIRequest：anthropic 走 /messages，地址无 /v1 时补齐', () => {
  const r = m.createAIRequest({ api_protocol: 'anthropic', api_url: 'https://opencode.ai/zen', api_key: 'k', model: 'x', timeout: 5, enabled: true }, [{ role: 'user', content: 'hi' }], 'chat', true, true);
  assert.equal(r.endpoint, 'https://opencode.ai/zen/v1/messages');
  assert.equal(r.body.stream, true);
  assert.equal(r.body.tools, undefined, '不发送联网搜索工具');
  const r2 = m.createAIRequest({ api_protocol: 'anthropic', api_url: 'https://api.anthropic.com/v1/', api_key: 'k', model: 'x', timeout: 5, enabled: true }, [{ role: 'user', content: 'hi' }], 'summary', false, false);
  assert.equal(r2.endpoint, 'https://api.anthropic.com/v1/messages');
});

test('请求头：anthropic 用 x-api-key，不带 Bearer；openai 保持不变', () => {
  const h = m.aiRequestHeaders({ api_key: 'sk-ant', api_format: 'anthropic', custom_headers: {} });
  assert.equal(h['x-api-key'], 'sk-ant');
  assert.equal(h['anthropic-version'], '2023-06-01');
  assert.equal(h.Authorization, undefined);
  assert.equal(m.aiRequestHeaders({ api_key: 'sk-ant', api_format: 'anthropic', custom_headers: { 'anthropic-version': '2099-01-01' } })['anthropic-version'], '2099-01-01');
  assert.equal(m.aiRequestHeaders({ api_key: 'k', custom_headers: {} }).Authorization, 'Bearer k');
  assert.throws(() => m.validateAIHeaders({ 'X-Api-Key': 'x' }), /不能覆盖/);
  assert.equal(m.isAnthropicConnection({ api_protocol: 'anthropic' }), true);
});

test('模型列表地址：anthropic 放大分页', () => {
  assert.equal(m.aiModelsUrl('https://api.anthropic.com/v1', true), 'https://api.anthropic.com/v1/models?limit=1000');
  assert.equal(m.aiModelsUrl('https://x/v1'), 'https://x/v1/models');
});

test('非流式解析：拼接 text 块、跳过 thinking，拒绝工具调用与空回答', () => {
  assert.equal(m.readAnthropicText({ type: 'message', stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: 'x' }, { type: 'text', text: ' 你好 ' }, { type: 'text', text: '世界' }] }), '你好 世界');
  assert.throws(() => m.readAnthropicText({ stop_reason: 'tool_use', content: [] }), /工具调用/);
  assert.throws(() => m.readAnthropicText({ content: [{ type: 'text', text: '  ' }] }), /空回答/);
  assert.throws(() => m.readAnthropicText({ type: 'error', error: {} }), /未正常完成/);
});

test('流式解析：累计 text_delta，遇 message_stop 结束；中断/错误抛出', async () => {
  const seen = [];
  const ok = await m.readAnthropicStream(stream([
    { type: 'message_start', message: {} },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '你' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '好' } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
    { type: 'message_stop' },
  ]), () => true, t => seen.push(t));
  assert.equal(ok, '你好');
  assert.deepEqual(seen, ['你', '你好']);
  await assert.rejects(m.readAnthropicStream(stream([{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'a' } }]), () => true, () => { }), /中断/);
  await assert.rejects(m.readAnthropicStream(stream([{ type: 'error', error: { type: 'overloaded_error' } }]), () => true, () => { }), /错误/);
});

test('对话连接：复用默认连接时格式跟随；独立连接用自己的协议', () => {
  const cfg = { ...m.DEFAULT_CHAT_CONFIG, api_protocol: 'responses' };
  const analysis = { enabled: true, api_url: 'https://a/v1', api_key: 'k', model: 'm', timeout: 6, api_format: 'anthropic' };
  assert.equal(m.chatConnection(cfg, analysis).api_protocol, 'anthropic');
  assert.equal(m.chatConnection(cfg, { ...analysis, api_format: 'openai' }).api_protocol, 'responses');
  assert.equal(m.chatConnection({ ...cfg, api_protocol: 'anthropic' }, { ...analysis, api_format: 'openai' }).api_protocol, 'chat_completions');
  assert.equal(m.chatConnection({ ...cfg, connection: 'independent', api_protocol: 'anthropic' }, analysis).api_protocol, 'anthropic');
  assert.equal(m.validateChatConfig({ api_protocol: 'anthropic' }).api_protocol, 'anthropic');
  assert.throws(() => m.validateChatConfig({ api_protocol: 'nope' }), /api_protocol/);
});

test('地址归一：Gemini 的 /v1beta/openai 不再被误补 /v1', () => {
  assert.equal(m.aiModelsUrl('https://generativelanguage.googleapis.com/v1beta/openai'), 'https://generativelanguage.googleapis.com/v1beta/openai/models');
  assert.equal(m.aiAnthropicMessagesUrl('https://opencode.ai/zen/go'), 'https://opencode.ai/zen/go/v1/messages');
  assert.equal(m.aiModelsUrl('https://api.lkeap.cloud.tencent.com/coding/v3'), 'https://api.lkeap.cloud.tencent.com/coding/v3/models');
});
