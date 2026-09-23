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
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { publishFiles, filesFromContent, filesFromPath, boardIdFromUrl, DEFAULT_BASE } from './upload.js';
import {
  SERVER_VERSION, INSTRUCTIONS, TOOL_ANNOTATIONS, TOOLS, TOKEN_HELP,
} from './tool-defs.js';

// 自建实例或本地验证时覆盖。默认走正式站。
const BASE = process.env.PLOPINO_BASE_URL || DEFAULT_BASE;
// 在 plopino.com/b 生成（服务端只存哈希，明文只显示一次）
const TOKEN = (process.env.PLOPINO_TOKEN || '').trim();

const server = new McpServer({ name: 'plopino', version: SERVER_VERSION }, { instructions: INSTRUCTIONS });

// 工具描述是给**模型**看的，不是给人看的——要写清楚「什么时候该用」，
// 否则模型不知道有这个能力，集成了也不会被调用。
// 返回值同时给两条：content 是给人读的文本，structuredContent 是按 outputSchema
// 声明的结构化结果——agent 不必正则解析那段文本就能拿到链接。
const ok = (url, note, claimUrl) => ({
  content: [{ type: 'text', text: `${url}\n\n${note}${claimUrl ? `\n\nPrivate claim link for the publisher only (never append it to the public share URL): ${claimUrl}` : ''}` }],
  structuredContent: { url, note, ...(claimUrl ? { claimUrl } : {}) },
});
const fail = (err) => ({
  content: [{ type: 'text', text: `Could not publish: ${err?.message || err}` }],
  isError: true,
});

// 输出模式：两个工具返回同一种形状（链接 + 状态说明）。声明它不是形式主义——
// 客户端能据此做结构化消费，目录站（如 Smithery）也把「Output schemas」单列为一项质量分。
const OUTPUT_SCHEMA = z.object({
  url: z.string().describe('Public link to the published page — give this to the user.'),
  note: z.string().describe(
    'Human-readable status: created vs updated, and how long the page is kept.'),
  claimUrl: z.string().optional().describe('Private browser claim link for the publisher only. Never give it to page viewers or append it to the public URL.'),
});

const UPDATE_PARAM = z.string().optional().describe(TOOLS.publish_page.params.update_url);

// update_url 给了就走更新。没有 token 时更新必被服务端拒（401），
// 与其让用户看到 authentication 报错，不如在这里说清楚缺什么。
function resolveTarget(updateUrl) {
  if (!updateUrl) return { boardId: null };
  if (!TOKEN) {
    throw new Error('Updating an existing page requires a Plopino token. ' + TOKEN_HELP);
  }
  const boardId = boardIdFromUrl(updateUrl);
  if (!boardId) throw new Error(`Not a Plopino page URL: ${updateUrl}`);
  return { boardId };
}

server.registerTool('publish_page', {
  title: TOOLS.publish_page.title,
  description: TOOLS.publish_page.description,
  inputSchema: z.object({
    content: z.string().describe(TOOLS.publish_page.params.content),
    filename: z.string().optional().describe(TOOLS.publish_page.params.filename),
    update_url: UPDATE_PARAM,
  }),
  annotations: TOOL_ANNOTATIONS,
  outputSchema: OUTPUT_SCHEMA,
}, async ({ content, filename, update_url: updateUrl }) => {
  try {
    const { boardId } = resolveTarget(updateUrl);
    const files = filesFromContent(content, filename);
    const data = await publishFiles(files, { baseUrl: BASE, token: TOKEN, boardId });
    // 非默认文件名时告诉模型它叫什么：链接里看不出文件名，而"这是 report.md 不是页面"会影响后续判断
    const as = files[0].name === 'index.html' ? '' : ` Published as ${files[0].name}.`;
    const owned = data.anonymous === false || !!data.meta?.owner || !!TOKEN;
    return ok(data.url, boardId
      ? 'Updated — the link is unchanged.'
      : `Public — anyone with this link can open it.${as} ${owned ? 'Published to your account.' : 'Kept for a month. Open the private claim link in a browser to keep this upload, or configure PLOPINO_TOKEN before future uploads.'}`,
      !boardId && !owned ? data.claimUrl : undefined);
  } catch (err) {
    return fail(err);
  }
});

server.registerTool('publish_path', {
  title: TOOLS.publish_path.title,
  description: TOOLS.publish_path.description,
  inputSchema: z.object({
    path: z.string().describe(TOOLS.publish_path.params.path),
    update_url: UPDATE_PARAM,
  }),
  annotations: TOOL_ANNOTATIONS,
  outputSchema: OUTPUT_SCHEMA,
}, async ({ path: p, update_url: updateUrl }) => {
  try {
    const { boardId } = resolveTarget(updateUrl);
    const files = await filesFromPath(p);
    const data = await publishFiles(files, { baseUrl: BASE, token: TOKEN, boardId });
    const owned = data.anonymous === false || !!data.meta?.owner || !!TOKEN;
    return ok(data.url, boardId
      ? `Updated with ${files.length} file${files.length > 1 ? 's' : ''} — the link is unchanged.`
      : `Published ${files.length} file${files.length > 1 ? 's' : ''}. ${owned ? 'Published to your account.' : 'Public; kept for a month. Open the private claim link in a browser to keep this upload.'}`,
      !boardId && !owned ? data.claimUrl : undefined);
  } catch (err) {
    return fail(err);
  }
});

await server.connect(new StdioServerTransport());
process.stdin.resume();
await new Promise((resolve) => {
  process.stdin.on('end', resolve);
  process.stdin.on('close', resolve);
});
