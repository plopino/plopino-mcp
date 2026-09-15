#!/usr/bin/env bash
# 打出 .mcpb bundle（MCP Bundle = stdio 服务器的分发格式）。
#
# 为什么需要它：Smithery 只收「远程 URL」或「.mcpb」，我们没有远程端点，所以走 bundle；
# Claude Desktop 的「安装扩展」吃的也是这个格式。发布：
#   npx @anthropic-ai/smithery-cli auth login
#   smithery mcp publish ../plopino.mcpb -n plopino/plopino
#
# 打包是把目录原样装进 zip，所以这里先把**运行需要的东西**挑进临时目录（不带 test/、
# 不带 devDependencies），而不是直接 pack mcp/ —— 后者会把测试与 esbuild 一起发出去。
set -euo pipefail
cd "$(dirname "$0")/.."          # mcp/

OUT="${1:-plopino.mcpb}"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

cp index.js upload.js package.json package-lock.json "$STAGE/"
cp mcpb/manifest.json "$STAGE/manifest.json"
# 只装运行时依赖：bundle 要自包含，用户机器上不必再 npm install
( cd "$STAGE" && npm ci --omit=dev --no-audit --no-fund >/dev/null )

echo "== validate =="
npx --yes @anthropic-ai/mcpb validate "$STAGE/manifest.json"

echo "== pack =="
npx --yes @anthropic-ai/mcpb pack "$STAGE" "$OUT"
ls -lh "$OUT"
