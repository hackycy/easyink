# 字体管理

Designer 的字体链路已经帮你做了大部分脏活。宿主真正要做的，是提供一份字体目录，以及一个“如何加载字体文件”的方法。

## 先给一个 `FontProvider`

```ts
import type { FontProvider } from '@easyink/designer'

const fontProvider: FontProvider = {
  async listFonts() {
    return [
      {
        family: 'system-ui',
        displayName: '系统界面字体',
        weights: ['400', '700'],
        styles: ['normal'],
        source: 'system',
        preview: 'EasyInk Font Preview',
      },
      {
        family: 'SourceHanSans',
        displayName: '思源黑体',
        weights: ['400', '700'],
        styles: ['normal'],
        preview: 'EasyInk Font Preview',
      },
    ]
  },
  async loadFont(fontFamily, weight, style) {
    return `/fonts/${encodeURIComponent(fontFamily)}-${weight ?? '400'}-${style ?? 'normal'}.woff2`
  },
}
```

```vue
<EasyInkDesigner
  v-model:schema="schema"
  :font-provider="fontProvider"
/>
```

上面这段代码已经覆盖了 `FontProvider` 真实接口要求：

- `listFonts()` 返回字体目录。
- `loadFont()` 返回字体资源，可以是 URL，也可以是 `ArrayBuffer`。

## `source: 'system'` 是干什么的

如果某个字体本来就由系统提供，你可以把它标成系统字体。

```ts
{
  family: 'system-ui',
  displayName: '系统界面字体',
  weights: ['400'],
  styles: ['normal'],
  source: 'system',
}
```

这样 Designer 在处理它时，会把它当成“已经存在的字体来源”，而不是再去请求一份外部字体文件。

## Designer 会在什么时候加载字体

当前实现里，字体服务会围着模板变化和字体选择做两类事情：

- 当模板或 `fontProvider` 变化时，重新检查模板里已经引用的字体。
- 当用户明确选择某个字体时，先确保字体加载成功，再把值写回模板。

这个顺序很重要。它避免了“模板里写进了一个其实没加载成功的字体名”。

## 失败了会怎样

字体加载失败不会直接让 Designer 崩掉，也不会把失败字体静默写进模板。

当前实现会做两件事：

- 保留原有值，不强行写入失败结果。
- 通过 diagnostics 发出一条 `source: 'font'` 的警告。

这对业务来说通常是更合理的默认行为。你可以继续编辑模板，同时把问题交给宿主日志或提示系统去处理。

## 你不需要手动注入 `@font-face`

这是最值得省心的一点。

Designer 内部已经有 `FontManager` 和字体服务来负责缓存、加载状态和注入目标。只要 `loadFont()` 能返回可用资源，宿主就不需要再写一套重复的样式注入逻辑。

## 一个很实用的组织方式

如果你的项目同时用了 Designer 和 Viewer，最稳的做法是把 `fontProvider` 提成一个共享模块。

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

这样设计态和预览态会使用同一套字体来源，不容易出现“Designer 里看得到，Viewer 里又缺字”的情况。

关于字体管理，目前先知道这些就够用了。继续深入时，可以再看 [Viewer 字体加载](/viewer/fonts)。
