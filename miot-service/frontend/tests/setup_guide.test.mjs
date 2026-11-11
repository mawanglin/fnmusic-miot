import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSetupGuide } from '../src/setupGuide.ts';

const ready = { accountsLoaded: true, deviceConnecting: false };
const okAccount = { logged_in: true, is_valid: true };

test('加载中不引导，避免误报未登录', () => {
  assert.equal(computeSetupGuide({ ...ready, accountsLoaded: false, accounts: [], devices: [] }), null);
  assert.equal(computeSetupGuide({ ...ready, deviceConnecting: true, accounts: [], devices: [] }), null);
});

test('没有账号 → 引导登录', () => {
  const g = computeSetupGuide({ ...ready, accounts: [], devices: [] });
  assert.equal(g?.stage, 'login');
  assert.match(g.title, /登录小米账号/);
});

test('账号全部失效 → 引导重新登录', () => {
  const g = computeSetupGuide({ ...ready, accounts: [{ logged_in: true, is_valid: false }, { logged_in: false }], devices: [] });
  assert.equal(g?.stage, 'login');
  assert.match(g.title, /重新登录/);
});

test('只要有一个有效账号就不再要求登录', () => {
  const g = computeSetupGuide({ ...ready, accounts: [{ logged_in: false }, okAccount], devices: [{ devices: [{ managed: true }] }] });
  assert.equal(g, null);
});

test('已登录但没有设备 / 没勾选设备 → 引导启用音箱', () => {
  let g = computeSetupGuide({ ...ready, accounts: [okAccount], devices: [] });
  assert.equal(g?.stage, 'device');
  assert.match(g.text, /没有找到音箱/);
  g = computeSetupGuide({ ...ready, accounts: [okAccount], devices: [{ devices: [{ managed: false }] }] });
  assert.equal(g?.stage, 'device');
  assert.match(g.text, /勾选/);
});

test('登录且至少启用一台音箱 → 不引导', () => {
  assert.equal(computeSetupGuide({ ...ready, accounts: [okAccount], devices: [{ devices: [{ managed: false }, { managed: true }] }] }), null);
});
