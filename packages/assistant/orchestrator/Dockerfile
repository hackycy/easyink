# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends g++ make python3 \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /monorepo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json turbo.json ./
COPY packages/ packages/

RUN pnpm install --frozen-lockfile
RUN pnpm turbo build --filter=@easyink/assistant-orchestrator
RUN pnpm deploy --legacy --filter=@easyink/assistant-orchestrator /deploy

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

COPY --from=builder /deploy ./

RUN mkdir -p /var/lib/easyink-assistant \
  && chown -R node:node /app /var/lib/easyink-assistant

ENV NODE_ENV=production
ENV EASYINK_ASSISTANT_HTTP_HOST=0.0.0.0
ENV EASYINK_ASSISTANT_HTTP_PORT=3010
ENV EASYINK_ASSISTANT_STORE_DIR=/var/lib/easyink-assistant
ENV EASYINK_ASSISTANT_STORE_FILE=assistant-store.json

USER node

EXPOSE 3010

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3010/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/bin/server.mjs"]
