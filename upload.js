// 与 Plopino 上传接口的对接。只用 Node 内置的 fetch / FormData / Blob（Node 18+ 自带），
// 所以这个包除了 MCP SDK 之外没有别的运行时依赖。

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_BASE = 'https://plopino.com';

// 上传一组文件，返回展板 JSON（含链接）。
// files: [{ name, data }]，name 是**相对路径**——接口按它还原目录结构，
// 所以目录上传不需要先打包成 zip。
//
// token 给了就走认证（展板归到账号下，可私有、可更新、不受匿名限流）；
// 不给就匿名发布。**认证是可选的**——"不用注册"是这个产品的卖点之一，
// 不能因为接了 MCP 就把它变成必须品。
// boardId 给了就是**更新已有展板**（链接不变），只有认证用户能做。
export async function publishFiles(files, { baseUrl = DEFAULT_BASE, token = '', boardId = null, fetchImpl = fetch, signal } = {}) {
  const form = new FormData();
  for (const f of files) form.append('file', new Blob([f.data]), f.name);
  const route = boardId
    ? `/api/boards/${encodeURIComponent(boardId)}/upload`
    : '/api/boards/upload';
  const res = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}${route}`, {
    method: 'POST',
    headers: {
      // 自报家门：服务端按这个 UA 给 Umami 的 upload 事件打 source=mcp 标签，
      // MCP 渠道的效果才和网页上传分得开。node 的默认 UA 是 "node"，认不出
      // 也名不正——不能把别人的 Node 程序误标成我们。
      'User-Agent': 'plopino-mcp',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form,
    signal,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* 非 JSON 响应（如反代错误页） */ }
  // 新建时链接在顶层，更新时在 board 里——统一取一次，调用方不必知道这个差别
  const url = data?.url || data?.board?.url;
  if (!res.ok || !url) {
    let msg = data?.error || `Upload failed (HTTP ${res.status})`;
    // 429 的服务端原文只说「次数用完」，没说出路。匿名配额按 IP 计，而托管部署
    // （Glama 一键部署那类）所有用户共享同一个出口 IP——撞上时 agent 需要的是
    // 自助路径而不是「明天再试」。这段追加是给模型读的：它照着就能带用户走完。
    if (res.status === 429) {
      msg += ' Anonymous publishing is rate-limited per IP, and hosted deployments share one IP. '
        + 'Fix: create a token at plopino.com/b and set PLOPINO_TOKEN — that removes the rate '
        + 'limit and also enables private boards and in-place updates.';
    }
    throw new Error(msg);
  }
  return { ...data, url };
}

// 从之前返回的链接里取出展板 id。agent 手里通常只有 URL、没有 id，
// 所以更新入口收 URL 比收 id 自然。服务端仍会校验归属，猜来的 id 只会 404。
export function boardIdFromUrl(url) {
  const m = /\/b\/([A-Za-z0-9_-]+)/.exec(String(url ?? ''));
  return m ? m[1] : null;
}

// 文件名 → 上传接口认的相对路径。接口按 name 还原目录结构，绝对路径与 `..` 会被服务端
// 拒；这里先拦一道，好让模型拿到一句能照着改的错，而不是一个 400。
// 返回 null 表示"没给"（调用方套默认值），空串与纯空白同此处理。
export function normalizeFilename(filename) {
  const raw = String(filename ?? '').trim();
  if (!raw) return null;
  // Windows 风格的写进来的分隔符当路径分隔符看待，不当作文件名里合法的字符
  const name = raw.replace(/\\/g, '/');
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) {
    throw new Error(`filename must be a relative path, not an absolute one: ${filename}`);
  }
  const parts = name.split('/');
  if (parts.some((p) => p === '' || p === '.' || p === '..')) {
    throw new Error(`filename must be a plain relative path without "." or ".." segments: ${filename}`);
  }
  return name;
}

// 一段内容 + 文件名 → 单文件展板。默认 index.html：展板根链接才能直接渲染它。
// 给别的名字（report.md、data.csv…）就走服务端按扩展名的渲染管线，根链接直出那份文档。
export function filesFromContent(content, filename) {
  return [{ name: normalizeFilename(filename) ?? 'index.html', data: Buffer.from(content, 'utf8') }];
}

// 本地路径 → 文件列表。目录递归展开，name 取相对路径。
export async function filesFromPath(input) {
  const abs = path.resolve(input);
  const st = await stat(abs); // 路径不存在时抛出原始错误，比"上传失败"可诊断
  if (st.isFile()) return [{ name: path.basename(abs), data: await readFile(abs) }];
  if (!st.isDirectory()) throw new Error(`Not a file or directory: ${input}`);

  const out = [];
  async function walk(dir, prefix) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full, rel);
      // 符号链接直接跳过：跟随可能绕出目录树，上传过去也没有意义
      else if (e.isFile()) out.push({ name: rel, data: await readFile(full) });
    }
  }
  await walk(abs, '');
  if (!out.length) throw new Error(`Directory is empty: ${input}`);
  return out;
}
