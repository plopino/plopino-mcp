#!/usr/bin/env bash
# 打出 .mcpb bundle（MCP Bundle = stdio 服务器的分发格式）。
#
# 为什么需要它：Smithery 只收「远程 URL」或「.mcpb」，我们没有远程端点，所以走 bundle；
# Claude Desktop 的「安装扩展」吃的也是这个格式。发布（CLI 包名就是 smithery，
# 不是 @smithery/cli——那是 4.x 的旧包）：
#   npx -y smithery auth login                               # OAuth，浏览器授权
#   npx -y smithery mcp publish ../plopino.mcpb -n plopino/plopino
#
# 打包是把目录原样装进 zip，所以这里先把**运行需要的东西**挑进临时目录（不带 test/、
# 不带 devDependencies），而不是直接 pack mcp/ —— 后者会把测试与 esbuild 一起发出去。
set -euo pipefail
cd "$(dirname "$0")/.."          # mcp/

OUT="${1:-plopino.mcpb}"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

cp index.js mcp-server.js cli.js session.js login.js upload.js tool-defs.js package.json package-lock.json "$STAGE/"
cp mcpb/manifest.json "$STAGE/manifest.json"
# README 与图标必须进 bundle：
#  · Claude 桌面扩展目录要求隐私政策以「README 的 Privacy Policy 小节」形式随包提交，
#    缺了会被直接拒（官文：Missing or incomplete privacy policies result in immediate rejection）
#  · manifest 的 icons[].src 指的是**包内**路径，图标不在包里等于没有图标
cp README.md "$STAGE/README.md"
cp mcpb/icon.png "$STAGE/icon.png"
# 只装运行时依赖：bundle 要自包含，用户机器上不必再 npm install
( cd "$STAGE" && npm ci --omit=dev --no-audit --no-fund >/dev/null )

echo "== validate =="
npx --yes @anthropic-ai/mcpb validate "$STAGE/manifest.json"

echo "== pack =="
npx --yes @anthropic-ai/mcpb pack "$STAGE" "$OUT"
ls -lh "$OUT"
