FROM golang:1.23-bookworm AS builder

ENV PATH=/usr/local/go/bin:$PATH

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/easyink-render-host ./cmd/easyink-render-host

FROM chromedp/headless-shell:latest

COPY --from=builder /out/easyink-render-host /easyink-render-host
ENV EASYINK_RENDER_BROWSER_PATH=/headless-shell/headless-shell
ENTRYPOINT ["/easyink-render-host"]
CMD ["--host", "127.0.0.1", "--port", "18181", "--browser-path", "/headless-shell/headless-shell", "--profile-root", "/tmp/easyink-profile", "--temp-dir", "/tmp/easyink-temp", "--log-dir", "/tmp/easyink-logs", "--auth-token", "test-token"]
