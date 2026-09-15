#!/usr/bin/env node
// 发布到 Smithery：PUT /servers/{qualifiedName}/releases（multipart: payload + bundle）。
//
// ⚠️ 为什么不用 `smithery mcp publish`：CLI 发出来的 stdio release 不带 serverCard，
// 而 Smithery 的 stdio 流水线**不做工具内省**（release 日志只有 bundle uploaded /
// deployment successful 两条，没有任何 scan 阶段）——结果是服务器页面上 tools 恒为
// null、质量分里 Capability Quality 记 0/40、Descriptions 显示 "0/0"，而这一切
// 发布日志里都显示 SUCCESS，从外面完全看不出来。
//
// serverCard 是官方文档里「扫描无法完成时手动提供元数据」的出口（见
// docs/build/publish.md 的 Static Server Card 一节），API 层是 StdioDeployPayload
// 的可选字段。带上它之后质量分从 60 → 100。
//
// 用法：SMITHERY_API_KEY=smry_xxx node mcpb/publish-smithery.mjs
// key 在 smithery.ai/console/api-keys 生成；也可用 `npx smithery auth token --full`。
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const QUALIFIED = process.env.SMITHERY_SERVER || 'plopino/plopino';
const KEY = process.env.SMITHERY_API_KEY;
const BUNDLE = process.env.BUNDLE || path.join(DIR, '..', 'plopino.mcpb');

if (!KEY) {
  console.error('缺 SMITHERY_API_KEY。在 smithery.ai/console/api-keys 生成，或跑 `npx smithery auth token --full`。');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(path.join(DIR, '..', 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const card = JSON.parse(readFileSync(path.join(DIR, 'server-card.json'), 'utf8'));

// 版本号以 package.json 为准，顺手覆盖卡片里的——三处漂移是最典型的发布事故
card.serverInfo.version = pkg.version;
if (manifest.version !== pkg.version) {
  console.error(`manifest.json 版本 ${manifest.version} 与 package.json ${pkg.version} 不一致，先修`);
  process.exit(1);
}

const payload = {
  type: 'stdio',
  runtime: 'node',
  configSchema: {
    type: 'object',
    required: [],
    properties: {
      token: {
        type: 'string',
        title: 'Plopino token (optional)',
        'x-order': 0,
        description: manifest.user_config?.token?.description ?? '',
      },
    },
  },
  serverCard: card,
};

const form = new FormData();
form.append('payload', JSON.stringify(payload));
form.append('bundle', new Blob([readFileSync(BUNDLE)]), 'server.mcpb');

const url = `https://api.smithery.ai/servers/${encodeURIComponent(QUALIFIED)}/releases`;
console.log(`→ PUT ${url}（bundle ${(readFileSync(BUNDLE).length / 1048576).toFixed(1)}MB, v${pkg.version}）`);
const res = await fetch(url, { method: 'PUT', headers: { Authorization: `Bearer ${KEY}` }, body: form });
const text = await res.text();
console.log(res.status, text.slice(0, 400));
if (!res.ok) process.exit(1);
console.log('已提交。部署约 1-2 分钟，之后核对：');
console.log(`  curl -s https://api.smithery.ai/servers/${encodeURIComponent(QUALIFIED)} | head -c 400`);
