import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePcm, bandEdges, pcm16ToFloat, SPECTRUM_BANDS, SPECTRUM_FPS } from '../adapter/spectrum.mjs';

const RATE = 22050;
const tone = (hz, seconds, amp = 0.5) => Float32Array.from({ length: RATE * seconds }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / RATE));
const binHz = RATE / 2048;
const bandOf = (hz) => bandEdges().findIndex(([from, to]) => hz / binHz >= from && hz / binHz < to);

test('频段划分：24 段首尾相接、逐段递增', () => {
  const edges = bandEdges();
  assert.equal(edges.length, SPECTRUM_BANDS);
  for (let i = 1; i < edges.length; i++) assert.equal(edges[i][0], edges[i - 1][1]);
  assert.ok(edges.every(([a, b]) => b > a));
});

test('正弦波的能量落在对应频段：440Hz 偏左、5kHz 偏右', () => {
  for (const hz of [440, 5000]) {
    const { frames, count } = analyzePcm(tone(hz, 2));
    assert.equal(count, 2 * SPECTRUM_FPS);
    const mid = Math.floor(count / 2) * SPECTRUM_BANDS;
    const row = Array.from(frames.slice(mid, mid + SPECTRUM_BANDS));
    const peak = row.indexOf(Math.max(...row));
    assert.ok(Math.abs(peak - bandOf(hz)) <= 1, `${hz}Hz 峰值在第 ${peak} 段，期望约第 ${bandOf(hz)} 段`);
    assert.ok(row[peak] > 200, '峰值应接近满格');
  }
});

test('静音为 0，帧数按 20 帧/秒；s16le 转换正确', () => {
  const { frames, count } = analyzePcm(new Float32Array(RATE));
  assert.equal(count, 20);
  assert.ok(frames.every((v) => v === 0 || v < 5));
  const buf = Buffer.alloc(4); buf.writeInt16LE(16384, 0); buf.writeInt16LE(-32768, 2);
  assert.deepEqual(Array.from(pcm16ToFloat(buf)), [0.5, -1]);
});
