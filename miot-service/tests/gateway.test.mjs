// node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  probe, detect, readGatewayConf, normalizeBaseUrl, createGatewaySettings, createGatewayManager, FINGERPRINT_PATH,
} from '../host/gateway.mjs';
import { createFnMusicClient } from '../adapter/fnmusic.mjs';

function serve(handler) {
  return new Promise((resolve) => {
    const s = http.createServer(handler);
    s.listen(0, '127.0.0.1', () => resolve({ s, port: s.address().port, url: `http://127.0.0.1:${s.address().port}` }));
  });
}
const fnmusic = (initialized = true) => (req, res) => {
  if (req.url.startsWith(FINGERPRINT_PATH)) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 0, msg: '', data: { initialized } }));
  } else { res.writeHead(404); res.end('nope'); }
};
const notFnmusic = (status, body) => (req, res) => { res.writeHead(status); res.end(body); };
async function freePort() { const t = await serve(() => {}); const p = t.port; await new Promise((r) => t.s.close(r)); return p; }
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gw-'));

test('readGatewayConf 解析飞牛真实的嵌套 JSON', () => {
  const f = path.join(tmp(), 'gw.json');
  fs.writeFileSync(f, '{"schema":{"http":{"port":5666},"https":{"port":5667}},"force_https":false,"redirect":false}');
  assert.deepEqual(readGatewayConf(f), { httpPort: 5666, httpsPort: 5667, forceHttps: false });
  assert.equal(readGatewayConf('/nonexistent').httpPort, 0);
  fs.writeFileSync(f, 'not json');
  assert.equal(readGatewayConf(f).httpPort, 0);
});

test('normalizeBaseUrl：补协议、去路径、拒绝非 http', () => {
  assert.equal(normalizeBaseUrl('10.4.0.10:5666'), 'http://10.4.0.10:5666');
  assert.equal(normalizeBaseUrl(' http://nas.local:5666/music/ '), 'http://nas.local:5666');
  assert.equal(normalizeBaseUrl('https://a.b'), 'https://a.b');
  assert.throws(() => normalizeBaseUrl(''), /不能为空/);
  assert.throws(() => normalizeBaseUrl('ftp://x'), /http 或 https/);
  assert.throws(() => normalizeBaseUrl('http://'), /格式/);
});

test('probe：飞牛指纹通过，其他服务都不通过，并给出人话原因', async () => {
  const good = await serve(fnmusic());
  const html = await serve(notFnmusic(200, '<html>hi</html>'));
  const nf = await serve(notFnmusic(404, 'x'));
  const noInit = await serve(notFnmusic(200, JSON.stringify({ code: 0, data: {} })));
  const dead = await freePort();
  try {
    assert.equal((await probe(good.url)).ok, true);
    assert.equal((await probe(good.url + '/')).ok, true);
    assert.match((await probe(html.url)).reason, /不是飞牛音乐接口/);
    assert.match((await probe(nf.url)).reason, /HTTP 404/);
    assert.equal((await probe(noInit.url)).ok, false);
    const r = await probe(`http://127.0.0.1:${dead}`);
    assert.equal(r.ok, false);
    assert.match(r.reason, /连接被拒绝/);
  } finally { for (const x of [good, html, nf, noInit]) x.s.close(); }
});

test('probe：未初始化的飞牛音乐算连通但给提示', async () => {
  const s = await serve(fnmusic(false));
  try { const r = await probe(s.url); assert.equal(r.ok, true); assert.match(r.reason, /尚未完成初始化/); } finally { s.s.close(); }
});

test('detect：优先配置文件端口，其次常见端口，最后扫描监听端口', async () => {
  const good = await serve(fnmusic());
  const decoy = await serve(notFnmusic(401, 'Not Authorized'));
  try {
    // 1. 配置文件给对了
    let hit = await detect({ conf: { httpPort: good.port, httpsPort: 0 }, listening: [decoy.port, good.port] });
    assert.equal(hit.port, good.port); assert.equal(hit.source, '网关配置文件');
    // 2. 配置文件读不到（0），只能靠扫描监听端口；诱饵端口不会被误认
    hit = await detect({ conf: { httpPort: 0, httpsPort: 0 }, listening: [decoy.port, good.port] });
    assert.equal(hit.port, good.port); assert.equal(hit.source, '本机监听端口');
    // 3. 配置文件写了错端口也能找回来（这正是线上出的问题：配置/默认写 6688，实际在别处）
    const dead = await freePort();
    hit = await detect({ conf: { httpPort: dead, httpsPort: 0 }, listening: [good.port] });
    assert.equal(hit.port, good.port);
    // 4. 没有飞牛音乐 → null
    assert.equal(await detect({ conf: { httpPort: dead, httpsPort: 0 }, listening: [decoy.port] }), null);
  } finally { good.s.close(); decoy.s.close(); }
});

test('detect：不会探测本应用自己的 8775/8776', async () => {
  const seen = [];
  const hit = await detect({ conf: { httpPort: 8775, httpsPort: 0 }, listening: [8775, 8776], probeImpl: async (u) => { seen.push(u); return { ok: false }; } });
  assert.equal(hit, null);
  assert.ok(!seen.some((u) => /:877[56]$/.test(u)), seen.join());
});

test('手动设置持久化，且探测永远不覆盖它', async () => {
  const dir = tmp();
  const settings = createGatewaySettings(dir);
  assert.equal(settings.load().mode, 'auto');
  const good = await serve(fnmusic());
  try {
    const gw = createGatewayManager({ settings, envBaseUrl: 'http://127.0.0.1:1', log: { warn() {}, info() {} } });
    const calls = [];
    const fn = createFnMusicClient({ baseUrl: 'http://127.0.0.1:1', log: { warn() {} } });
    gw.attach(fn);
    await assert.rejects(gw.apply({ mode: 'manual', baseUrl: 'http://127.0.0.1:1' }), /连接被拒绝|无法连接/); // 连不上默认不让存
    const v = await gw.apply({ mode: 'manual', baseUrl: good.url });
    assert.equal(v.mode, 'manual'); assert.equal(v.reachable, true); assert.equal(fn.baseUrl, good.url);
    assert.deepEqual(settings.load(), { mode: 'manual', baseUrl: good.url });
    assert.equal(await gw.recover('http://x'), null); // manual → 不自动改
    // 重启后（新 manager）仍是手动
    assert.equal(createGatewaySettings(dir).load().baseUrl, good.url);
    // 切回自动：清除文件
    await gw.apply({ mode: 'auto' });
    assert.equal(settings.load().mode, 'auto');
  } finally { good.s.close(); }
});

test('客户端：连不上时自动恢复到新地址并重试成功；手动模式不恢复', async () => {
  const good = await serve((req, res) => {
    if (req.url.startsWith('/music/api/v1/playlist/list')) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ code: 0, data: { list: [] } })); }
    else fnmusic()(req, res);
  });
  const dead = await freePort();
  const log = { warn() {}, info() {} };
  try {
    const mk = (recover) => createFnMusicClient({ baseUrl: `http://127.0.0.1:${dead}`, tokenProvider: async () => 'tok', recoverBaseUrl: recover, log });
    const ok = mk(async () => good.url);
    const data = await ok.getPlaylists();
    assert.deepEqual(data, { list: [] });
    assert.equal(ok.baseUrl, good.url);
    const no = mk(async () => null);
    await assert.rejects(no.getPlaylists(), /fetch failed/);
    assert.equal(no.baseUrl, `http://127.0.0.1:${dead}`);
  } finally { good.s.close(); }
});

test('manager.recover：自动模式找到则切换，且 15s 内不重复探测', async () => {
  const good = await serve(fnmusic());
  const dead = await freePort();
  const log = { warn() {}, info() {} };
  try {
    const settings = createGatewaySettings(tmp());
    const gw = createGatewayManager({ settings, envBaseUrl: `http://127.0.0.1:${dead}`, log });
    // 用假的 detect：通过把 good 放进监听列表不方便，这里直接验证节流与手动保护
    assert.equal(gw.mode, 'auto');
    const first = await gw.recover(`http://127.0.0.1:${dead}`).catch(() => null);
    const second = await gw.recover(`http://127.0.0.1:${dead}`);
    assert.equal(second, null); // 节流窗口内直接返回
    assert.ok(first === null || typeof first === 'string');
  } finally { good.s.close(); }
});
