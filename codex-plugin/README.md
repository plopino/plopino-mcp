# Plopino for Codex and ChatGPT

Publish pages, documents, and related text files from a conversation and receive a public link. The plugin connects to Plopino's remote MCP endpoint at `https://plopino.com/mcp`.

## Use

Add the public marketplace to Codex:

```bash
codex plugin marketplace add plopino/plopino-mcp
```

Install the Plopino plugin from the Plugins Directory or `codex plugin add`. For the official OpenAI directory submission, upload the ZIP containing this `codex-plugin` folder as one plugin root.

Anonymous publishing is available without a token and keeps content public for 30 days. Connect through OAuth to publish to your account, keep content permanently, and update an existing page without changing its URL.

## Data and limitations

Content and file names that you ask to publish are sent to Plopino's servers and become public to anyone with the link. Anonymous content is retained for 30 days; account content is retained until deleted. The requesting IP is used for rate limiting. The plugin does not read local filesystem paths and accepts text content only, not binary files. Never ask it to publish passwords, API keys, or other secrets. See https://plopino.com/privacy and https://plopino.com/terms.
