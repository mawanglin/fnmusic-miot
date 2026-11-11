// 播放频谱动画的共享数据（设置 → 播放 →「播放频谱动画」，默认关闭）。
//
// 声音在音箱上播放，网页拿不到实际音频：频谱由 NAS 预先分析（/spectrum/:id），
// 这里按「服务端推送的播放进度 + 本地计时」估算当前时间，取对应帧给画布绘制。
// 播放栏和播放页共用同一份数据与时钟，切歌只请求一次。

import { effectScope, reactive, watch } from 'vue';
import { get } from './api';
import { state } from './store';

export interface SpectrumData { fps: number; bands: number; count: number; frames: Uint8Array }
interface SpectrumPayload { v: number; fps: number; bands: number; count: number; frames: string }

const cache = new Map<number, SpectrumData>();
const failed = new Set<number>();
const pending = new Map<number, Promise<void>>();

export const spectrum = reactive<{ songId: number | null; data: SpectrumData | null; loading: boolean }>({
  songId: null, data: null, loading: false,
});

/** 解码服务端的 base64 帧数据。 */
export function decodeFrames(base64: string): Uint8Array {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * 取 time 秒处每个频段的电平（0..1），相邻两帧线性插值。
 * 超出范围或无数据时返回全 0。
 */
export function levelsAt(data: SpectrumData, time: number, out: Float32Array): Float32Array {
  const pos = time * data.fps;
  const i = Math.floor(pos);
  if (!(i >= 0 && i < data.count)) { out.fill(0); return out; }
  const j = Math.min(data.count - 1, i + 1), t = pos - i;
  for (let b = 0; b < data.bands; b++) {
    const a = data.frames[i * data.bands + b], c = data.frames[j * data.bands + b];
    out[b] = (a + (c - a) * t) / 255;
  }
  return out;
}

// ---- 播放时钟：服务端进度只到秒、且推送有间隔，两次推送之间按本地时间外推 ----
let anchorPos = 0, anchorAt = 0;
function reanchor() {
  anchorPos = Number(state.player.position || 0);
  anchorAt = performance.now();
}
// immediate：页面打开后进度若一直没变，也要有正确的计时起点（否则起点为 0，外推时间偏差很大）。
watch(() => [state.player.position, state.player.is_playing, state.player.current_song?.id], reanchor, { immediate: true });

/** 当前估计的播放时间（秒）。 */
export function currentTime(): number {
  const duration = Number(state.player.duration || 0);
  if (!state.player.is_playing) return anchorPos;
  const speed = Number(state.player.speed || 1) || 1;
  const t = anchorPos + ((performance.now() - anchorAt) / 1000) * speed;
  return duration > 0 ? Math.min(duration, t) : t;
}

async function load(id: number) {
  if (cache.has(id) || failed.has(id)) return;
  if (pending.has(id)) return pending.get(id);
  const job = (async () => {
    try {
      const r = await get<SpectrumPayload>(`/spectrum/${id}`);
      if (r?.v !== 1 || !r.frames) throw new Error('频谱数据格式无效');
      cache.set(id, { fps: r.fps, bands: r.bands, count: r.count, frames: decodeFrames(r.frames) });
      // 只留最近几首，切回上一首不用重新请求。
      while (cache.size > 4) cache.delete(cache.keys().next().value as number);
    } catch {
      failed.add(id); // 分析失败的歌不反复请求；画布保持空白即可
    } finally { pending.delete(id); }
  })();
  pending.set(id, job);
  return job;
}

let started = false;
/**
 * 由画布组件调用；只在开关打开时请求数据。
 * 监听器放在独立的 effectScope 里：若建在组件 setup 中，播放栏一卸载（如进入设置页）
 * 监听就被 Vue 停掉，之后打开开关、切歌都不再加载数据，要刷新页面才生效。
 */
export function useSpectrumSource() {
  if (started) return spectrum;
  started = true;
  effectScope(true).run(() => watch(() => [!!state.config.spectrum_enabled, Number(state.player.current_song?.id || 0)] as const, async ([enabled, id]) => {
    spectrum.songId = id || null;
    spectrum.data = enabled && id ? cache.get(id) || null : null;
    if (!enabled || !id || spectrum.data) return;
    spectrum.loading = true;
    await load(id);
    if (spectrum.songId === id && state.config.spectrum_enabled) spectrum.data = cache.get(id) || null;
    spectrum.loading = false;
  }, { immediate: true }));
  return spectrum;
}

// ---- 配色：从左（低频）到右（高频）取色；画布与设置页预览共用 ----
export type Rgb = [number, number, number];
const PALETTES: Record<string, Rgb[]> = {
  ocean: [[14, 165, 233], [34, 211, 238], [37, 99, 235]],
  sunset: [[249, 115, 22], [244, 63, 94], [236, 72, 153]],
  aurora: [[34, 197, 94], [20, 184, 166], [59, 130, 246]],
  neon: [[236, 72, 153], [168, 85, 247], [99, 102, 241]],
};
function hslToRgb(h: number, sat: number, l: number): Rgb {
  const k = (n: number) => (n + h / 30) % 12, a = sat * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
/** t ∈ [0,1] 处的颜色；返回 null 表示用主题色。 */
export function paletteColor(style: string, t: number): Rgb | null {
  if (style === 'theme') return null;
  if (style === 'rainbow' || !PALETTES[style]) return hslToRgb(t * 285, 0.85, 0.58); // 红 → 紫
  const stops = PALETTES[style], p = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(p)), u = p - i;
  return stops[i].map((v, c) => Math.round(v + (stops[i + 1][c] - v) * u)) as Rgb;
}

