// 频谱预分析（设置 → 播放 →「播放频谱动画」，默认关闭）。
//
// 声音在小爱音箱上播放，浏览器拿不到实际音频，所以不做实时采样：切到某首歌时，
// 在 NAS 上用随包 ffmpeg 把同一首歌解码成单声道 PCM，按 20 帧/秒、24 个对数频段
// 计算幅度，压成每帧 24 字节交给网页，网页按播放进度同步绘制。
// 一首 4 分钟的歌约 4800 帧 ≈ 115 KB（base64 后约 150 KB），结果缓存在
// <dataDir>/spectrum/<guid>.json，只保留最近 MAX_CACHE 首。

import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import fs from 'node:fs';
import path from 'node:path';

export const SPECTRUM_FPS = 20;
export const SPECTRUM_BANDS = 24;
const SAMPLE_RATE = 22050;
const FFT_SIZE = 2048;
const MIN_HZ = 50;
const MAX_HZ = 10000;
const DYNAMIC_RANGE_DB = 42;
const MAX_SECONDS = 20 * 60;
const MAX_CACHE = 300;
const TIMEOUT_MS = 3 * 60 * 1000;

// ---------- 纯计算部分（可单测） ----------

/** 原地基 2 FFT（re/im 长度为 2 的幂）。 */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/** 每个频段对应的 FFT bin 区间 [from, to)，对数分布，低频段至少 1 个 bin。 */
export function bandEdges(bands = SPECTRUM_BANDS, sampleRate = SAMPLE_RATE, size = FFT_SIZE) {
  const binHz = sampleRate / size;
  const edges = [];
  let prev = Math.max(1, Math.floor(MIN_HZ / binHz));
  for (let b = 0; b < bands; b++) {
    const hz = MIN_HZ * (MAX_HZ / MIN_HZ) ** ((b + 1) / bands);
    const to = Math.max(prev + 1, Math.min(size / 2, Math.round(hz / binHz)));
    edges.push([prev, to]);
    prev = to;
  }
  return edges;
}

/**
 * 把单声道 PCM（Float32，-1..1）转成频谱帧：返回 { frames: Uint8Array, count }。
 * 每帧 SPECTRUM_BANDS 字节，0..255。按整首歌的高位电平做归一化，
 * 安静的歌和响的歌都能用满动画幅度。
 */
export function analyzePcm(samples, sampleRate = SAMPLE_RATE, fps = SPECTRUM_FPS, bands = SPECTRUM_BANDS) {
  const hop = sampleRate / fps;
  const count = Math.max(0, Math.floor(samples.length / hop));
  const edges = bandEdges(bands, sampleRate, FFT_SIZE);
  const window = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));
  const db = new Float32Array(count * bands);
  const re = new Float64Array(FFT_SIZE), im = new Float64Array(FFT_SIZE);
  for (let f = 0; f < count; f++) {
    const center = Math.round(f * hop + hop / 2);
    const start = center - FFT_SIZE / 2;
    for (let i = 0; i < FFT_SIZE; i++) {
      const s = start + i;
      re[i] = s >= 0 && s < samples.length ? samples[s] * window[i] : 0;
      im[i] = 0;
    }
    fft(re, im);
    for (let b = 0; b < bands; b++) {
      const [from, to] = edges[b];
      let sum = 0;
      for (let k = from; k < to; k++) sum += re[k] * re[k] + im[k] * im[k];
      const rms = Math.sqrt(sum / (to - from)) / (FFT_SIZE / 4);
      db[f * bands + b] = 20 * Math.log10(rms + 1e-9);
    }
  }
  // 每个频段各自以第 98 百分位作为「满格」、向下 DYNAMIC_RANGE_DB 映射到 0：
  // 低频能量天然更大，统一归一化会让低频长期顶满、高频几乎不动。
  // 下限 -60 dB：整首几乎静音时不把噪底放大成满格。
  const frames = new Uint8Array(count * bands);
  const column = new Float32Array(count);
  for (let b = 0; b < bands; b++) {
    for (let f = 0; f < count; f++) column[f] = db[f * bands + b];
    const sorted = Float32Array.from(column).sort();
    const top = Math.max(-60, count ? sorted[Math.min(count - 1, Math.floor(count * 0.98))] : 0);
    const floor = top - DYNAMIC_RANGE_DB;
    for (let f = 0; f < count; f++) {
      // 幂次曲线压低中等电平、保留峰值，节拍起伏更明显。
      const v = Math.max(0, Math.min(1, (db[f * bands + b] - floor) / DYNAMIC_RANGE_DB)) ** 1.6;
      frames[f * bands + b] = Math.round(v * 255);
    }
  }
  return { frames, count };
}

/** s16le 字节 → Float32 样本。 */
export function pcm16ToFloat(buf) {
  const n = Math.floor(buf.length / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(i * 2) / 32768;
  return out;
}

// ---------- 服务部分 ----------

export function createSpectrumHandler({ fn, music, cfg, log }) {
  const dir = path.join(cfg.dataDir, 'spectrum');
  const inflight = new Map();
  let running = Promise.resolve();

  const fileOf = (guid) => path.join(dir, `${String(guid).replace(/[^A-Za-z0-9_-]/g, '_')}.json`);

  function prune() {
    try {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
        .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
      for (const { f } of files.slice(MAX_CACHE)) fs.rmSync(path.join(dir, f), { force: true });
    } catch { /* 目录不存在等：忽略 */ }
  }

  async function decode(guid) {
    const resp = await fn.openStream(guid, null);
    if (resp.status >= 400 || !resp.body) throw new Error(`upstream HTTP ${resp.status}`);
    const args = ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-map', '0:a:0', '-vn',
      '-t', String(MAX_SECONDS), '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 's16le', 'pipe:1'];
    const ff = spawn(cfg.ffmpeg, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const source = Readable.fromWeb(resp.body);
    const chunks = [];
    let size = 0, stderr = '';
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { ff.kill('SIGKILL'); reject(new Error('分析超时')); }, TIMEOUT_MS);
      source.on('error', () => { try { ff.stdin.destroy(); } catch { /* closed */ } });
      ff.stdin.on('error', () => { /* ffmpeg 提前退出（如 -t 截断）时的 EPIPE */ });
      source.pipe(ff.stdin);
      ff.stdout.on('data', (d) => { chunks.push(d); size += d.length; });
      ff.stderr.on('data', (d) => { stderr = (stderr + d).slice(-300); });
      ff.on('error', (err) => { clearTimeout(timer); reject(err); });
      ff.on('close', (code) => {
        clearTimeout(timer);
        try { source.destroy(); } catch { /* done */ }
        if (!size) return reject(new Error(`ffmpeg 未输出音频（code=${code}）${stderr ? `：${stderr.trim()}` : ''}`));
        resolve(Buffer.concat(chunks, size));
      });
    });
  }

  async function compute(guid) {
    const file = fileOf(guid);
    try {
      const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (cached?.v === 1) { fs.utimesSync(file, new Date(), new Date()); return cached; }
    } catch { /* 无缓存 */ }
    // 串行分析，避免多个页面同时切歌把 NAS 打满。
    const job = running.then(async () => {
      const started = Date.now();
      const pcm = pcm16ToFloat(await decode(guid));
      const { frames, count } = analyzePcm(pcm);
      const result = { v: 1, fps: SPECTRUM_FPS, bands: SPECTRUM_BANDS, count, frames: Buffer.from(frames).toString('base64') };
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(result));
      prune();
      log.info(`[spectrum] ${guid}: ${count} 帧，用时 ${Date.now() - started} ms`);
      return result;
    });
    running = job.catch(() => { });
    return await job;
  }

  return async function handle({ id }) {
    const guid = music.guidOf(id);
    if (!guid) return { statusCode: 404, body: { error: '未知歌曲' } };
    let task = inflight.get(guid);
    if (!task) {
      task = compute(guid).finally(() => inflight.delete(guid));
      inflight.set(guid, task);
    }
    try {
      return { statusCode: 200, body: await task };
    } catch (err) {
      log.warn?.(`[spectrum] ${guid}: ${err.message}`);
      return { statusCode: 502, body: { error: `频谱分析失败：${err.message}` } };
    }
  };
}
