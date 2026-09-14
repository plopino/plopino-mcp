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
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
    signal,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* 非 JSON 响应（如反代错误页） */ }
  // 新建时链接在顶层，更新时在 board 里——统一取一次，调用方不必知道这个差别
  const url = data?.url || data?.board?.url;
  if (!res.ok || !url) {
    throw new Error(data?.error || `Upload failed (HTTP ${res.status})`);
  }
  return { ...data, url };
}

// 从之前返回的链接里取出展板 id。agent 手里通常只有 URL、没有 id，
// 所以更新入口收 URL 比收 id 自然。服务端仍会校验归属，猜来的 id 只会 404。
export function boardIdFromUrl(url) {
  const m = /\/b\/([A-Za-z0-9_-]+)/.exec(String(url ?? ''));
  return m ? m[1] : null;
}

// 一个 HTML 字符串 → 单文件展板。文件名固定 index.html，展板根链接才能直接渲染它。
export function filesFromHtml(html) {
  return [{ name: 'index.html', data: Buffer.from(html, 'utf8') }];
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
