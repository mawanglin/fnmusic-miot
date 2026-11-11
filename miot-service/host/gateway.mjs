// 飞牛音乐网关（fnOS HTTP 网关）的探测、校验与用户配置。
//
// 为什么需要：飞牛音乐的 /music/api/v1 挂在 fnOS 的「HTTP 网关端口」上，这个端口
// 因机器而异（默认 5666，也可能被用户改成别的）。把端口写死或读错，面板就会
// 一直 `fetch failed`。这里提供三件事，供安装脚本、控制层运行时和设置页共用：
//   1. detect()  自动找出真正的飞牛音乐地址（配置文件 → 常见端口 → 本机监听端口）
//   2. probe()   用「指纹」确认某个地址上跑的确实是飞牛音乐，而不是别的 HTTP 服务
//   3. 用户手动设置（持久化在数据目录，优先级高于自动探测与 .env）
//
// 指纹：GET /music/api/v1/initialization/state（无需登录）返回
//   {"code":0,"msg":"","data":{"initialized":true}}
// 其他服务（nginx/openresty 404、401、HTTPS 端口 400、Web 页面……）都不会同时具备
// 数字 code 与 data.initialized，据此区分，避免误连到别的应用。

import fs from 'node:fs';
import path from 'node:path';

export const FINGERPRINT_PATH = '/music/api/v1/initialization/state';
export const GATEWAY_CONF = process.env.FNMUSIC_GATEWAY_CONF || '/usr/trim/etc/network_gateway_setting.conf';
const COMMON_PORTS = [5666, 6688];
const PROBE_TIMEOUT_MS = 1500;
// 探测时跳过本应用自己的端口，避免自己连自己。
const SELF_PORTS = new Set([8775, 8776]);

/** 读取飞牛网关配置：{"schema":{"http":{"port":5666},"https":{"port":5667}},"force_https":false,...} */
export function readGatewayConf(file = GATEWAY_CONF) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    const http = Number(j?.schema?.http?.port);
    const https = Number(j?.schema?.https?.port);
    return {
      httpPort: Number.isInteger(http) && http > 0 && http < 65536 ? http : 0,
      httpsPort: Number.isInteger(https) && https > 0 && https < 65536 ? https : 0,
      forceHttps: j?.force_https === true,
    };
  } catch {
    return { httpPort: 0, httpsPort: 0, forceHttps: false };
  }
}

/** 本机所有处于 LISTEN 状态的 TCP 端口（读 /proc，不依赖 ss/netstat）。 */
export function listListeningPorts() {
  const ports = new Set();
  for (const f of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let text = '';
    try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
    for (const line of text.split('\n').slice(1)) {
      const cols = line.trim().split(/\s+/);
      // cols[1]=local_address(ip:port 十六进制) cols[3]=state(0A=LISTEN)
      if (cols.length < 4 || cols[3] !== '0A') continue;
      const port = parseInt(cols[1].split(':')[1], 16);
      if (Number.isInteger(port) && port > 0) ports.add(port);
    }
  }
  return [...ports].sort((a, b) => a - b);
}

/** 规范化并校验用户输入的地址；只允许 http/https，去掉路径与末尾斜杠。抛错信息可直接展示。 */
export function normalizeBaseUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('地址不能为空');
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  let u;
  try { u = new URL(withScheme); } catch { throw new Error('地址格式不正确，示例：http://192.168.1.10:5666'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('只支持 http 或 https 地址');
  if (!u.hostname) throw new Error('地址缺少主机名');
  return u.origin;
}

/**
 * 校验某个地址上是不是飞牛音乐。返回 { ok, reason, status }，reason 为给用户看的中文说明。
 * 不抛异常。
 */
export async function probe(baseUrl, { timeoutMs = PROBE_TIMEOUT_MS, fetchImpl = fetch } = {}) {
  const url = String(baseUrl).replace(/\/$/, '') + FINGERPRINT_PATH;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(url, { signal: ctl.signal, redirect: 'manual', headers: { Accept: 'application/json', 'X-Music-API': 'v1' } });
    if (r.status !== 200) {
      return { ok: false, status: r.status, reason: `该地址有响应但不是飞牛音乐接口（HTTP ${r.status}），端口可能不对` };
    }
    let j;
    try { j = await r.json(); } catch { return { ok: false, status: 200, reason: '该地址有响应但不是飞牛音乐接口（返回内容不是预期的 JSON）' }; }
    if (typeof j?.code === 'number' && j?.data && typeof j.data === 'object' && 'initialized' in j.data) {
      return { ok: true, status: 200, reason: j.data.initialized ? '' : '飞牛音乐尚未完成初始化，请先在飞牛音乐里完成设置' };
    }
    return { ok: false, status: 200, reason: '该地址有响应但不是飞牛音乐接口，端口可能不对' };
  } catch (err) {
    const code = err?.cause?.code || err?.code || '';
    let reason;
    if (err?.name === 'AbortError') reason = '连接超时，请检查地址和端口';
    else if (code === 'ECONNREFUSED') reason = '连接被拒绝：该端口没有服务在监听，端口可能不对或飞牛音乐未运行';
    else if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') reason = '主机名无法解析，请检查地址';
    else if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') reason = '网络不可达，请检查 IP 地址';
    else reason = `无法连接：${err?.message || err}`;
    return { ok: false, status: 0, reason, code };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 自动探测飞牛音乐地址。候选优先级：
 *   1. 网关配置文件里的 HTTP 端口（最权威）
 *   2. 常见端口 5666 / 6688
 *   3. 本机其他监听端口（逐个指纹验证，并发）
 * 返回 { baseUrl, port, source } 或 null。host 默认 127.0.0.1（与飞牛同机）。
 */
export async function detect({ host = '127.0.0.1', conf = readGatewayConf(), listening = listListeningPorts(), probeImpl = probe } = {}) {
  const tried = new Set();
  const tryPort = async (port, source) => {
    if (!port || tried.has(port) || SELF_PORTS.has(port)) return null;
    tried.add(port);
    const baseUrl = `http://${host}:${port}`;
    const r = await probeImpl(baseUrl);
    return r.ok ? { baseUrl, port, source } : null;
  };

  const first = await tryPort(conf.httpPort, '网关配置文件');
  if (first) return first;
  for (const p of COMMON_PORTS) {
    const hit = await tryPort(p, '常见端口');
    if (hit) return hit;
  }
  const rest = listening.filter((p) => !tried.has(p) && !SELF_PORTS.has(p) && p !== conf.httpsPort);
  // 并发但限流，避免一次性打开几十个连接。
  const BATCH = 8;
  for (let i = 0; i < rest.length; i += BATCH) {
    const results = await Promise.all(rest.slice(i, i + BATCH).map((p) => tryPort(p, '本机监听端口')));
    const hit = results.find(Boolean);
    if (hit) return hit;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 用户手动设置（持久化）。文件：<dataDir>/fnmusic-gateway.json
//   { "mode": "manual", "base_url": "http://10.4.0.10:5666" }
// 没有这个文件 = 自动模式。手动设置优先于 .env 和自动探测，探测永远不会覆盖它。
// ---------------------------------------------------------------------------
export function createGatewaySettings(dataDir) {
  const file = path.join(dataDir, 'fnmusic-gateway.json');
  return {
    file,
    load() {
      try {
        const j = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (j?.mode === 'manual' && typeof j.base_url === 'string' && j.base_url) {
          return { mode: 'manual', baseUrl: normalizeBaseUrl(j.base_url) };
        }
      } catch { /* 不存在或损坏 → 自动模式 */ }
      return { mode: 'auto', baseUrl: '' };
    },
    saveManual(baseUrl) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ mode: 'manual', base_url: baseUrl }, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, file);
    },
    clear() {
      try { fs.unlinkSync(file); } catch { /* 本来就没有 */ }
    },
  };
}

// ---------------------------------------------------------------------------
// 运行时管理：自动恢复 + 状态 + 设置页保存。fn 是 createFnMusicClient() 的实例，
// 创建客户端需要先有 recover，所以用 attach() 后绑。
// ---------------------------------------------------------------------------
const RECOVER_MIN_INTERVAL_MS = 15_000;
const STATUS_CACHE_MS = 5_000;

export function createGatewayManager({ settings, envBaseUrl, log = console, onChanged = () => {} }) {
  let fn = null;
  const initial = settings.load();
  let mode = initial.mode;                 // 'manual' | 'auto'
  let source = mode === 'manual' ? '用户设置' : '安装时配置';
  let last = { at: 0, ok: null, reason: '', url: '' };
  let recovering = null;
  let lastRecoverAt = 0;

  const hostOf = (u) => { try { return new URL(u).hostname; } catch { return '127.0.0.1'; } };

  async function recover(failed) {
    // 手动设置过的地址，绝不被自动探测改掉；只在状态里如实告诉用户连不上。
    if (mode === 'manual') return null;
    if (recovering) return recovering;
    if (Date.now() - lastRecoverAt < RECOVER_MIN_INTERVAL_MS) return null;
    lastRecoverAt = Date.now();
    recovering = (async () => {
      try {
        const host = hostOf(failed);
        let hit = await detect({ host });
        if (!hit && host !== '127.0.0.1') hit = await detect({ host: '127.0.0.1' });
        if (!hit) { log.warn?.('[gateway] 自动探测没有找到飞牛音乐，请在设置里手动填写地址'); return null; }
        if (hit.baseUrl === failed) return null;
        source = `自动探测（${hit.source}）`;
        last = { at: Date.now(), ok: true, reason: '', url: hit.baseUrl };
        log.warn?.(`[gateway] 飞牛音乐地址 ${failed} → ${hit.baseUrl}（${hit.source}）`);
        setImmediate(() => onChanged());
        return hit.baseUrl;
      } finally {
        recovering = null;
      }
    })();
    return recovering;
  }

  async function status({ fresh = false } = {}) {
    const url = fn?.baseUrl || envBaseUrl;
    if (!fresh && last.url === url && last.ok !== null && Date.now() - last.at < STATUS_CACHE_MS) return view();
    const r = await probe(url);
    last = { at: Date.now(), ok: r.ok, reason: r.reason, url };
    // 自动模式下发现连不上，顺手触发一次恢复；恢复后再测一遍给出最新结论。
    if (!r.ok && mode === 'auto') {
      const next = await recover(url);
      if (next) { fn?.setBaseUrl(next); const r2 = await probe(next); last = { at: Date.now(), ok: r2.ok, reason: r2.reason, url: next }; }
    }
    return view();
  }

  function view() {
    return {
      base_url: fn?.baseUrl || envBaseUrl,
      mode,
      source,
      reachable: last.ok === true,
      checked: last.ok !== null,
      reason: last.reason || '',
      checked_at: last.at,
    };
  }

  return {
    attach(client) { fn = client; },
    get mode() { return mode; },
    recover,
    status,
    /** 只测不存：设置页“测试连接”。 */
    async test(url) {
      const base = normalizeBaseUrl(url);
      const r = await probe(base);
      return { base_url: base, ok: r.ok, reason: r.reason };
    },
    /** 只找不存：设置页“自动探测”。 */
    async detectNow() {
      const hit = await detect({ host: '127.0.0.1' });
      return hit ? { found: true, base_url: hit.baseUrl, port: hit.port, source: hit.source } : { found: false };
    },
    /** 保存：manual 用给定地址；auto 清除手动设置并重新探测。 */
    async apply({ mode: want, baseUrl, force = false }) {
      if (want === 'manual') {
        const base = normalizeBaseUrl(baseUrl);
        const r = await probe(base);
        if (!r.ok && !force) {
          const err = new Error(r.reason || '无法连接该地址');
          err.code = 'UNREACHABLE';
          throw err;
        }
        settings.saveManual(base);
        mode = 'manual';
        source = '用户设置';
        fn?.setBaseUrl(base);
        last = { at: Date.now(), ok: r.ok, reason: r.reason, url: base };
      } else {
        settings.clear();
        mode = 'auto';
        lastRecoverAt = 0;
        const hit = await detect({ host: '127.0.0.1' });
        const next = hit ? hit.baseUrl : envBaseUrl;
        source = hit ? `自动探测（${hit.source}）` : '安装时配置';
        fn?.setBaseUrl(next);
        const r = await probe(next);
        last = { at: Date.now(), ok: r.ok, reason: r.reason, url: next };
      }
      setImmediate(() => onChanged());
      return view();
    },
  };
}
