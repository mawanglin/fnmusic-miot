import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_PRESET_PROVIDERS as P } from '../src/aiPresets.ts';

test('预设 id 唯一、地址为 https/本机 且默认模型在清单内', () => {
  assert.equal(new Set(P.map(p => p.id)).size, P.length);
  for (const p of P) {
    assert.match(p.baseUrl, /^https:\/\/|^http:\/\/localhost/, p.id);
    assert.ok(p.models.length > 0, p.id);
    assert.ok(p.models.some(m => m.id === p.defaultModel), `${p.id} 默认模型 ${p.defaultModel} 不在清单`);
    assert.equal(new Set(p.models.map(m => m.id)).size, p.models.length, `${p.id} 模型重复`);
  }
});

test('与 Octop 对齐：关键服务商地址与默认模型', () => {
  const by = Object.fromEntries(P.map(p => [p.id, p]));
  assert.equal(by.zhipu.baseUrl, 'https://open.bigmodel.cn/api/paas/v4');
  assert.equal(by.dashscope.baseUrl, 'https://dashscope.aliyuncs.com/compatible-mode/v1');
  assert.equal(by.minimax.baseUrl, 'https://api.minimaxi.com/v1');
  assert.ok(by.minimax.aliases.includes('https://api.minimax.chat/v1'));
});
