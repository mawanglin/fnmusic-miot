<script setup lang="ts">
// 频谱画布：播放栏（variant=bar）和播放页（variant=stage）共用。
// 只在「开关打开 + 有数据 + 正在播放 + 页面可见」时跑动画；暂停后柱子平滑回落再停。
// 系统开启「减少动态效果」时不绘制。
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { currentTime, levelsAt, useSpectrumSource } from '../spectrum';
import { state } from '../store';

const props = withDefaults(defineProps<{ variant?: 'bar' | 'stage' }>(), { variant: 'bar' });
const canvas = ref<HTMLCanvasElement | null>(null);
const source = useSpectrumSource();
const enabled = computed(() => !!state.config.spectrum_enabled && !!source.data);

const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)');
let raf = 0, width = 0, height = 0, dpr = 1, color = '#6750a4', colorAge = 0;
let levels = new Float32Array(0), shown = new Float32Array(0);
let resizeObserver: ResizeObserver | null = null;

function readColor() {
  const el = canvas.value;
  if (!el) return;
  color = getComputedStyle(el).getPropertyValue('--md-primary').trim() || color;
}
function resize() {
  const el = canvas.value;
  if (!el) return;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  width = el.clientWidth; height = el.clientHeight;
  el.width = Math.max(1, Math.round(width * dpr));
  el.height = Math.max(1, Math.round(height * dpr));
  draw();
}

function draw() {
  const el = canvas.value, data = source.data;
  const ctx = el?.getContext('2d');
  if (!el || !ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (!data || !width || !height) return;
  const stage = props.variant === 'stage';
  const gap = stage ? 6 : 4;
  const barCount = Math.max(8, Math.min(stage ? 96 : 120, Math.floor(width / (stage ? 18 : 12))));
  if (shown.length !== barCount) shown = new Float32Array(barCount);
  if (levels.length !== data.bands) levels = new Float32Array(data.bands);
  const playing = !!state.player.is_playing;
  if (playing) levelsAt(data, currentTime(), levels); else levels.fill(0);
  const barWidth = (width - gap * (barCount - 1)) / barCount;
  const maxHeight = height * (stage ? 0.9 : 0.86);
  // 自下而上渐隐：柱顶淡出，不和上方文字抢视觉。
  const gradient = ctx.createLinearGradient(0, height - maxHeight, 0, height);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(stage ? 0.45 : 0.3, 'rgba(0,0,0,1)');
  ctx.fillStyle = color;
  ctx.globalAlpha = stage ? 0.26 : 0.18;
  let moving = false;
  for (let i = 0; i < barCount; i++) {
    // 柱子在频段之间插值：左低频、右高频，数量随宽度变化。
    const p = (i / Math.max(1, barCount - 1)) * (data.bands - 1);
    const a = Math.floor(p), b = Math.min(data.bands - 1, a + 1);
    const target = levels[a] + (levels[b] - levels[a]) * (p - a);
    // 上升快、回落慢，避免闪烁。
    const k = target > shown[i] ? 0.55 : 0.18;
    shown[i] += (target - shown[i]) * k;
    if (shown[i] > 0.004) moving = true;
    const h = Math.max(stage ? 3 : 2, shown[i] * maxHeight);
    const x = i * (barWidth + gap);
    const r = Math.min(barWidth / 2, stage ? 4 : 3);
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, height - h, barWidth, h, [r, r, 0, 0]) : ctx.rect(x, height - h, barWidth, h);
    ctx.fill();
  }
  // 用渐变作遮罩：只保留柱子与渐变重叠的部分。
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
  return moving || playing;
}

function frame() {
  raf = 0;
  if (!shouldRun()) { draw(); return; }
  if (++colorAge > 120) { colorAge = 0; readColor(); }
  const keep = draw();
  if (keep && !document.hidden) raf = requestAnimationFrame(frame);
}
function shouldRun() { return enabled.value && !(reduceMotion && reduceMotion.matches); }
function kick() { if (!raf && shouldRun()) raf = requestAnimationFrame(frame); }

watch(() => [enabled.value, state.player.is_playing, state.player.position, source.data], () => { readColor(); kick(); if (!enabled.value) draw(); });
const onVisibility = () => { if (!document.hidden) kick(); };

onMounted(() => {
  readColor();
  resizeObserver = new ResizeObserver(resize);
  if (canvas.value) resizeObserver.observe(canvas.value);
  resize();
  document.addEventListener('visibilitychange', onVisibility);
  kick();
});
onUnmounted(() => {
  if (raf) cancelAnimationFrame(raf);
  resizeObserver?.disconnect();
  document.removeEventListener('visibilitychange', onVisibility);
});
</script>

<template>
  <canvas v-show="enabled" ref="canvas" class="spectrum-canvas" :class="`spectrum-canvas-${variant}`" aria-hidden="true"></canvas>
</template>

<style>
.spectrum-canvas { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; pointer-events: none; display: block; }
.spectrum-canvas-bar { top: 0; height: 100%; z-index: -1; }
.spectrum-canvas-stage { height: 36%; z-index: 0; }
</style>
