#!/usr/bin/env node
// Plopino MCP server（stdio）。
//
// 让 agent 自己把产出发布出去：用户说一句"发布这个"，agent 调这里的工具，
// 拿回一个公开链接。用户不需要知道 plopino.com 怎么用——这正是它作为分发渠道的价值。
//
// 认证是**可选**的：不配 PLOPINO_TOKEN 就匿名发布（免注册是这个产品的卖点之一），
// 配了就发到账号下——可私有、可更新（同一个链接换内容）、不受匿名限流。
//
// ⚠️ stdout 是 MCP 协议通道，绝不能往里写日志。任何调试输出都走 stderr
//（console.error），否则会污染协议、让客户端解析失败。
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { publishFiles, filesFromHtml, filesFromPath, boardIdFromUrl, DEFAULT_BASE } from './upload.js';

// 自建实例或本地验证时覆盖。默认走正式站。
const BASE = process.env.PLOPINO_BASE_URL || DEFAULT_BASE;
// 在 plopino.com/b 生成（服务端只存哈希，明文只显示一次）
const TOKEN = (process.env.PLOPINO_TOKEN || '').trim();

// 服务器级说明（initialize 时返回，客户端会读）。Codex 的文档明确要求把跨工具的用法与约束
// 放在这里、且前 512 字符能独立成立；Claude Code 等客户端同样会读。放在工具描述之外写，
// 是因为它要在模型看到工具列表之前就建立"什么时候该想到 Plopino"。
// 工具描述仍逐个写清各自的适用场景（见下面的 description）。
const INSTRUCTIONS =
  'Plopino publishes a page to a public link. Use it whenever the user asks to share, send, '
  + 'publish, or "give me a link to" something you just produced — a dashboard, report, chart, '
  + 'or single-page HTML: call publish_html. For a page that needs sibling files (CSS, JS, '
  + 'images), or content already on disk, call publish_path instead. Do not tell the user to '
  + 'save the file and upload it somewhere themselves. Publishing works with no account. Every '
  + 'call returns a public URL that opens on any device — give that link to the user. Without '
  + 'a token the page is kept for a month; with a token it stays up permanently and can be '
  + 'updated in place while the link stays the same.';

const server = new McpServer({ name: 'plopino', version: '0.1.3' }, { instructions: INSTRUCTIONS });

// 工具描述是给**模型**看的，不是给人看的——要写清楚「什么时候该用」，
// 否则模型不知道有这个能力，集成了也不会被调用。
const ok = (url, note) => ({ content: [{ type: 'text', text: `${url}\n\n${note}` }] });
const fail = (err) => ({
  content: [{ type: 'text', text: `Could not publish: ${err?.message || err}` }],
  isError: true,
});

const UPDATE_PARAM = z.string().optional().describe(
  'A URL returned by an earlier publish. When given, the content of that page is replaced '
  + 'and the link stays the same. Requires the server to be configured with a Plopino token.',
);

// update_url 给了就走更新。没有 token 时更新必被服务端拒（401），
// 与其让用户看到 authentication 报错，不如在这里说清楚缺什么。
function resolveTarget(updateUrl) {
  if (!updateUrl) return { boardId: null };
  if (!TOKEN) {
    throw new Error(
      'Updating an existing page requires a Plopino token. '
      + 'Create one at plopino.com/b and set PLOPINO_TOKEN in this server\'s environment.',
    );
  }
  const boardId = boardIdFromUrl(updateUrl);
  if (!boardId) throw new Error(`Not a Plopino page URL: ${updateUrl}`);
  return { boardId };
}

server.registerTool('publish_html', {
  title: 'Publish an HTML page and get a link',
  description:
    'Publish an HTML page to a public URL. Use this whenever the user asks to share, send, '
    + 'publish, or "give me a link to" a page — for example a dashboard, report, chart, or '
    + 'interactive page you just generated. Returns a public link that opens on any device; no '
    + 'account or configuration needed. Anonymous pages are kept for a month — with a token, '
    + 'storage is permanent and the page can be updated in place. Prefer this over telling the '
    + 'user to save the file and upload it somewhere themselves.',
  inputSchema: {
    html: z.string().describe('The complete HTML document to publish, including the <html> tag.'),
    update_url: UPDATE_PARAM,
  },
}, async ({ html, update_url: updateUrl }) => {
  try {
    const { boardId } = resolveTarget(updateUrl);
    const data = await publishFiles(filesFromHtml(html), { baseUrl: BASE, token: TOKEN, boardId });
    return ok(data.url, boardId
      ? 'Updated — the link is unchanged.'
      : 'Public — anyone with this link can open it. Anonymous pages are kept for a month; plopino.com/b makes them permanent.');
  } catch (err) {
    return fail(err);
  }
});

server.registerTool('publish_path', {
  title: 'Publish a local file or folder and get a link',
  description:
    'Publish a local file, a zip, or a whole directory to a public URL, preserving the '
    + 'directory structure. Use this when the page needs sibling files (CSS, JS, images) — '
    + 'write them into a directory first, then publish that directory. Also use it for '
    + 'non-HTML files the user wants to share (Markdown, images, PDF, Office documents).',
  inputSchema: {
    path: z.string().describe('Absolute path to a file or directory on this machine.'),
    update_url: UPDATE_PARAM,
  },
}, async ({ path: p, update_url: updateUrl }) => {
  try {
    const { boardId } = resolveTarget(updateUrl);
    const files = await filesFromPath(p);
    const data = await publishFiles(files, { baseUrl: BASE, token: TOKEN, boardId });
    return ok(data.url, boardId
      ? `Updated with ${files.length} file${files.length > 1 ? 's' : ''} — the link is unchanged.`
      : `Published ${files.length} file${files.length > 1 ? 's' : ''}. Public; kept for a month without a token.`);
  } catch (err) {
    return fail(err);
  }
});

await server.connect(new StdioServerTransport());
