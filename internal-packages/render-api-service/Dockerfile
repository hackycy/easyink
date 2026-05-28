# syntax=docker/dockerfile:1

FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS workspace

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /monorepo

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json turbo.json ./
COPY internal-packages/ internal-packages/
COPY packages/ packages/
COPY lib/EasyInk.Render/host/ lib/EasyInk.Render/host/

RUN pnpm install --frozen-lockfile
RUN pnpm render:runtime
RUN pnpm -F @easyink/render-api-service build
RUN pnpm deploy --legacy --filter=@easyink/render-api-service /deploy

FROM --platform=$BUILDPLATFORM golang:1.23-bookworm AS render-host-builder

ARG TARGETOS=linux
ARG TARGETARCH

WORKDIR /src

COPY --from=workspace /monorepo/lib/EasyInk.Render/host/ ./

RUN case "$TARGETARCH" in \
    amd64|arm64) ;; \
    *) echo "unsupported target architecture: $TARGETARCH" >&2; exit 1 ;; \
  esac \
  && CGO_ENABLED=0 GOOS="$TARGETOS" GOARCH="$TARGETARCH" go build -trimpath -ldflags='-s -w' -o /out/easyink-render ./cmd/easyink-render

FROM node:22-bookworm-slim AS runtime

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    chromium \
    dumb-init \
    fonts-noto-cjk \
    fonts-noto-core \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=workspace /deploy ./
COPY --from=render-host-builder /out/easyink-render /usr/local/bin/easyink-render

RUN mkdir -p \
    /var/lib/easyink-render/profile \
    /var/tmp/easyink-render \
    /var/log/easyink-render \
    /tmp/easyink-render-api \
  && chmod 755 /usr/local/bin/easyink-render \
  && chown -R node:node \
    /app \
    /var/lib/easyink-render \
    /var/tmp/easyink-render \
    /var/log/easyink-render \
    /tmp/easyink-render-api

ENV NODE_ENV=production
ENV EASYINK_RENDER_API_HOST=0.0.0.0
ENV EASYINK_RENDER_API_PORT=18081
ENV EASYINK_RENDER_BIN=/usr/local/bin/easyink-render
ENV EASYINK_RENDER_API_WORK_DIR=/tmp/easyink-render-api
ENV EASYINK_RENDER_NO_DAEMON=true
ENV EASYINK_RENDER_BROWSER_KIND=chromium
ENV EASYINK_RENDER_BROWSER_PATH=/usr/bin/chromium
ENV EASYINK_RENDER_DISABLE_SANDBOX=true
ENV EASYINK_RENDER_TEMP_DIR=/var/tmp/easyink-render
ENV EASYINK_RENDER_LOG_DIR=/var/log/easyink-render

USER node

EXPOSE 18081

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:18081/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/bin/server.mjs"]
