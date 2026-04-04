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
  category?: string
  preview?: string
}

type FontSource = string | ArrayBuffer
```

## 14.2 FontManager

FontManager 是共享基础设施，提供缓存和批量预加载能力。**不含 DOM 操作**，`@font-face` 注入留给 Viewer 运行时或 Designer 预览宿主。

```typescript
class FontManager {
  constructor(provider?: FontProvider)

  get provider(): FontProvider | undefined
  setProvider(provider: FontProvider): void

  listFonts(): Promise<FontDescriptor[]>
  loadFont(family: string, weight?: string, style?: string): Promise<FontSource>
  preloadFonts(families: string[]): Promise<void>
  isLoaded(family: string, weight?: string, style?: string): boolean
  clear(): void
}
```

## 14.3 使用方式

```typescript
const myFontProvider: FontProvider = {
  async listFonts() {
    return [
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
await fontManager.preloadFonts(['SourceHanSans', 'SourceHanSerif'])
```
