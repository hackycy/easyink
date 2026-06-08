---
description: 在 Designer 中接入 EasyInk Assistant：注册助手面板、部署 orchestrator 服务、配置模型、持久化和上线检查。
---

# AI模板生成 {#assistant}

Assistant 是官方的 Designer 模板生成助手。你把一个 Contribution 接进 Designer，再把前端连到 `assistant-orchestrator` 服务，用户就可以在设计器里描述要生成的票据、标签或表单，并在确认后应用到当前模板。

## 安装前端包 {#install-packages}

先把 Designer 和助手桥接包装进你的前端项目：

```bash
pnpm add @easyink/designer @easyink/assistant-designer-bridge
```

`@easyink/assistant-designer-bridge` 已经把面板、工具栏按钮、命令和应用结果的逻辑封装好了。你不需要自己从零写一个侧边面板。

## 接入 Designer {#connect-designer}

先看一个最小接入：

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { EasyInkDesigner, createLocalStoragePreferenceProvider } from '@easyink/designer'
import { zhCN } from '@easyink/designer/locale'
import { createAssistantContribution } from '@easyink/assistant-designer-bridge'
import '@easyink/designer/index.css'
import '@easyink/assistant-designer-bridge/index.css'

const schema = ref({})
const preferenceProvider = createLocalStoragePreferenceProvider()

const assistant = createAssistantContribution({
  endpoint: import.meta.env.VITE_EASYINK_ASSISTANT_ENDPOINT,
})

const contributions = [assistant]
</script>

<template>
  <EasyInkDesigner
    v-model:schema="schema"
    :locale="zhCN"
    :preference-provider="preferenceProvider"
    :contributions="contributions"
  />
</template>
```

这段代码做了三件事：

- 在 Designer 工具栏里注册 Assistant 按钮。
- 点击按钮时打开助手面板。
- 用户点击“应用到设计器”后，把生成结果写回当前 `schema`。

如果你的前端和 Assistant 服务在同一个域名下，可以不传 `endpoint`。这时面板会请求当前站点下的 `/assistant/*` 接口。

## 启用插件中心 {#assistant-plugins}

如果你想让用户在 Assistant 面板里勾选额外能力，可以给 `createAssistantContribution()` 传入插件列表。

先安装你需要的官方插件包：

```bash
pnpm add \
  @easyink/assistant-plugin-placeholder-images \
  @easyink/assistant-plugin-prototype-designer \
  @easyink/assistant-plugin-receipt-designer
```

然后把插件传给 Assistant Contribution：

```ts
import { createAssistantContribution } from '@easyink/assistant-designer-bridge'
import { placeholderImagesPlugin } from '@easyink/assistant-plugin-placeholder-images'
import { prototypeDesignerPlugin } from '@easyink/assistant-plugin-prototype-designer'
import { receiptDesignerPlugin } from '@easyink/assistant-plugin-receipt-designer'

const assistant = createAssistantContribution({
  endpoint: import.meta.env.VITE_EASYINK_ASSISTANT_ENDPOINT,
  plugins: [
    placeholderImagesPlugin,
    prototypeDesignerPlugin,
    receiptDesignerPlugin,
  ],
})
```

传入 `plugins` 后，Assistant 面板里会出现插件中心入口。用户可以在插件中心里启用或停用插件；提交任务时，面板会把已启用插件的提示词和上下文结果一起发给 Assistant 服务。

官方插件现在有三类：

| 包 | 面板名称 | 作用 |
|----|----------|------|
| `@easyink/assistant-plugin-placeholder-images` | 占位图助手 | 原型、H5、海报缺少图片素材时，引导生成结果使用 `https://picsum.photos/{width}/{height}` 占位图 |
| `@easyink/assistant-plugin-prototype-designer` | 专业原型设计师 | 强化屏幕原型、H5、产品 UI 的页面尺寸、信息层级和占位内容 |
| `@easyink/assistant-plugin-receipt-designer` | 专业小票设计师 | 强化热敏小票的窄纸宽、连续纸、金额对齐和打印可读性 |

如果你只需要其中一部分，就只传那几个插件：

```ts
const assistant = createAssistantContribution({
  endpoint: '/easyink-assistant',
  plugins: [
    placeholderImagesPlugin,
  ],
})
```

Playground 已经内置了这三个官方插件。你可以本地打开 Playground，进入 Assistant 面板后切到插件中心，勾选插件再提交一次生成任务。

## 编写自定义插件 {#custom-assistant-plugin}

自定义插件也走同一套协议。插件可以提供静态提示词，也可以提供一个 Promise 动作，把第三方选择器、保存好的提示词或业务上下文转换成 Assistant 能接收的结构化结果。

看一个最小插件：

```ts
import type { AssistantPlugin } from '@easyink/assistant-designer-bridge'

export const savedPromptPlugin = {
  manifest: {
    id: 'your-app.saved-prompts',
    name: '保存的提示词',
    version: '1.0.0',
    category: '业务插件',
    actions: [
      { id: 'select', label: '选择提示词' },
    ],
  },
  async invoke() {
    const prompt = await openSavedPromptPicker()

    return {
      contributions: [{
        target: 'schema',
        priority: 50,
        title: 'Selected saved prompt',
        content: prompt,
      }],
      contextItems: [{
        id: 'selected-saved-prompt',
        kind: 'saved-prompt',
        title: '保存的提示词',
        content: prompt,
      }],
    }
  },
} satisfies AssistantPlugin
```

这里的 `openSavedPromptPicker()` 由你的业务系统自己实现。Assistant 不关心它是素材库弹窗、提示词列表、品牌规范选择器，还是第三方 UI；它只等待 Promise 返回，然后把返回结果注入到任务里。

`contributions[].target` 用来决定提示词注入到哪个 Agent 阶段。常用值包括 `intake`、`planner`、`contract`、`materials`、`layout`、`schema`、`repair` 和 `all`。如果插件要影响本次任务优先选择或规避哪些 Designer 物料，使用 `materials`；如果插件只约束最终 schema 生成规则，使用 `schema`。

关于插件协议，目前知道这些就够用了。更完整的实现边界可以看内部架构文档 `.github/architecture/25-ai-assistant.md` 里的 “Assistant 插件系统”。

## 配置接口地址 {#configure-endpoint}

开发时最直接的方式，是把服务地址放进前端环境变量：

```dotenv
VITE_EASYINK_ASSISTANT_ENDPOINT=http://localhost:3010
```

然后像上面的示例一样传给 `createAssistantContribution()`。

生产环境里更推荐让前端走同源反向代理：

```ts
const assistant = createAssistantContribution({
  endpoint: '/easyink-assistant',
})
```

这样浏览器会请求：

```text
/easyink-assistant/assistant/tasks
/easyink-assistant/assistant/tasks/{id}/stream
```

后端代理再把 `/easyink-assistant/` 转发到 Assistant 服务根路径。

:::tip 提示
Assistant 会使用 SSE 接收生成进度。反向代理要关闭响应缓冲，否则用户会看到“请求还在转，但面板一直不更新”。
:::

## 本地启动服务 {#run-service-locally}

如果你只想先在本机试通，可以直接用 Docker 跑服务：

```bash
docker run --rm \
  -p 3010:3010 \
  -e EASYINK_ASSISTANT_LLM_PROVIDER=openai \
  -e OPENAI_API_KEY=sk-your-key \
  -e EASYINK_ASSISTANT_LLM_MODEL=gpt-5-mini \
  ghcr.io/hackycy/easyink-assistant-orchestrator:latest
```

服务启动后，先验证健康检查：

```bash
curl http://localhost:3010/health
```

你应该能看到类似结果：

```json
{"ok":true,"service":"easyink-assistant-orchestrator"}
```

再确认前端能读到服务能力：

```bash
curl http://localhost:3010/assistant/capabilities
```

如果这里已经通了，再回到 Designer，点击工具栏里的 Assistant 按钮，输入一句“帮我生成一张 80mm 小票”试试看。

## Docker Compose 部署 {#docker-compose}

长期运行时，建议给服务加上持久化目录。下面是一份可以直接改的 `docker-compose.yml`：

```yaml
services:
  easyink-assistant:
    image: ghcr.io/hackycy/easyink-assistant-orchestrator:latest
    ports:
      - '3010:3010'
    environment:
      EASYINK_ASSISTANT_HTTP_HOST: 0.0.0.0
      EASYINK_ASSISTANT_HTTP_PORT: 3010
      EASYINK_ASSISTANT_CORS_ORIGIN: https://your-designer.example.com
      EASYINK_ASSISTANT_STORE_KIND: sqlite
      EASYINK_ASSISTANT_STORE_DIR: /var/lib/easyink-assistant
      EASYINK_ASSISTANT_STORE_SQLITE_FILE: assistant-store.sqlite
      EASYINK_ASSISTANT_LLM_PROVIDER: openai
      EASYINK_ASSISTANT_LLM_MODEL: gpt-5-mini
      OPENAI_API_KEY: ${OPENAI_API_KEY}
    volumes:
      - easyink-assistant-data:/var/lib/easyink-assistant
    restart: unless-stopped

volumes:
  easyink-assistant-data:
```

这份配置把任务、事件、版本和生成结果放进 SQLite。容器重启后，服务端的任务记录还在。

如果你只是做临时演示，也可以用内存存储：

```yaml
environment:
  EASYINK_ASSISTANT_STORE_KIND: memory
```

内存模式重启就清空，适合演示，不适合生产。

## 模型配置方式 {#llm-configuration}

模型配置有两种常见方式。两种都能跑通，区别在于 API Key 放在哪里。

### 服务端统一配置 {#server-side-llm}

如果你的系统由团队统一付费和管控，选服务端配置：

```dotenv
EASYINK_ASSISTANT_LLM_PROVIDER=openai
EASYINK_ASSISTANT_LLM_MODEL=gpt-5-mini
OPENAI_API_KEY=sk-your-key
```

OpenAI-compatible 服务也走同一套 OpenAI 客户端，只是多传一个 base URL：

```dotenv
EASYINK_ASSISTANT_LLM_PROVIDER=openai-compatible
EASYINK_ASSISTANT_LLM_BASE_URL=https://api.deepseek.com
EASYINK_ASSISTANT_LLM_MODEL=deepseek-chat
OPENAI_API_KEY=your-key
```

Anthropic 则换成：

```dotenv
EASYINK_ASSISTANT_LLM_PROVIDER=anthropic
EASYINK_ASSISTANT_LLM_MODEL=claude-sonnet-4-5
ANTHROPIC_API_KEY=sk-ant-your-key
```

这种方式下，浏览器不会接触模型密钥。对企业内部系统来说，这是更常见的选择。

### 用户自己填写 Key {#request-scoped-llm}

如果你做的是公开演示，可能不想替所有访问者承担模型调用。这时可以允许用户在浏览器里填写自己的 Key。

先在服务端打开请求级模型配置：

```dotenv
EASYINK_ASSISTANT_REQUEST_LLM_CONFIG=1
EASYINK_ASSISTANT_REQUEST_LLM_PROVIDERS=openai,openai-compatible,anthropic
EASYINK_ASSISTANT_REQUEST_LLM_ALLOWED_BASE_URLS=https://api.openai.com,https://api.deepseek.com
EASYINK_ASSISTANT_REQUEST_LLM_PRIVATE_BASE_URL=0
EASYINK_ASSISTANT_REQUEST_LLM_INSECURE_BASE_URL=0
```

再在前端传入浏览器配置服务：

```ts
import {
  createAssistantContribution,
  createBrowserAssistantLLMConfigService,
} from '@easyink/assistant-designer-bridge'

const llmConfig = createBrowserAssistantLLMConfigService({
  persistence: 'session',
  providers: [
    { provider: 'openai', label: 'OpenAI', model: 'gpt-5-mini' },
    { provider: 'openai-compatible', label: 'DeepSeek', baseURL: 'https://api.deepseek.com', model: 'deepseek-chat' },
    { provider: 'anthropic', label: 'Anthropic', model: 'claude-sonnet-4-5' },
  ],
})

const assistant = createAssistantContribution({
  endpoint: import.meta.env.VITE_EASYINK_ASSISTANT_ENDPOINT,
  llmConfig,
})
```

`persistence: 'session'` 表示配置只保存在当前浏览器会话里。你也可以改成 `memory` 或 `local`，但公开站点里我们建议先用 `session`。

:::warning 注意
请求级模型配置会把用户填写的 Key 随请求发送到 Assistant 服务。服务不会把它写进任务存储，但你仍然要使用 HTTPS，并避免在日志里记录请求体。
:::

## 反向代理配置 {#reverse-proxy}

如果前端页面在 `https://your-designer.example.com`，我们建议把 Assistant 也挂到同一个域名下：

```nginx
location /easyink-assistant/ {
  proxy_pass http://easyink-assistant:3010/;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

  proxy_buffering off;
  proxy_cache off;
  proxy_read_timeout 1h;
  proxy_send_timeout 1h;
  gzip off;
}
```

前端对应写：

```ts
const assistant = createAssistantContribution({
  endpoint: '/easyink-assistant',
})
```

这段配置的重点是 `proxy_pass` 末尾的 `/`：它会把 `/easyink-assistant/assistant/tasks` 转成后端服务看到的 `/assistant/tasks`。

Assistant 的生成进度走 SSE，也就是一个长时间不断返回小块数据的 HTTP 响应。`proxy_buffering off`、`proxy_cache off` 和较长的 timeout 能避免 Nginx 把事件攒在缓冲区里，等请求结束才一次性发给浏览器。

如果你想把 Assistant 作为独立后端服务暴露，比如 `https://assistant.example.com`，可以给它单独放一个 Nginx `server`：

```nginx
upstream easyink_assistant {
  # Nginx 和容器在同一个 Docker network 时，可以写 easyink-assistant:3010。
  # Nginx 跑在宿主机上时，通常写 127.0.0.1:3010。
  server 127.0.0.1:3010;
  keepalive 32;
}

server {
  listen 443 ssl;
  server_name assistant.example.com;

  ssl_certificate /etc/letsencrypt/live/assistant.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/assistant.example.com/privkey.pem;

  location / {
    proxy_pass http://easyink_assistant;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
    proxy_send_timeout 1h;
    gzip off;
  }
}
```

这时前端 endpoint 写完整域名：

```ts
const assistant = createAssistantContribution({
  endpoint: 'https://assistant.example.com',
})
```

因为前端和 Assistant 已经不是同源，还要在 Assistant 服务端允许你的前端域名：

```dotenv
EASYINK_ASSISTANT_CORS_ORIGIN=https://your-designer.example.com
```

开发阶段可以用 `*`，生产环境建议写明确域名。

### Nginx Proxy Manager {#nginx-proxy-manager}

如果你用 Nginx Proxy Manager，可以先按普通 HTTP 服务来建 Proxy Host：

- Domain Names：`assistant.example.com`
- Scheme：`http`
- Forward Hostname / IP：`easyink-assistant`、Assistant 容器 IP 或宿主机局域网 IP
- Forward Port：`3010`
- SSL：申请证书，并打开 `Force SSL`

:::tip 提示
如果 Nginx Proxy Manager 自己也跑在 Docker 里，`127.0.0.1` 指的是 Nginx Proxy Manager 容器本身，不是宿主机。Assistant 和 Nginx Proxy Manager 在同一个 Docker network 时，优先填 Assistant 的服务名，比如 `easyink-assistant`。
:::

SSE 不需要 WebSocket。你可以不打开 WebSocket Support，真正关键的是在 Advanced 里关掉缓冲：

```nginx
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 1h;
proxy_send_timeout 1h;
gzip off;
```

不要在 Nginx Proxy Manager 的 Advanced 里重复写 `proxy_http_version` 或 `proxy_set_header`。它会自己生成这些代理头；如果你同时打开 WebSocket Support，再手写 `proxy_http_version 1.1;`，Nginx 可能会因为重复指令导致这个 Proxy Host 无法正常启动。

保存后用下面两个请求确认代理已经通了：

```bash
curl https://assistant.example.com/health
curl https://assistant.example.com/assistant/capabilities
```

如果 Designer 里能创建任务，但进度一直不刷新，再看浏览器 Network 面板里的 `/assistant/tasks/{id}/stream`。这个请求应该一直保持 pending，并持续收到 `event:` 或 `: ping` 数据。

## 应用结果的流程 {#apply-flow}

Assistant 不会在生成完成后自动改模板。用户需要先查看生成结果，再点击应用。

整个流程可以这样理解：

```text
用户描述需求
  -> Assistant 服务生成候选模板或补丁
  -> 面板展示摘要、差异和需要确认的问题
  -> 用户点击应用
  -> Designer 更新 schema、数据源或当前选中元素
```

如果应用后发现不合适，面板里的回滚操作会恢复到应用前的模板快照。

这也是为什么我们建议你保留 Designer 的 [自动保存](./auto-save)：Assistant 负责生成和应用，自动保存负责把最终模板持久化到你的业务系统。

## 上线前检查 {#production-checklist}

接入完成后，至少检查这些点：

- 健康检查：`/health` 能被监控系统访问。
- 进度流：`/assistant/tasks/{id}/stream` 没有被代理缓冲。
- CORS：生产环境不要长期使用 `*`，除非你明确允许任意来源访问。
- 存储：生产环境使用 SQLite 或你自己的持久化方案，不要用内存模式。
- 密钥：服务端 API Key 放在部署平台的密钥管理里，不要写进镜像或前端环境变量。
- 日志：不要记录用户 prompt 里的敏感业务数据，也不要记录请求级 LLM Key。
- 版本：前端包和服务镜像尽量一起升级，避免面板调用了服务端还不认识的新接口。

## 常见问题 {#troubleshooting}

**工具栏没有 Assistant 按钮**

先确认 `contributions` 真的传给了 Designer：

```vue
<EasyInkDesigner :contributions="contributions" />
```

如果你把 `contributions` 写在 `computed` 里，也要保证里面的 `createAssistantContribution()` 没有在每次渲染时重新创建。

**面板打开后请求失败**

先检查 endpoint 拼出来的路径：

```text
{endpoint}/assistant/capabilities
```

如果你传的是 `/easyink-assistant`，那服务能力接口应该是 `/easyink-assistant/assistant/capabilities`。

**生成进度一直不动**

大概率是 SSE 被代理缓冲了。先用浏览器 Network 看 `/stream` 请求是否持续接收事件，再检查反向代理的 `proxy_buffering off` 或同等配置。

**应用后模板没有保存到业务后端**

Assistant 只负责把结果应用到 Designer。你仍然需要配置 [自动保存](./auto-save)，或者监听 `update:schema` 后调用自己的保存接口。

关于 Assistant，目前知道这些就能完成一次完整接入。下一步可以继续看 [Contribution 扩展](../advanced/contributions)，了解它是怎么把按钮、面板和命令挂进 Designer 的。
