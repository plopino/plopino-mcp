# plopino

MCP server for [Plopino](https://plopino.com) — lets an AI agent publish what it just built
and hand back a public link, without the user touching a browser.

```
agent writes index.html — or has a report / spreadsheet / markdown on disk
   ↓  publish_page / publish_path
https://plopino.com/b/xxxxxxxx/
```

Documents are first-class: Word (doc/docx), Excel (xls/xlsx) and Markdown
render as readable pages, code and data files get syntax-highlighted previews, and images
and video display inline. The recipient opens a link; they never download a file.

## Tools

| Tool | Use it when |
|---|---|
| `publish_page` | You have the content as a string — generated HTML, or a Markdown / CSV / code document. The `filename` decides how it renders: leave it at `index.html` for a page, pass `report.md` and it renders as a document. |
| `publish_path` | The page needs sibling files (CSS, JS, images), or you are sharing something that is already on disk — including any document, and including binary formats (docx, xlsx, pdf) that cannot be sent as a string. Point it at a directory and the structure is preserved — no need to zip first. |
| `publish_files` | Remote endpoint only. Same job as `publish_path` for clients that cannot hand over a local path: you send the file contents inline (a relative path plus its content, per entry). |

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

Also listed in the [official MCP registry](https://registry.modelcontextprotocol.io) as
`io.github.plopino/plopino-mcp`, and on [Smithery](https://smithery.ai/servers/plopino/plopino)
as an installable bundle.

**Anything that speaks stdio MCP works** — the server is a plain stdio process, so the only
difference between clients is how you register it. All of the below are the clients' own
documented forms (verified 2026-09). Wherever you see `plp_xxx`, paste a token from
**plopino.com/b** — the panel there fills it in for you and lets you pick your client.
If your client would rather not run a local process at all, skip to
[Remote endpoint](#remote-endpoint--nothing-to-install) — same tools, one URL.

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

## Remote endpoint — nothing to install

Everything above runs on your machine. There is also a **hosted Streamable HTTP endpoint**
serving the same tools, for clients that support remote MCP servers and would rather not run
a local process at all:

```
https://plopino.com/mcp
```

```bash
claude mcp add --transport http plopino https://plopino.com/mcp
```

Any client that accepts a remote server URL takes that same address. Authentication works the
same way: send a token as `Authorization: Bearer plp_xxx` if you have one, and publish
anonymously if you don't.

Two differences from the stdio build, both deliberate:

- **`publish_path` is not available remotely.** It takes a path on the machine the server
  runs on — which, remotely, is not your machine. Use `publish_files` and send the contents.
- The endpoint is stateless: each request is handled on its own, no session to keep alive.

## Self-hosted / local

The instance the server publishes to defaults to `https://plopino.com`. Set `PLOPINO_BASE_URL`
to point at another one — a staging host, or your own deployment:

```bash
PLOPINO_BASE_URL=https://plopino.com npx -y plopino
```

## Requirements

- Node 18 or newer (uses the built-in `fetch`, `FormData` and `Blob`).
- The only runtime dependency is the MCP SDK.

## Development

```bash
npm install
npm test        # 路径展开的边界 + 协议握手/工具列表（不需要网络）
```

To exercise the full publish path, run a Plopino instance and drive the server over stdio
against it:

```bash
PLOPINO_BASE_URL=https://plopino.com node index.js
```

> **stdout is the MCP protocol channel.** Anything written there that is not a JSON-RPC
> message will break the client. All logging must go to stderr — hence `console.error`
> everywhere and never `console.log`.

## Privacy Policy

Full policy: **https://plopino.com/privacy**

- **What is collected.** Only what publishing requires: the file contents and file names you
  pass to a tool, the destination URL, and — for anonymous publishes — the requesting IP
  address (used for the daily rate limit). The MCP server itself collects nothing and sends
  no telemetry; it runs locally and writes only to stderr.
- **How it is used and stored.** Uploaded content is stored on Plopino's servers and served
  from the returned public link. A `PLOPINO_TOKEN` is stored locally in your MCP client
  configuration; the server keeps only its SHA-256 hash.
- **Third parties.** No content or usage data is sold, shared or sent to third parties for
  advertising. Plopino uses Cloudflare as its CDN/reverse proxy and self-hosted Umami for
  aggregate, cookieless visit counts.
- **Retention.** Anonymous uploads are deleted after **30 days**; a link can also be removed
  earlier from the account page. Uploads made with a token are kept until you delete them
  or the account is closed. Request deletion or report abuse at **abuse@plopino.com**.
- **Contact.** abuse@plopino.com (abuse and privacy requests), or https://plopino.com/abuse.

## Notes

- `publish_path` walks directories recursively and **skips symbolic links** — following
  them could escape the directory tree and upload files from elsewhere on the machine.
- Anonymous uploads are rate-limited per IP by the server side.
- Nothing is uploaded until a tool is called; the server does no network I/O at startup.
