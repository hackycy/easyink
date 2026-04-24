FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /monorepo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY packages/mcp-server/package.json packages/mcp-server/
COPY packages/mcp/package.json packages/mcp/
COPY packages/schema/package.json packages/schema/
COPY packages/datasource/package.json packages/datasource/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY packages/ packages/
RUN pnpm --filter @easyink/mcp-server build
RUN pnpm deploy --filter @easyink/mcp-server /deploy

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /deploy .
ENV MCP_TRANSPORT=http
ENV MCP_HTTP_PORT=3000
EXPOSE 3000
CMD ["node", "dist/bin/server.mjs"]
