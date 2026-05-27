---
description: Designer 样式自定义：通过 CSS 变量覆盖和自定义主题两种方式定制设计器外观。
---

# 样式自定义 {#styling}

Designer 现在没有单独的主题 API，但这不意味着你只能接受默认样式。

当前最稳的定制方式有两种：

- 先覆盖 `--ei-*` CSS 变量。
- 不够时，再覆盖稳定类名。

## CSS 变量 {#css-variables}

这是最推荐的入口，因为影响面清楚，也最不容易被局部结构改动打破。

```css
.designer-host {
  --ei-bg: #fcfbf7;
  --ei-panel-bg: #fffdf7;
  --ei-border-color: #d9d1c2;
  --ei-primary: #0f766e;
  --ei-topbar-bg: #f6f0e4;
  --ei-statusbar-bg: #f6f0e4;
  --ei-canvas-bg: #efe7d7;
}
```

```vue
<template>
  <div class="designer-host">
    <EasyInkDesigner v-model:schema="schema" />
  </div>
</template>
```

只要变量定义在 Designer 的外层容器上，组件主体就会继承到这些颜色和边框设置。

## `body` 变量注入 {#body-variables}

这里有个很容易忽略的细节：Designer 和底层 UI 组件有一部分弹层会通过 Teleport 挂到全局文档里。

如果你的变量只定义在局部容器上，这些弹层可能拿不到对应主题值。

所以当你发现“主体颜色已经变了，但下拉框、对话框或右键菜单还是旧样式”时，优先把主题类挂到 `body` 或 `:root`：

```css
body.easyink-theme {
  --ei-bg: #101418;
  --ei-panel-bg: #161c21;
  --ei-border-color: #2a3640;
  --ei-text: #eef2f4;
  --ei-primary: #44b3a6;
}
```

这通常比继续追具体组件层级更省事。

## 类名覆盖 {#class-overrides}

有些视觉细节并没有完全抽成变量，比如局部阴影、部分容器装饰和少量结构细节。这时再去覆盖类名会更合适。

先看一个例子：

```css
body.easyink-theme .ei-topbar-b {
  backdrop-filter: blur(12px);
}

body.easyink-theme .ei-canvas-paper {
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.18);
}

body.easyink-theme .ei-dialog-overlay {
  background: rgba(0, 0, 0, 0.42);
}
```

这个阶段再出手，会比一开始就全靠类名覆盖稳得多。

## 常用类名 {#common-class-names}

当前 Designer 和 UI 组件里比较值得记住的是这些：

| 类名 | 作用区域 |
| --- | --- |
| `.ei-designer` | 设计器根节点 |
| `.ei-topbar-b` | 顶部工具栏 |
| `.ei-status-bar` | 底部状态栏 |
| `.ei-canvas-workspace` | 画布工作区 |
| `.ei-canvas-paper` | 页面纸张 |
| `.ei-context-menu` | 右键菜单 |
| `.ei-dialog` / `.ei-dialog-overlay` | 对话框和遮罩 |
| `.ei-select__dropdown` | 下拉弹层 |
| `.ei-guide` | 参考线 |
| `.ei-snap-overlay__line` | 吸附线 |

如果你在做局部风格打磨，通常就从这组类名下手。

## `scoped` 样式写法 {#scoped-styles}

如果你的宿主页面是 Vue 单文件组件，覆盖内部类名时通常要用 `:deep(...)`。但变量本身还是可以直接挂在外层容器上。

```vue
<style scoped>
.designer-host {
  --ei-primary: #0f766e;
}

.designer-host :deep(.ei-topbar-b) {
  border-bottom-width: 0;
}
</style>
```

这个组合通常已经足够好用：变量控制整体风格，`:deep` 只做少量结构微调。

## 核心变量 {#core-variables}

如果你不想一次看完整张变量表，先认下面这组就够了：

- `--ei-bg`
- `--ei-panel-bg`
- `--ei-border-color`
- `--ei-text`
- `--ei-primary`
- `--ei-topbar-bg`
- `--ei-statusbar-bg`
- `--ei-canvas-bg`
- `--ei-grid-color`
- `--ei-guide-color`
- `--ei-snap-line-color`

这些变量已经能覆盖大部分主题感知最强的区域。

## 主题变量策略 {#theme-token-strategy}

如果你的产品本身已经有设计 token，最好的做法不是在 EasyInk 外层再写一套独立颜色，而是把 `--ei-*` 映射到你自己的主题变量。

这样切换浅色、深色或品牌主题时，Designer 会自然跟着宿主走，而不是变成系统里的一块孤岛。
