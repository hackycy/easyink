# 14. 字体管理

## 14.1 FontProvider 接口

核心不关心字体的存储和加载细节，通过 FontProvider 接口解耦。当前字体管理主要服务 Viewer 渲染和设计器预览，不承担字体文件托管或离线缓存职责。

```typescript
interface FontProvider {
  /** 获取可用字体列表 */
  listFonts: () => Promise<FontDescriptor[]>

  /**
   * 加载字体资源
   * @returns CSS @font-face 所需的 font source（URL 或 ArrayBuffer）
   */
  loadFont: (fontFamily: string, weight?: string, style?: string) => Promise<FontSource>
}

interface FontDescriptor {
  family: string
  displayName: string
  weights: string[]
  styles: string[]
  source?: 'provider' | 'system'
  category?: string
  preview?: string
}

type FontSource = string | ArrayBuffer | { type: 'system' }
```

`source` 默认为 `provider`，表示需要通过 `loadFont()` 获取 URL 或 `ArrayBuffer` 并注入 `@font-face`。浏览器或操作系统已提供的字体应标记为 `source: 'system'`，FontManager 会把它视为已加载，不调用 provider 的 `loadFont()`，也不注入 `@font-face`。

## 14.2 FontManager

FontManager 是共享基础设施，负责字体目录缓存、加载状态、加载失败记录、批量预加载，以及可选的 `@font-face` 注入。字体文件来源仍由宿主的 `FontProvider` 决定；Designer 和 Viewer 不要求外部手动注入字体。

FontManager 的 DOM 注入是受控能力，而不是散落在应用层的副作用：

- `loadFont()` 只加载并缓存字体资源，不注入 DOM。
- `ensureFontLoaded(request, target)` 加载成功后，把 `@font-face` 注入到指定 `Document` 或 `ShadowRoot`。
- `source: 'system'` 的字体不需要资源加载或 DOM 注入，状态直接为 loaded。
- `setProvider()` / `clear()` 会清理该 FontManager 实例注入过的 style，避免 provider/source 更新后继续使用旧字体。
- provider 切换期间未完成的加载请求会失效，不会把旧 source 写入缓存或注入页面。
- 同一个 target、family、weight、style 只注入一次。

```typescript
interface FontLoadRequest {
  family: string
  weight?: string
  style?: string
}

interface FontLoadFailure extends FontLoadRequest {
  message: string
  cause: unknown
}

interface FontBatchLoadResult {
  loaded: Array<FontLoadRequest & { source: FontSource }>
  failures: FontLoadFailure[]
}

type FontLoadStatus = 'unloaded' | 'loading' | 'loaded' | 'error'

interface FontLoadState extends FontLoadRequest {
  status: FontLoadStatus
  message?: string
  cause?: unknown
}

interface FontPreloadResult {
  loadedFamilies: string[]
  failures: FontLoadFailure[]
}

interface FontBatchLoadOptions {
  onFailure?: (failure: FontLoadFailure) => void
  logFailures?: boolean
}

class FontManager {
  constructor(provider?: FontProvider)

  get provider(): FontProvider | undefined
  setProvider(provider?: FontProvider): void

  listFonts(): Promise<FontDescriptor[]>
  loadFont(family: string, weight?: string, style?: string): Promise<FontSource>
  ensureFontLoaded(request: FontLoadRequest, target?: Document | ShadowRoot): Promise<FontLoadSuccess>
  loadFonts(requests: FontLoadRequest[], options?: FontBatchLoadOptions): Promise<FontBatchLoadResult>
  preloadFonts(families: string[], options?: FontBatchLoadOptions): Promise<FontPreloadResult>
  isLoaded(family: string, weight?: string, style?: string): boolean
  getLoadState(family: string, weight?: string, style?: string): FontLoadState
  clear(): void
}
```

`preloadFonts` 仍然保持“单个字体失败不阻断整批”的语义，但不再静默吞错：默认会输出告警，也可以通过返回值或 `onFailure` 显式接住失败明细。`loadFonts()` / `preloadFonts()` 不传 target 时只加载资源，不做 DOM 注入；Designer/Viewer 的运行时会在合适的目标 document 上调用 `ensureFontLoaded()`。

## 14.3 字体发现

模板字体引用由 `collectFontFamilies(schema, profile)` 收集。收集范围包括：

- `schema.page.font`
- 物料 adapter introspection 声明的 `kind: 'font'` resource（例如文本物料的 `/model/fontFamily`）
- `walkMaterialNodes(schema, profile, visitor)` 访问到的 slot 子节点与物料私有结构

不要在 Viewer 或 Designer 侧各自手写递归逻辑；私有 model 中的字体与 hosted node 必须由 manifest adapter introspection 声明，core 通过 profile 驱动的 material graph traversal 统一收集。

## 14.4 Designer 字体策略

Designer 通过 `fontProvider` prop 接入宿主字体目录。属性面板的 FontPicker 展示 provider 返回的字体列表，并提供默认项、搜索、预览文本和按需加载按钮。

设计器的加载时机：

- 初始化或 schema/provider/target 变化时，预加载当前文档已经引用的字体。
- 用户点击字体项右侧加载按钮时，只加载该字体，不改变 schema。
- 用户提交字体选择时，先确保字体加载和注入成功，再写入 schema。
- 字体 preview 不直接污染 schema；加载失败会保留原值并写入诊断。
- 预加载使用 generation guard，旧 schema/provider 的异步结果不会覆盖新状态。

FontPicker 的状态展示是单一状态槽：加载中、可加载、已选中互斥显示，避免同时出现多个勾选/下载状态。

系统字体不会显示按需加载按钮；它们直接使用浏览器 CSS 字体匹配机制渲染。

## 14.5 Viewer 字体策略

Viewer 通过 `createViewer({ fontProvider })` 接入同一个 FontProvider 约定。每次 render 的前序阶段会：

1. 调用 `collectFontFamilies(schema)` 收集当前模板引用。
2. 对每个字体调用 `fontManager.ensureFontLoaded({ family }, host.document)`。
3. 对 provider 字体将 `@font-face` 注入 Viewer host 的 document 或 shadow root；系统字体跳过注入。
4. 字体失败以 `FONT_LOAD_FAILED` 诊断暴露，不阻断整份文档渲染。

Viewer 需要在测量和分页前完成字体加载，因为文本宽高、表格行高、分页结果都可能受字体影响。iframe host 会把字体注入 iframe document；browser/custom host 则注入对应 host document。

## 14.6 使用方式

```typescript
const myFontProvider: FontProvider = {
  async listFonts() {
    return [
      { family: 'system-ui', displayName: '系统界面字体', weights: ['400', '700'], styles: ['normal'], source: 'system' },
      { family: 'SourceHanSans', displayName: '思源黑体', weights: ['400', '700'], styles: ['normal'] },
      { family: 'SourceHanSerif', displayName: '思源宋体', weights: ['400', '700'], styles: ['normal'] },
    ]
  },
  async loadFont(family) {
    return `https://my-cdn.com/fonts/${family}.woff2`
  },
}

const fontManager = new FontManager(myFontProvider)

const fonts = await fontManager.listFonts()
const preload = await fontManager.preloadFonts(['SourceHanSans', 'SourceHanSerif'])

if (preload.failures.length > 0) {
  console.warn('font preload failures', preload.failures)
}
```

在 Designer 中：

```vue
<script setup lang="ts">
import { EasyInkDesigner } from '@easyink/designer'
import type { FontProvider } from '@easyink/designer'

const fontProvider: FontProvider = {
  async listFonts() {
    return [
      {
        family: 'SourceHanSans',
        displayName: '思源黑体',
        weights: ['400', '700'],
        styles: ['normal'],
        preview: '字体预览 EasyInk 123',
      },
    ]
  },
  async loadFont(family) {
    return `/fonts/${family}.woff2`
  },
}
</script>

<template>
  <EasyInkDesigner :font-provider="fontProvider" />
</template>
```

在 Viewer 中：

```ts
const viewer = createViewer({
  host,
  fontProvider,
})
```

宿主只需要提供字体清单和加载方式，不需要提前创建 `<style>` 或手写 `@font-face`。
