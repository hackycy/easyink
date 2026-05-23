# 字体管理

Designer 内置字体选择和加载流程。宿主只需要提供 `FontProvider`，不需要在外部提前注入 `@font-face`。

## 接入 FontProvider

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { EasyInkDesigner } from '@easyink/designer'
import type { FontProvider } from '@easyink/designer'
import '@easyink/designer/index.css'

const schema = ref({})

const fontProvider: FontProvider = {
  async listFonts() {
    return [
      {
        family: 'SourceHanSans',
        displayName: '思源黑体',
        weights: ['400', '700'],
        styles: ['normal'],
        category: 'sans-serif',
        preview: '字体预览 EasyInk 123',
      },
      {
        family: 'SourceHanSerif',
        displayName: '思源宋体',
        weights: ['400'],
        styles: ['normal'],
        category: 'serif',
        preview: '字体预览 EasyInk 123',
      },
    ]
  },

  async loadFont(family, weight = '400') {
    return `/fonts/${encodeURIComponent(family)}-${weight}.woff2`
  },
}
</script>

<template>
  <EasyInkDesigner
    v-model:schema="schema"
    :font-provider="fontProvider"
  />
</template>
```

`listFonts()` 返回字体目录，FontPicker 会用它展示字体名称、搜索结果、预览文本和加载状态。`loadFont()` 返回 CSS `@font-face` 可使用的 URL 或 `ArrayBuffer`。

## 加载行为

Designer 会在以下时机加载字体：

| 时机 | 行为 |
|------|------|
| 打开模板 / schema 变化 | 预加载当前模板已经引用的字体 |
| `fontProvider` 变化 | 清理旧字体注入状态，并重新加载当前模板引用 |
| 点击 FontPicker 下载按钮 | 只加载对应字体，不改变 schema |
| 选择字体并提交 | 先加载并注入成功，再写入 schema |

字体加载失败不会把失败字体写入模板。属性面板会保留原值，并通过 Designer diagnostics 暴露警告。

## FontPicker 状态

FontPicker 右侧只有一个状态区域：

| 状态 | 显示 |
|------|------|
| 未加载 | 下载按钮 |
| 加载中 | 旋转加载图标 |
| 当前选中 | 勾选图标 |
| 已加载但未选中 | 不显示额外图标 |

这样可以避免“已加载”和“已选中”同时出现两个勾，用户只需要关注当前选择。

## 默认字体

字体选择器顶部会显示“默认”选项。选择默认时，字段值写入空字符串，元素会继承页面或浏览器默认字体。

页面全局字体来自 `schema.page.font`，普通文字元素字体来自 `node.props.fontFamily`，表格/流动行这类整体排版字体来自 `node.props.typography.fontFamily`。Designer 会自动收集这些引用并进行预加载。

## Playground 示例

Playground 的字体示例位于 `playground/src/fonts.ts`：

- 字体文件放在 `playground/public/fonts`
- `listFonts()` 只返回字体 manifest
- `loadFont()` 返回 public 目录下的字体 URL
- 不需要调用额外的 `injectFontFace()` 或手动创建 style

这个模式也适合业务系统：字体文件可以来自 public 目录、CDN、私有文件服务或后端 API，只要 `loadFont()` 返回 URL 或 `ArrayBuffer` 即可。
