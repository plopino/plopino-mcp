# 给 Glama / Smithery 这类目录站用：它们要求「容器能起来并回答 tools/list」，
# 光有 npm 包过不了检查（见 awesome-mcp-servers 的 PR 要求）。
# 本镜像只跑 stdio，不需要任何端口。
FROM node:22-alpine

WORKDIR /app

# 先装依赖再拷源码：改代码时不至于重装 node_modules
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.js upload.js tool-defs.js ./

# 以非 root 跑：这个进程会读本地文件路径（publish_path），少一层权限总是好的
USER node

# stdio 服务：CMD 保持前台，客户端通过标准输入输出通信
CMD ["node", "index.js"]
