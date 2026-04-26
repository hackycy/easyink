# @easyink/mcp-server

EasyInk MCP server for natural-language template generation. It exposes a stable `generateSchema` tool for the AI panel and several debug tools for inspecting the generation pipeline.

## Transports

```bash
pnpm -F @easyink/mcp-server start:stdio
pnpm -F @easyink/mcp-server start:http
```

HTTP mode defaults to `http://127.0.0.1:3000/mcp` and is intended to be explicitly configured before sharing on an intranet.

## Environment

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `MCP_API_KEY` | yes | - | LLM provider API key. |
| `MCP_PROVIDER` | no | `claude` | `claude` or `openai`. |
| `MCP_MODEL` | no | provider default | Model name. |
| `MCP_BASE_URL` | no | provider default | Custom provider-compatible endpoint. |
| `MCP_STRICT_OUTPUTS` | no | `true` | Set to `false` to fall back from strict structured output to JSON mode where supported. |
| `MCP_TRANSPORT` | no | `stdio` | `stdio` or `http`. |
| `MCP_HTTP_HOST` | no | `127.0.0.1` | HTTP bind host. Use `0.0.0.0` only with explicit Origin and API key configuration. |
| `MCP_HTTP_PORT` | no | `3000` | HTTP port. |
| `MCP_HTTP_ALLOWED_ORIGINS` | no | localhost dev origins | Comma-separated Origin allowlist for browser clients. |
| `MCP_HTTP_API_KEY` | no | - | If set, HTTP requests must include `X-EasyInk-MCP-Key`. |

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

## HTTP Security

HTTP mode validates browser Origin and supports API key authentication. The default Origin allowlist only covers local development origins. For intranet deployment, set both:

```bash
MCP_HTTP_HOST=0.0.0.0
MCP_HTTP_ALLOWED_ORIGINS=https://designer.internal.example
MCP_HTTP_API_KEY=change-me
```

Then configure the AI panel server entry with the same API key; the client sends it as `X-EasyInk-MCP-Key`.
