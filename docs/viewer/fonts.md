# 字体加载

Viewer 的字体链路和 Designer 是同一套约定。你提供 `FontProvider`，Viewer 负责在渲染前把模板里用到的字体加载好，并注入到当前 Host 对应的文档环境里。

## 先看用法

```ts
import { createViewer } from '@easyink/viewer'
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
  async loadFont(family) {
    return `/fonts/${encodeURIComponent(family)}.woff2`
  },
}

const viewer = createViewer({
  iframe: iframeElement,
  fontProvider,
})
```

这个接口和 Designer 是一致的，所以你完全可以把两边共用同一个 provider。

## 字体为什么要在渲染前加载

因为字体会直接影响测量结果。

Viewer 在正式渲染前，会先收集模板里引用到的字体，再通过 `loadAndInjectFonts()` 把这些字体加载并注入到当前目标文档里。只有这一步完成后，它才继续做后面的绑定、测量、布局和分页。

如果你看到分页结果和字体有关，这不是巧合，而是设计使然。

## 字体会注入到哪里

这取决于你用的 Host：

- Browser Host：注入当前页面的 `document`
- Iframe Host：注入 iframe 的 `document`
- Custom Host：注入你提供的 `document` 或 `ShadowRoot`

所以如果你用的是 iframe 模式，不需要在父页面再额外注入一次字体样式。

## `source: 'system'` 会发生什么

系统字体不会被当成远程资源重复加载。

这意味着如果 `FontDescriptor` 标成了系统字体，Viewer 会把它当作可直接使用的字体来源，而不是强制再走一次资源请求和注入流程。

## 失败了会不会直接中断渲染

不会。

当前实现里，单个字体加载失败会生成一条 warning 级别诊断事件，但不会阻止整份文档继续渲染。

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

当前字体加载失败的常见诊断码是 `FONT_LOAD_FAILED`。

## 一个够用的接入建议

如果你的项目同时使用 Designer 和 Viewer，最稳的方式还是把字体目录和加载器抽成共享模块。

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

这样设计态、预览态、打印和导出都会用同一套字体来源，不容易出现前后表现不一致的问题。
