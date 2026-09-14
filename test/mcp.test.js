'use strict';

// MCP 包的两层测试：
//   1) 纯函数层 —— 路径展开的边界（空目录、不存在、符号链接、目录结构）
//   2) 协议层 —— 真的把服务拉起来说 JSON-RPC，确认握手与工具列表可用
// 不测 tools/call 的成功路径：那要一个跑着的 Plopino 实例，属于集成测试，
// 用手动驱动脚本验证（见 README），不放进单测。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { filesFromHtml, filesFromPath, publishFiles, boardIdFromUrl } from '../upload.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.join(DIR, '..', 'index.js');

const tmp = () => mkdtemp(path.join(tmpdir(), 'plopino-mcp-'));

test('filesFromHtml：固定命名为 index.html，展板根链接才能直接渲染它', () => {
  const [f] = filesFromHtml('<h1>hi</h1>');
  assert.equal(f.name, 'index.html');
  assert.equal(f.data.toString('utf8'), '<h1>hi</h1>');
});

test('filesFromPath：单文件取 basename', async (t) => {
  const d = await tmp();
  t.after(() => rm(d, { recursive: true, force: true }));
  const f = path.join(d, 'report.html');
  await writeFile(f, '<h1>r</h1>');

  const out = await filesFromPath(f);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'report.html', '单文件只留文件名，不带目录');
});

test('filesFromPath：目录递归展开，name 是相对路径（接口按它还原结构）', async (t) => {
  const d = await tmp();
  t.after(() => rm(d, { recursive: true, force: true }));
  await writeFile(path.join(d, 'index.html'), 'x');
  await mkdir(path.join(d, 'assets', 'img'), { recursive: true });
  await writeFile(path.join(d, 'assets', 's.css'), 'y');
  await writeFile(path.join(d, 'assets', 'img', 'a.png'), 'z');

  const names = (await filesFromPath(d)).map((f) => f.name).sort();
  assert.deepEqual(names, ['assets/img/a.png', 'assets/s.css', 'index.html']);
});

test('filesFromPath：符号链接跳过（跟随可能绕出目录树）', async (t) => {
  const d = await tmp();
  const outside = await tmp();
  t.after(() => rm(d, { recursive: true, force: true }));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(path.join(outside, 'secret.txt'), 'should not be published');
  await symlink(path.join(outside, 'secret.txt'), path.join(d, 'link.txt'));
  await writeFile(path.join(d, 'real.txt'), 'ok');

  const names = (await filesFromPath(d)).map((f) => f.name);
  assert.deepEqual(names, ['real.txt'], '符号链接不得被跟随，否则会把目录外的文件传上去');
});

test('filesFromPath：空目录与不存在的路径都给出可诊断的错误', async (t) => {
  const d = await tmp();
  t.after(() => rm(d, { recursive: true, force: true }));

  await assert.rejects(() => filesFromPath(d), /empty/i);
  await assert.rejects(() => filesFromPath(path.join(d, 'nope')), /ENOENT/);
});

// ── 协议层：真的把服务拉起来说 JSON-RPC ──────────────────────────────
test('MCP 协议：握手成功、暴露两个工具、stdout 只有 JSON-RPC', async (t) => {
  // 根目录的 `npm test` 也会扫到这里，但根项目的依赖里没有 MCP SDK。
  // 缺依赖时跳过而不是失败——否则任何人 clone 下来跑根测试都会看到一片红，
  // 而那不是他的问题。
  try {
    await import('@modelcontextprotocol/sdk/server/mcp.js');
  } catch {
    t.skip('未安装 MCP SDK（cd mcp && npm install），跳过协议测试');
    return;
  }

  const child = spawn(process.execPath, [ENTRY], { stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => child.kill());

  const lines = [];
  let raw = '';
  let leftover = '';
  child.stdout.on('data', (c) => {
    raw += c;
    let i;
    while ((i = raw.indexOf('\n')) >= 0) {
      const line = raw.slice(0, i).trim();
      raw = raw.slice(i + 1);
      if (line) lines.push(line);
    }
  });

  const waitFor = (id) => new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      const hit = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } })
        .find((m) => m && m.id === id);
      if (hit) return resolve(hit);
      if (Date.now() - t0 > 5000) return reject(new Error(`等 id=${id} 超时`));
      setTimeout(tick, 20);
    };
    tick();
  });

  child.stdin.write(JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
  }) + '\n');
  const init = await waitFor(1);
  assert.equal(init.result.serverInfo.name, 'plopino');

  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
  const list = await waitFor(2);
  const names = list.result.tools.map((x) => x.name).sort();
  assert.deepEqual(names, ['publish_html', 'publish_path']);

  // 每个工具都要有给模型看的描述——没有描述，模型不会知道什么时候该调它
  for (const tool of list.result.tools) {
    assert.ok(tool.description && tool.description.length > 30, `${tool.name} 缺描述`);
    assert.ok(tool.inputSchema, `${tool.name} 缺 inputSchema`);
  }

  // stdout 是 MCP 协议通道：任何非 JSON 的输出都会让客户端解析失败
  for (const l of lines) {
    assert.doesNotThrow(() => JSON.parse(l), `stdout 混入了非 JSON 内容: ${l.slice(0, 80)}`);
  }
});

test('boardIdFromUrl：从链接里取展板 id（agent 手里通常只有 URL）', () => {
  assert.equal(boardIdFromUrl('https://plopino.com/b/I7GXkAhZKpPB/'), 'I7GXkAhZKpPB');
  assert.equal(boardIdFromUrl('http://127.0.0.1:8787/b/abc-123'), 'abc-123');
  assert.equal(boardIdFromUrl('https://plopino.com/b/x/notes.md'), 'x');
  assert.equal(boardIdFromUrl('https://example.com/not-plopino'), null);
  assert.equal(boardIdFromUrl(''), null);
  assert.equal(boardIdFromUrl(undefined), null);
});

test('publishFiles：有 token 才发 Authorization，更新走 board 子路由', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, headers: init.headers, method: init.method });
    return { ok: true, status: 200, text: async () => JSON.stringify({ url: 'https://plopino.com/b/x/' }) };
  };
  const files = filesFromHtml('<h1>hi</h1>');

  // 匿名：不带 Authorization —— "不用注册"是卖点，不能被集成悄悄改成必须登录
  await publishFiles(files, { baseUrl: 'https://plopino.com', fetchImpl: fakeFetch });
  assert.equal(calls[0].url, 'https://plopino.com/api/boards/upload');
  assert.equal(calls[0].headers, undefined, '无 token 时不该带 Authorization');

  // 认证新建
  await publishFiles(files, { baseUrl: 'https://plopino.com/', token: 'plp_x', fetchImpl: fakeFetch });
  assert.equal(calls[1].headers.Authorization, 'Bearer plp_x');
  assert.equal(calls[1].url, 'https://plopino.com/api/boards/upload', 'base 末尾斜杠要被收掉');

  // 更新：走 board 子路由，链接不变
  await publishFiles(files, { baseUrl: 'https://plopino.com', token: 'plp_x', boardId: 'abc-1', fetchImpl: fakeFetch });
  assert.equal(calls[2].url, 'https://plopino.com/api/boards/abc-1/upload');
});

test('publishFiles：更新接口把链接放在 board 里，取值要兼容两种形状', async () => {
  const mk = (body) => async () => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
  const files = filesFromHtml('<h1>hi</h1>');

  const created = await publishFiles(files, { fetchImpl: mk({ url: 'https://p/b/new/' }) });
  assert.equal(created.url, 'https://p/b/new/');

  // 更新响应是 { ok, board: { url } }，没有顶层 url
  const updated = await publishFiles(files, { fetchImpl: mk({ ok: true, board: { url: 'https://p/b/old/' } }) });
  assert.equal(updated.url, 'https://p/b/old/', '更新时链接从 board 里取，且应与原来相同');
});

test('版本号只有一处真相：package.json 与 index.js 必须一致', async () => {
  // 客户端在握手里读到的是 index.js 里那个字面量，npm 上的是 package.json 那个。
  // 两者漂移的话，用户报告"我装的是 0.1.2"而服务自称 0.1.1，排查时会误导人。
  const pkg = JSON.parse(await readFile(path.join(DIR, '..', 'package.json'), 'utf8'));
  const src = await readFile(ENTRY, 'utf8');
  const m = src.match(/new McpServer\(\{ name: 'plopino', version: '([^']+)' \}/);
  assert.ok(m, 'index.js 里的 McpServer 版本字面量没找到（改过写法就同步改这里）');
  assert.equal(m[1], pkg.version, 'index.js 与 package.json 的版本号不一致');
});

test('server.json 与 package.json 必须互相对得上（官方注册表按这个验归属）', async () => {
  // 注册表拿「已发布的那个 npm 包里的 package.json」跟提交的 server.json 比对：
  // mcpName 要等于 server.json 的 name，两边的版本也要等于包版本。对不上时
  // publish 会失败——但最难查的是「发出去了却验不过」，那样目录里就是一条坏记录。
  const pkg = JSON.parse(await readFile(path.join(DIR, '..', 'package.json'), 'utf8'));
  const s = JSON.parse(await readFile(path.join(DIR, '..', 'server.json'), 'utf8'));
  assert.equal(s.name, pkg.mcpName, 'server.json 的 name 与 package.json 的 mcpName 不一致');
  assert.equal(s.version, pkg.version, 'server.json 与 package.json 的版本号不一致');
  assert.equal(s.packages.length, 1, '只发 npm 一个包，多出来的来源要一并核对');
  const [p] = s.packages;
  assert.equal(p.identifier, pkg.name, 'server.json 里的包名与实际 npm 包名不一致');
  assert.equal(p.version, pkg.version, 'server.json 指向的包版本不是当前版本');
  assert.equal(p.transport.type, 'stdio', '传输方式变了要同步改（客户端按这个生成启动命令）');
  // PLOPINO_TOKEN 是可选的：标成必填会让目录以为不配 key 就用不了，正对着产品主张
  assert.equal(p.environmentVariables, undefined, '不要声明 environmentVariables，匿名发布不需要配置');
});

test('publishFiles：429 的错误要带出自助路径（agent 照着能走完，而不是「明天再试」）', async () => {
  // 托管部署（Glama 一键部署）共享出口 IP，匿名 429 是它们的常态而非边缘情况。
  // 服务端文案只说「次数用完」；模型读到出路（去哪拿 token、设哪个变量）才能自救。
  const files = filesFromHtml('<h1>hi</h1>');
  const mk429 = async () => ({
    ok: false, status: 429,
    text: async () => JSON.stringify({ error: 'Daily upload quota used up (1 per day).' }),
  });
  await assert.rejects(
    publishFiles(files, { fetchImpl: mk429 }),
    (err) => {
      assert.match(err.message, /Daily upload quota used up/);
      assert.match(err.message, /plopino\.com\/b/, '要指到 token 的获取处');
      assert.match(err.message, /PLOPINO_TOKEN/, '要指到要设的环境变量');
      return true;
    },
  );
});

test('dist 的单文件发行版与源码同步（陈旧的分发件比没有更糟）', async (t) => {
  // 用户从 plopino.com 下载的就是这个文件，它一旦没跟上源码，发出去的是旧行为，
  // 而且从外部完全看不出来。所以每次跑测试都重新构建比对。
  let esbuild;
  try { esbuild = await import('esbuild'); } catch { t.skip('未安装 esbuild（cd mcp && npm install），跳过'); return; }

  const out = path.join(DIR, '..', 'dist', 'plopino-mcp.mjs');
  // absWorkingDir 必须钉死：esbuild 会把每个模块的路径写成**相对于 cwd** 的注释，
  // 从仓库根目录构建出来的产物与从 mcp/ 构建的逐字节不同（`mcp/index.js` vs `index.js`）。
  // 不钉死的话这个测试会因为"在哪个目录跑"而时红时绿。
  const built = await esbuild.build({
    absWorkingDir: path.join(DIR, '..'),
    entryPoints: ['index.js'], bundle: true, platform: 'node', format: 'esm', target: 'node18', write: false,
  });
  const fresh = built.outputFiles[0].text;
  const onDisk = await readFile(out, 'utf8').catch(() => null);
  assert.ok(onDisk, 'dist/plopino-mcp.mjs 不存在 —— 跑 npm run build');
  assert.equal(onDisk, fresh, 'dist/plopino-mcp.mjs 与源码不一致 —— 跑 npm run build');

  // 自包含：用户那边没有 node_modules，任何外部 import 都会让它在对方机器上崩
  assert.equal(/^import .* from '[^.]/m.test(onDisk), false, '发行版不得残留外部 import');
  assert.ok(onDisk.startsWith('#!/usr/bin/env node'), '保留 shebang');
});
