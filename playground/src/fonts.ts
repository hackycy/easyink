import type { FontDescriptor, FontProvider } from '@easyink/designer'

interface PlaygroundFontDescriptor extends FontDescriptor {
  fileName: string
}

const playgroundFonts: PlaygroundFontDescriptor[] = [
  {
    family: 'ZCOOL KuaiLe',
    displayName: '站酷快乐体',
    fileName: '站酷快乐体.ttf',
    weights: ['400'],
    styles: ['normal'],
    category: 'display',
    preview: '字体预览 EasyInk 123',
  },
  {
    family: 'ZCOOL KuHei',
    displayName: '站酷酷黑体',
    fileName: '站酷酷黑体.ttf',
    weights: ['400'],
    styles: ['normal'],
    category: 'display',
    preview: '字体预览 EasyInk 123',
  },
  {
    family: 'ZCOOL QingKe HuangYou',
    displayName: '站酷庆科黄油体',
    fileName: '站酷庆科黄油体.ttf',
    weights: ['400'],
    styles: ['normal'],
    category: 'display',
    preview: '字体预览 EasyInk 123',
  },
]

export const playgroundFontProvider: FontProvider = {
  async listFonts() {
    return playgroundFonts.map(font => ({
      family: font.family,
      displayName: font.displayName,
      weights: font.weights,
      styles: font.styles,
      category: font.category,
      preview: font.preview,
    }))
  },

  async loadFont(fontFamily: string) {
    const font = playgroundFonts.find(item => item.family === fontFamily)
    if (!font)
      throw new Error(`Unknown playground font: ${fontFamily}`)
    return fontUrl(font.fileName)
  },
}

function fontUrl(fileName: string): string {
  return `${import.meta.env.BASE_URL}fonts/${encodeURIComponent(fileName)}`
}
