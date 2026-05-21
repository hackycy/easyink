# 样式自定义

Designer 当前没有单独的运行时主题 API。按照 `packages/designer` 和 `packages/ui` 的实现，样式定制主要通过两种方式完成：

1. 覆写组件样式里使用的 CSS 自定义属性（`--ei-*`）
2. 基于稳定类名做局部样式覆盖

`@easyink/designer/index.css` 是设计器样式入口；同时 `@easyink/designer` 的运行时代码会引入 `@easyink/ui/index.css`，所以 UI 组件和设计器工作台共用同一组主题变量。

## 推荐做法

### 1. 优先使用 CSS 变量改主题色

这是当前最稳定、影响面也最可控的做法。设计器和 UI 组件大量使用了 `var(--ei-xxx, fallback)`，只要宿主覆盖这些变量，就能整体调整配色。

```css
body.easyink-theme-dark {
  --ei-bg: #0f172a;
  --ei-bg-elevated: #111827;
  --ei-panel-bg: #111827;
  --ei-panel-header-bg: #1f2937;
  --ei-input-bg: #0b1220;
  --ei-menu-bg: #111827;
  --ei-border-color: #334155;

  --ei-text: #e5e7eb;
  --ei-text-primary: #f8fafc;
  --ei-text-secondary: #94a3b8;
  --ei-text-tertiary: #64748b;
  --ei-text-disabled: #475569;

  --ei-primary: #60a5fa;
  --ei-primary-hover: #93c5fd;
  --ei-primary-light: rgba(96, 165, 250, 0.16);
  --ei-primary-soft: #1d4ed8;

  --ei-success: #34d399;
  --ei-warning: #fbbf24;
  --ei-error: #f87171;
  --ei-danger: #fb7185;
  --ei-success-color: #34d399;
  --ei-error-color: #f87171;

  --ei-topbar-bg: #111827;
  --ei-statusbar-bg: #0b1220;
  --ei-canvas-bg: #0f172a;
  --ei-grid-color: rgba(148, 163, 184, 0.18);
  --ei-guide-color: #f59e0b;
  --ei-snap-line-color: #f472b6;
  --ei-snap-page-color: #2dd4bf;
  --ei-hidden-border: #94a3b8;
  --ei-deep-edit-border: #60a5fa;
  --ei-deep-edit-shadow: rgba(96, 165, 250, 0.2);
  --ei-code-bg: #0b1220;
}
```

如果你只想对单个嵌入区域生效，也可以把这些变量挂在 Designer 外层容器上：

```vue
<template>
  <div class="designer-host">
    <EasyInkDesigner v-model:schema="schema" />
  </div>
</template>

<style scoped>
.designer-host {
  --ei-bg: #ffffff;
  --ei-panel-bg: #fcfcfd;
  --ei-border-color: #d0d7de;
  --ei-primary: #2563eb;
  --ei-topbar-bg: #f8fafc;
  --ei-statusbar-bg: #f8fafc;
  --ei-canvas-bg: #eef2f7;
}
</style>
```

### 2. 需要覆盖弹层时，优先放在 `body` / `:root`

这一点很重要：

- `BindingSection` 里使用的 `EiDialog` 会 `Teleport` 到 `body`
- `EiSelect` 下拉面板会 `Teleport` 到 `body`
- 画布右键菜单 `CanvasContextMenu` 也会 `Teleport` 到 `body`

因此，如果主题变量只定义在局部容器（例如 `.designer-host`）上，这些弹层**不会继承**对应变量。

如果希望设计器主体、下拉、对话框、右键菜单保持统一主题，建议把变量定义在：

- `:root`
- `body`
- 或者宿主切换到 `body.some-theme` 这样的全局类名

相对地，Contribution 面板默认挂到 `#ei-overlay-root`，它仍然在 `.ei-designer` DOM 树内，局部容器变量可以正常生效。

### 3. 变量不够时，再覆盖类名

当前主题变量已经覆盖了大部分颜色、边框、面板背景、画布网格/参考线/吸附线状态，但仍有少量视觉细节是直接写在组件样式里的，例如：

- 弹层和菜单的阴影
- 对话框遮罩层背景
- 画布纸张阴影

这类需求需要直接覆盖类名。

## 常用类名入口

下面这些类名都直接出现在 `packages/designer` 或 `packages/ui` 组件模板里，适合做局部样式微调：

| 类名 | 作用区域 |
|------|----------|
| `.ei-designer` | 设计器根容器 |
| `.ei-topbar-b` | 顶部工具栏 |
| `.ei-status-bar` | 底部状态栏 |
| `.ei-canvas-workspace` | 画布工作区背景 |
| `.ei-canvas-paper` | 页面纸张容器 |
| `.ei-context-menu` | 画布右键菜单 |
| `.ei-dialog` / `.ei-dialog-overlay` | 对话框与遮罩 |
| `.ei-select__dropdown` | 下拉选择弹层 |
| `.ei-guide` | 参考线 |
| `.ei-snap-overlay__line` | 吸附线 |

示例：

```css
body.easyink-theme-dark .ei-topbar-b {
  backdrop-filter: blur(12px);
}

body.easyink-theme-dark .ei-canvas-paper {
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35);
}

body.easyink-theme-dark .ei-dialog-overlay {
  background: rgba(2, 6, 23, 0.6);
}
```

如果你在 Vue SFC 里使用 `<style scoped>`，那么覆盖 Designer 内部类名时通常需要 `:deep(...)` 或 `:global(...)`，因为设计器内部组件本身使用了 scoped 样式；但**CSS 变量本身**仍然可以直接定义在宿主容器上。

```vue
<style scoped>
.designer-host {
  --ei-primary: #7c3aed;
}

.designer-host :deep(.ei-topbar-b) {
  border-bottom-width: 0;
}
</style>
```

## 主题变量清单

下面的变量名来自当前 `packages/designer` 和 `packages/ui` 源码中的实际引用。

### 基础背景与边框

| 变量 | 主要用途 |
|------|----------|
| `--ei-bg` | 根背景、按钮基础背景等 |
| `--ei-bg-elevated` | 弹层、对话框等浮层背景 |
| `--ei-panel-bg` | 面板主体背景 |
| `--ei-panel-header-bg` | 面板标题栏背景 |
| `--ei-input-bg` | 输入框、下拉触发器背景 |
| `--ei-menu-bg` | 右键菜单背景 |
| `--ei-border-color` | 通用边框色 |
| `--ei-hover-bg` | hover 背景 |
| `--ei-active-bg` | 顶栏按钮激活背景 |

### 文本与主色

| 变量 | 主要用途 |
|------|----------|
| `--ei-text` | 主文本色 |
| `--ei-text-primary` | 强调文本/按钮图标色 |
| `--ei-text-secondary` | 次级说明文本 |
| `--ei-text-tertiary` | 更弱提示文本 |
| `--ei-text-disabled` | 禁用态文本 |
| `--ei-primary` | 主品牌色、选中态、描边 |
| `--ei-primary-hover` | 主按钮 hover 色 |
| `--ei-primary-light` | 顶栏贡献按钮浅色背景 |
| `--ei-primary-soft` | 轻量主色提示态 |

### 状态色

| 变量 | 主要用途 |
|------|----------|
| `--ei-success` | 成功状态、绑定标记等 |
| `--ei-warning` | 警告状态 |
| `--ei-error` | 错误状态 |
| `--ei-danger` | 危险操作、删除态、锁定选区描边 |
| `--ei-success-color` | 数据源拖放命中成功高亮 |
| `--ei-error-color` | 数据源拖放失败高亮 |

### 设计器专属区域

| 变量 | 主要用途 |
|------|----------|
| `--ei-topbar-bg` | 顶栏背景 |
| `--ei-statusbar-bg` | 状态栏背景 |
| `--ei-canvas-bg` | 画布工作区背景 |
| `--ei-grid-color` | 网格线颜色 |
| `--ei-guide-color` | 参考线颜色 |
| `--ei-snap-line-color` | 吸附线颜色 |
| `--ei-snap-page-color` | 页边吸附线颜色 |
| `--ei-hidden-border` | 隐藏元素虚线边框 |
| `--ei-deep-edit-border` | 深度编辑态轮廓线 |
| `--ei-deep-edit-shadow` | 深度编辑态外发光 |
| `--ei-code-bg` | 绑定表达式编辑器背景 |

## 一个实践建议

如果你的产品有完整主题系统，建议把 EasyInk 的 `--ei-*` 变量映射到你自己的设计 token，而不是在多个页面里分别写死颜色值。这样切浅色 / 深色主题时，Designer 可以跟随宿主应用一起切换。
