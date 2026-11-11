import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AI_PRESET_PROVIDERS as P } from '../src/aiPresets.ts';

const by = Object.fromEntries(P.map(p => [p.id, p]));

test('预设 id 唯一、地址为 https/本机、格式合法且默认模型在清单内', () => {
  assert.equal(new Set(P.map(p => p.id)).size, P.length);
  for (const p of P) {
    assert.match(p.baseUrl, /^https:\/\/|^http:\/\/localhost/, p.id);
    assert.ok(['openai', 'anthropic'].includes(p.format), p.id);
    assert.ok(p.group && p.name, p.id);
    assert.ok(p.models.length > 0, p.id);
    assert.ok(p.models.some(m => m.id === p.defaultModel), `${p.id} 默认模型 ${p.defaultModel} 不在清单`);
    assert.equal(new Set(p.models.map(m => m.id)).size, p.models.length, `${p.id} 模型重复`);
  }
});

test('与 Octop 对齐：包含各类 Coding / Agent / Token Plan', () => {
  for (const id of ['aliyun-codingplan-cn', 'aliyun-tokenplan', 'volcengine-cn-codingplan', 'volcengine-cn-agentplan',
    'tencent-coding-plan', 'tencent-token-plan', 'tencent-hy-token-plan', 'zhipu-cn-codingplan', 'kimi-codingplan', 'iflytek-astron-token-plan'])
    assert.ok(by[id], `缺少 ${id}`);
  assert.equal(by['zhipu-cn'].baseUrl, 'https://open.bigmodel.cn/api/paas/v4');
  assert.equal(by['minimax-cn'].baseUrl, 'https://api.minimaxi.com/v1');
  assert.ok(by['minimax-cn'].aliases.includes('https://api.minimax.chat/v1'));
});

test('Anthropic 格式预设', () => {
  assert.deepEqual(P.filter(p => p.format === 'anthropic').map(p => p.id).sort(), ['anthropic', 'opencode-go-anthropic', 'opencode-zen-anthropic']);
  assert.equal(by.anthropic.baseUrl, 'https://api.anthropic.com/v1');
});

test('设置页始终显示接口格式与 API 地址（不再只在自定义时显示）', () => {
  const vue = fs.readFileSync(new URL('../src/views/settings/AIModelSettings.vue', import.meta.url), 'utf8');
  const tpl = vue.slice(vue.indexOf('<template>'));
  assert.match(tpl, /aria-label="选择 AI 接口格式"/);
  assert.doesNotMatch(tpl, /v-if="selectedPreset === 'custom'"/);
});
