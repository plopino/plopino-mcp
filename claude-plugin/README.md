# Plopino

Publish pages, reports, documents, and multi-file bundles from Claude and get a public link that opens on any device.

## Use it

Ask Claude to publish the page or document it just produced, or to share several related files as one link. Claude calls Plopino's `publish_page` or `publish_files` tool and returns the public URL. Markdown, CSV, and code files render as readable pages; HTML renders as a page.

Publishing is anonymous by default, so no account is required. The optional token connects the plugin to a Plopino account and enables permanent storage and in-place updates.

## Data

The plugin connects to `https://plopino.com/mcp` and sends the content, file names, and destination metadata you ask Claude to publish to Plopino's servers. Published content is public to anyone with the link. Anonymous uploads are kept for 30 days and the requesting IP address is used for rate limiting. With a token, content is kept until deleted. See the [privacy policy](https://plopino.com/privacy) and [terms](https://plopino.com/terms).
