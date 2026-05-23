# 字体加载

Viewer 会在渲染前加载模板引用的字体，并把 `@font-face` 注入到 Viewer host 对应的 document。宿主只需要传入 `fontProvider`。

## 基本用法

```ts
import { createIframeViewerHost, createViewer } from '@easyink/viewer'
import type { FontProvider } from '@easyink/viewer'

const host = createIframeViewerHost(iframeElement)

const fontProvider: FontProvider = {
  async listFonts() {
    return [
      {
        family: 'SourceHanSans',
        displayName: '思源黑体',
        weights: ['400'],
        styles: ['normal'],
        preview: '字体预览 EasyInk 123',
      },
    ]
  },

  async loadFont(family) {
    return `/fonts/${encodeURIComponent(family)}.woff2`
  },
}

const viewer = createViewer({
  host,
  fontProvider,
})

await viewer.open({
  schema,
  data,
})
```

## 渲染时机

Viewer 的渲染流程是：

1. 收集 `schema.page.font` 和元素 `props.fontFamily`
2. 加载并注入字体
3. 解析数据绑定
4. 测量元素
5. 执行 layout / reflow / pagination
6. 渲染页面 DOM

字体加载在测量和分页之前完成，因为文本宽度、行高和分页结果都可能受字体影响。

## Host 注入目标

| Host | 字体注入位置 |
|------|--------------|
| Browser Host | 当前页面 document |
| Iframe Host | iframe document |
| Custom Host | 自定义 host 提供的 document |

如果 Viewer 渲染在 iframe 中，不需要在父页面手动注入字体；Viewer 会把字体注入 iframe 内部。

## 失败诊断

字体加载失败不会阻止整份文档渲染。Viewer 会发出 warning 级别诊断：

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

常见 code：

| code | 说明 |
|------|------|
| `FONT_LOAD_FAILED` | 单个字体加载失败 |
| `FONT_LOAD_ERROR` | 字体加载阶段出现非预期错误 |

## 与 Designer 共用 provider

Designer 和 Viewer 使用同一个 `FontProvider` 约定。推荐把业务字体 manifest 写成一个独立模块，然后同时传给 Designer 和 Viewer：

```ts
export const fontProvider: FontProvider = {
  async listFonts() {
    return fontManifest
  },
  async loadFont(family) {
    return resolveFontUrl(family)
  },
}
```

这样设计态、预览态、打印和导出都能使用同一套字体来源，避免“设计器可见但预览缺字”的问题。
