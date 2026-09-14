# plopino

MCP server for [Plopino](https://plopino.com) — lets an AI agent publish what it just built
and hand back a public link, without the user touching a browser.

```
agent writes index.html — or has a report / spreadsheet / markdown on disk
   ↓  publish_html / publish_path
https://plopino.com/b/xxxxxxxx/
```

Documents are first-class: Word (doc/docx), Excel (xls/xlsx), PowerPoint and Markdown
render as readable pages, code and data files get syntax-highlighted previews, and images
and video display inline. The recipient opens a link; they never download a file.

## Tools

| Tool | Use it when |
|---|---|
| `publish_html` | You have the page as a string. The most direct path for generated HTML. |
| `publish_path` | The page needs sibling files (CSS, JS, images), or you are sharing something that is already on disk — including any document. Point it at a directory and the structure is preserved — no need to zip first. |

Both take an optional `update_url`: pass a link returned by an earlier publish and that page's
content is replaced **while the link stays the same**. This needs a token (see below).

Publishing is **anonymous by default**: no account, no configuration, no API key. The returned
link is public; without a token the page is kept for a month, with a token it is permanent and
can be updated in place.

## Authentication (optional)

Set `PLOPINO_TOKEN` to publish to your account instead of anonymously. You get private
boards, updates that keep the same link, and you are not subject to the anonymous rate limit.

Create a token at **plopino.com/b** — the panel hands you a ready-made command with the token
already in it (the server keeps an encrypted copy, so you can come back for it any time), then:

```bash
claude mcp add plopino --env PLOPINO_TOKEN=plp_xxx -- npx -y plopino
```

**Leaving it unset is a supported configuration, not a degraded one.** Most users never need
a token — the anonymous flow is the product.

## Install

**Anything that speaks stdio MCP works** — the server is a plain stdio process, so the only
difference between clients is how you register it. All of the below are the clients' own
documented forms (verified 2026-09). Wherever you see `plp_xxx`, paste a token from
**plopino.com/b** — the panel there fills it in for you and lets you pick your client.

**Claude Code**

```bash
claude mcp add plopino -e PLOPINO_TOKEN=plp_xxx -- npx -y plopino
```

**Codex** (CLI and IDE extension share `~/.codex/config.toml`)

```bash
codex mcp add plopino --env PLOPINO_TOKEN=plp_xxx -- npx -y plopino
```

**Gemini CLI**

```bash
gemini mcp add -e PLOPINO_TOKEN=plp_xxx plopino npx -y plopino
```

**WorkBuddy** — `~/.workbuddy/mcp.json` (`%USERPROFILE%\.workbuddy\mcp.json` on Windows;
needs WorkBuddy 5.3+), then restart WorkBuddy:

```json
{
  "mcpServers": {
    "plopino": {
      "command": "npx",
      "args": ["-y", "plopino"],
      "env": { "PLOPINO_TOKEN": "plp_xxx" }
    }
  }
}
```

**Cursor** — the same JSON in `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global).
**Windsurf** — the same JSON in `~/.codeium/windsurf/mcp_config.json`.
**Claude Desktop** — the same JSON in `claude_desktop_config.json`.

**VS Code** — same idea in `.vscode/mcp.json`, but the key is `servers`, not `mcpServers`:

```json
{
  "servers": {
    "plopino": {
      "command": "npx",
      "args": ["-y", "plopino"],
      "env": { "PLOPINO_TOKEN": "plp_xxx" }
    }
  }
}
```

**No npm?** The server also ships as a single self-contained file on the site. Two lines
instead of one, but nothing to install:

```bash
curl -fsSL https://plopino.com/plopino-mcp.mjs -o "$HOME/.plopino-mcp.mjs"
claude mcp add plopino -e PLOPINO_TOKEN=plp_xxx -- node "$HOME/.plopino-mcp.mjs"
```

> `"$HOME/…"` is expanded by your shell as you paste, so the absolute path is what gets
> registered. That matters: MCP clients spawn the server from an arbitrary working
> directory, so a relative path would break.

Then just ask: *"publish this to Plopino"*, or *"give me a link for that page"*.

## Self-hosted / local

Set `PLOPINO_BASE_URL` to point at another instance:

```bash
PLOPINO_BASE_URL=http://127.0.0.1:8787 npx -y plopino
```

## Requirements

- Node 18 or newer (uses the built-in `fetch`, `FormData` and `Blob`).
- The only runtime dependency is the MCP SDK.

## Development

```bash
npm install
npm test        # 路径展开的边界 + 协议握手/工具列表（不需要网络）
```

To exercise the full publish path, run a Plopino instance locally and drive the server
over stdio:

```bash
PLOPINO_BASE_URL=http://127.0.0.1:8787 node index.js
```

> **stdout is the MCP protocol channel.** Anything written there that is not a JSON-RPC
> message will break the client. All logging must go to stderr — hence `console.error`
> everywhere and never `console.log`.

## Notes

- `publish_path` walks directories recursively and **skips symbolic links** — following
  them could escape the directory tree and upload files from elsewhere on the machine.
- Anonymous uploads are rate-limited per IP by the server side.
- Nothing is uploaded until a tool is called; the server does no network I/O at startup.
