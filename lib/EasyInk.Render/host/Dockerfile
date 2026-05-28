FROM golang:1.23-bookworm AS builder

ENV PATH=/usr/local/go/bin:$PATH

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/easyink-render ./cmd/easyink-render

FROM chromedp/headless-shell:latest

COPY --from=builder /out/easyink-render /easyink-render
ENV EASYINK_RENDER_BROWSER_PATH=/headless-shell/headless-shell
ENTRYPOINT ["/easyink-render"]
CMD ["version"]
