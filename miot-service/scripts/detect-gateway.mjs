#!/usr/bin/env node
// 安装脚本用：探测飞牛音乐的 HTTP 网关端口并验证。
// 成功：stdout 输出端口号（仅数字），退出 0；找不到：无输出，退出 1。
// 诊断信息写 stderr。用法：node detect-gateway.mjs [host]
import { detect } from '../host/gateway.mjs';

const host = process.argv[2] || '127.0.0.1';
const hit = await detect({ host });
if (hit) {
  console.error(`[detect-gateway] ${hit.baseUrl}（${hit.source}）`);
  console.log(String(hit.port));
  process.exit(0);
}
console.error('[detect-gateway] 没有找到飞牛音乐的 HTTP 网关');
process.exit(1);
