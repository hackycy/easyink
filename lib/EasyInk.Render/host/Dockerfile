FROM golang:1.23-bookworm AS builder

ENV PATH=/usr/local/go/bin:$PATH

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/easyink-render ./cmd/easyink-render

FROM mcr.microsoft.com/playwright:v1.57.0-noble AS runtime

RUN browser_path="$(find /ms-playwright -path '*/chrome-linux*/chrome' -type f | head -n 1)" \
    && test -n "$browser_path" \
    && ln -sf "$browser_path" /usr/local/bin/easyink-chromium

COPY --from=builder /out/easyink-render /easyink-render
ENV EASYINK_RENDER_BROWSER_PATH=/usr/local/bin/easyink-chromium
ENV EASYINK_RENDER_DISABLE_SANDBOX=true
ENTRYPOINT ["/easyink-render"]
CMD ["version"]
