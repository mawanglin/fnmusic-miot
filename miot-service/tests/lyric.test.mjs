import test from 'node:test';
import assert from 'node:assert/strict';
import { lyricTextOf } from '../adapter/stream.mjs';

// 结构取自 NAS 上飞牛官方 /lyric/list 的实际返回（参数 trackGUID）。
test('官方 /lyric/list：优先取 preferred 指向的歌词', () => {
  const data = { list: [
    { guid: 'a', content: '[00:01.00]内嵌歌词', source: 1 },
    { guid: 'b', content: '[00:01.00]外挂 LRC', source: 2 },
  ], preferred: 'b' };
  assert.equal(lyricTextOf(data), '[00:01.00]外挂 LRC');
});

test('preferred 缺失或为空内容时，退回第一份有内容的歌词', () => {
  assert.equal(lyricTextOf({ list: [{ guid: 'a', content: '  ' }, { guid: 'b', content: 'x' }], preferred: 'a' }), 'x');
  assert.equal(lyricTextOf({ list: [], preferred: '' }), '');
});

test('fnmusic 适配器按官方前端用 trackGUID 调用歌词接口', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../adapter/fnmusic.mjs', import.meta.url), 'utf8');
  assert.match(src, /apiCall\('GET', '\/lyric\/list', \{ trackGUID: guid \}\)/);
});
