import type { FontDescriptor, FontProvider } from '@easyink/designer'

interface PlaygroundFileFontDescriptor extends FontDescriptor {
  fileName: string
}

type PlaygroundFontDescriptor = FontDescriptor | PlaygroundFileFontDescriptor

const playgroundFonts: PlaygroundFontDescriptor[] = [
  {
    family: 'system-ui',
    displayName: '系统界面字体',
    weights: ['400', '500', '600', '700'],
    styles: ['normal'],
    source: 'system',
    category: 'sans-serif',
    preview: '字体预览 EasyInk 123',
  },
  {
    family: 'Arial',
    displayName: 'Arial',
    weights: ['400', '700'],
    styles: ['normal', 'italic'],
    source: 'system',
    category: 'sans-serif',
    preview: 'Font preview EasyInk 123',
  },
  {
    family: 'Microsoft YaHei',
    displayName: '微软雅黑',
    weights: ['400', '700'],
    styles: ['normal'],
    source: 'system',
    category: 'sans-serif',
    preview: '字体预览 EasyInk 123',
  },
  {
    family: 'SimSun',
    displayName: '宋体',
    weights: ['400'],
    styles: ['normal'],
    source: 'system',
    category: 'serif',
    preview: '字体预览 EasyInk 123',
  },
  {
    family: 'Times New Roman',
    displayName: 'Times New Roman',
    weights: ['400', '700'],
    styles: ['normal', 'italic'],
    source: 'system',
    category: 'serif',
    preview: 'Font preview EasyInk 123',
  },
  {
    family: 'Georgia',
    displayName: 'Georgia',
    weights: ['400', '700'],
    styles: ['normal', 'italic'],
    source: 'system',
    category: 'serif',
    preview: 'Font preview EasyInk 123',
  },
  {
    family: 'Courier New',
    displayName: 'Courier New',
    weights: ['400', '700'],
    styles: ['normal', 'italic'],
    source: 'system',
    category: 'monospace',
    preview: 'Font preview EasyInk 123',
  },
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
      source: font.source,
      category: font.category,
      preview: font.preview,
    }))
  },

  async loadFont(fontFamily: string) {
    const font = playgroundFonts.find(item => item.family === fontFamily)
    if (!font || !isFileFont(font))
      throw new Error(`Unknown playground font: ${fontFamily}`)
    return fontUrl(font.fileName)
  },
}

function isFileFont(font: PlaygroundFontDescriptor): font is PlaygroundFileFontDescriptor {
  return 'fileName' in font
}

function fontUrl(fileName: string): string {
  return `${import.meta.env.BASE_URL}fonts/${encodeURIComponent(fileName)}`
}
