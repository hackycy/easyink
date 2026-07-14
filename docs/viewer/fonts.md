---
description: Viewer 字体加载机制：通过 FontProvider 在渲染前加载模板所需字体，并注入到当前 Viewer Host 文档。
---

# 字体加载 {#fonts}

Viewer 的字体链路和 Designer 共用同一套 `FontProvider` 约定。你提供字体目录和字体资源，Viewer 在渲染前按模板引用的字体族加载并注入。

这一步会影响测量、布局和分页，所以它发生在正式渲染 DOM 之前。

## 基本用法 {#basic-usage}

先定义一个 `FontProvider`：

```ts
import type { FontProvider } from '@easyink/viewer'

const fontProvider: FontProvider = {
  async listFonts() {
    return [
      {
        family: 'system-ui',
        displayName: '系统界面字体',
        weights: ['400', '700'],
        styles: ['normal'],
        source: 'system',
      },
      {
        family: 'SourceHanSans',
        displayName: '思源黑体',
        weights: ['400'],
        styles: ['normal'],
      },
    ]
  },
  async loadFont(family, weight, style) {
    return `/fonts/${encodeURIComponent(family)}-${weight ?? '400'}-${style ?? 'normal'}.woff2`
  },
}
```

然后把它交给 Viewer：

```ts
import { createViewer } from '@easyink/viewer'

const viewer = createViewer({
  iframe: iframeElement,
  profile,
  fontProvider,
})
```

`listFonts()` 提供字体目录。`loadFont()` 返回字体资源，可以是 URL 字符串、`ArrayBuffer`，也可以返回 `{ type: 'system' }` 表示系统字体。

## 渲染前加载 {#pre-render-loading}

`open()` 或 `render()` 会在渲染前加载字体。

```ts
await viewer.open({
  schema,
  data,
  onDiagnostic(event) {
    if (event.scope === 'font') {
      console.warn(event.code, event.message)
    }
  },
})
```

当前 Viewer 通过各物料 manifest 的 schema-adapter introspection 收集字体和资产引用，并把它们与页面字体一起交给 resource-readiness coordinator。协调器会为每个声明资源记录终态，并在测量前发布 `resourceRevision`；没有 `fontProvider`、没有 Host 或没有字体引用时，也会走明确的终态降级路径。

目前预加载按 `family` 收集。`FontProvider.loadFont(family, weight, style)` 的 `weight` 和 `style` 参数属于通用字体接口，Viewer 这条预加载路径不保证一定传入它们。

## 注入位置 {#injection-target}

字体样式会注入到当前 Host 的文档。

```ts
const iframeViewer = createViewer({
  iframe: iframeElement,
  profile,
  fontProvider,
})

const domViewer = createViewer({
  container: containerElement,
  profile,
  fontProvider,
})
```

两种 Host 的注入位置不同：

- `iframe`：注入 iframe 的 `document.head`。
- `container`：注入 `container.ownerDocument.head`。
- `host`：注入你提供的 `host.document.head`。

所以 iframe 模式下，你不需要再在父页面重复注入同一份 `@font-face`。

## 系统字体 {#system-fonts}

系统字体不会生成 `@font-face`。

```ts
const fontProvider: FontProvider = {
  async listFonts() {
    return [
      {
        family: 'Arial',
        displayName: 'Arial',
        weights: ['400'],
        styles: ['normal'],
        source: 'system',
      },
    ]
  },
  async loadFont() {
    return { type: 'system' }
  },
}
```

当字体目录里的 `source` 是 `system` 时，`FontManager` 会把它视为已可用字体。Viewer 不会再请求远程资源，也不会注入 `@font-face`。

## 失败处理 {#failure-handling}

单个字体加载失败不会阻止整份文档继续渲染。

```ts
await viewer.open({
  schema,
  data,
  onDiagnostic(event) {
    if (event.code === 'FONT_LOAD_FAILED') {
      console.warn(event.message)
    }
  },
})
```

当前实现会把单个字体失败转换成 warning 级诊断，常见诊断码是 `FONT_LOAD_FAILED`。

如果整个字体加载流程本身抛错，Viewer 会生成 `FONT_LOAD_ERROR`，同样是 warning 级别。

## 共享字体来源 {#shared-provider}

如果你的项目同时使用 Designer 和 Viewer，我们建议把 `FontProvider` 抽成共享模块。

```ts
export const fontProvider: FontProvider = {
  async listFonts() {
    return fontManifest
  },
  async loadFont(family, weight, style) {
    return resolveFontAsset(family, weight, style)
  },
}
```

这样设计态、预览态、打印和导出会使用同一套字体来源。出现分页或宽度差异时，你也能从同一个 provider 开始排查。

关于字体加载，目前知道这些就够用了。诊断事件的完整形状继续看 [诊断系统](./diagnostics)。
