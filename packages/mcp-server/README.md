# @easyink/mcp-server

EasyInk MCP server for natural-language template generation. It exposes a stable `generateSchema` tool for the AI panel and several debug tools for inspecting the generation pipeline.

## Transports

```bash
pnpm -F @easyink/mcp-server start:stdio
pnpm -F @easyink/mcp-server start:http
```

HTTP mode defaults to `http://0.0.0.0:3000/mcp` and allows browser requests from any Origin.

## Environment

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `MCP_API_KEY` | no | request header | LLM provider API key fallback when `X-EasyInk-Provider-Key` is not sent. Required for stdio calls that invoke LLM tools. |
| `MCP_PROVIDER` | no | `claude` | `claude` or `openai`; fallback when `X-EasyInk-Provider` is not sent. |
| `MCP_MODEL` | no | provider default | Model name fallback when `X-EasyInk-Model` is not sent. |
| `MCP_BASE_URL` | no | provider default | Custom provider-compatible endpoint fallback when `X-EasyInk-Base-URL` is not sent. |
| `MCP_STRICT_OUTPUTS` | no | `true` | Set to `false` to fall back from strict structured output to JSON mode where supported. |
| `MCP_TRANSPORT` | no | `stdio` | `stdio` or `http`. |
| `MCP_HTTP_HOST` | no | `0.0.0.0` | HTTP bind host. |
| `MCP_HTTP_PORT` | no | `3000` | HTTP port. |

HTTP clients may provide request-scoped provider settings with these headers:

| Header | Description |
| --- | --- |
| `X-EasyInk-Provider` | `claude` or `openai`. |
| `X-EasyInk-Provider-Key` | LLM provider API key. |
| `X-EasyInk-Model` | Optional model override. |
| `X-EasyInk-Base-URL` | Optional provider-compatible HTTPS endpoint. |

## Tool Surface

Primary tool:

- `generateSchema`: resolves a generation plan, asks the LLM for `TemplateIntent`, deterministically builds `DocumentSchema`, repairs and validates it, then returns `schema`, `expectedDataSource`, `dataSource`, assumptions, intent and validation metadata.

Debug tools:

- `resolvePlan`: inspect domain, page and table strategy inference.
- `generateIntent`: inspect raw LLM `TemplateIntent` before deterministic construction.
- `buildSchemaFromIntent`: build schema and data source from a supplied intent and plan.
- `validateGeneratedSchema`: run deterministic repair, accuracy validation and schema validation for a supplied schema.

Legacy-compatible tool:

- `generateDataSource`: deterministically builds a `DataSourceDescriptor` from `ExpectedDataSource`. The primary flow no longer needs an extra LLM call for this.

## Architecture Notes

The generation path is intent-first:

1. Resolve `AIGenerationPlan` via LLM with deterministic keyword fallback.
2. Generate compact `TemplateIntent` using strict structured output by default.
3. Build `DocumentSchema` and `ExpectedDataSource` deterministically in `@easyink/schema-tools`.
4. Repair low-risk schema drift and validate canonical material/table rules.
5. Build a stable `DataSourceDescriptor` on the server, using `dataSource.id === binding.sourceId`.

`currentSchema` is used as context for a complete replacement. Patch-level editing is intentionally not part of this server contract yet.

## HTTP Mode

HTTP mode responds with `Access-Control-Allow-Origin: *` and does not expose an Origin allowlist or MCP-level API key setting. The AI panel can either rely on the server environment variables above or send provider settings per request with `X-EasyInk-*` headers.
