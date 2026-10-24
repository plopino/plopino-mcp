---
name: publish-with-plopino
description: Publish an HTML page, report, Markdown or CSV document, or multi-file bundle to a public Plopino link. Use when the user asks to share, send, publish, or get a link to content Claude produced.
---

Use the Plopino connector to make the content available at a public URL.

1. For one text document or page, call `publish_page` with the complete `content`. Pass `filename` when it is not an HTML page: `report.md`, `data.csv`, `query.sql`, and similar names render as documents. Default to `index.html` only for a self-contained page.
2. For several related text files, call `publish_files` with each relative `path` and complete `content`. Keep images and binary files out of this tool; they cannot be sent inline.
3. If the user supplied a Plopino page link to replace and a token is configured, pass it as `update_url` so the public URL stays the same.
4. Return the public URL from the tool result. If the result includes a private `claimUrl`, mention that it is only for the publisher and never put it in the public link or show it to page viewers.

Do not invent a URL, do not call a local-path tool, and do not use shell commands for publishing. Anonymous pages are public and kept for 30 days; an account token makes storage permanent.
