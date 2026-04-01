# 3. Monorepo 包结构

采用**基础包粗粒度 + 物料包细粒度**的混合拆分策略。基础设施包（core/renderer/designer/ui/shared）保持粗粒度，每种物料类型独立成包，实现物料的独立开发、按需引入和第三方扩展。

```
easyink/
├── packages/
│   ├── core/                  # @easyink/core — 框架无关的核心引擎
│   │   ├── src/
│   │   │   ├── schema/        # Schema 定义、校验、操作
│   │   │   ├── engine/        # 布局引擎
│   │   │   ├── expression/    # 表达式沙箱、可插拔引擎接口
│   │   │   ├── plugin/        # 插件系统、钩子体系
│   │   │   ├── command/       # Command 模式、撤销/重做栈
│   │   │   ├── datasource/    # 数据源注册、扁平字段解析
│   │   │   ├── units/         # 单位系统、转换工具
│   │   │   ├── materials/     # MaterialRegistry + 基础类型（不含内置物料定义）
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── renderer/              # @easyink/renderer — DOM 渲染器 + 输出适配
│   │   ├── src/
│   │   │   ├── dom/           # DOM 渲染核心 + MaterialRendererRegistry
│   │   │   ├── print/         # iframe 隔离打印
│   │   │   ├── pdf/           # PDF 生成管线（可插拔）
│   │   │   ├── image/         # 图片导出
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── designer/              # @easyink/designer — 可视化设计器 Vue 组件
│   │   ├── src/
│   │   │   ├── components/    # 设计器 Vue 组件（画布、物料栏、属性面板...）
│   │   │   ├── composables/   # Vue Composable 封装
│   │   │   ├── interaction/   # InteractionStrategyRegistry + 基础设施
│   │   │   ├── panels/        # 属性面板、图层面板、数据源面板
│   │   │   ├── locale/        # 默认中文语言包
│   │   │   ├── theme/         # CSS 变量主题
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── materials/             # 物料独立包目录（每种物料一个包）
│   │   ├── text/              # @easyink/material-text
│   │   │   ├── src/
│   │   │   │   ├── index.ts          # 统一导出
│   │   │   │   ├── definition.ts     # MaterialTypeDefinition（框架无关）
│   │   │   │   ├── props.ts          # PropSchema[]
│   │   │   │   ├── render.ts         # MaterialRenderFunction（DOM 层）
│   │   │   │   └── interaction.ts    # InteractionStrategy（Vue/Designer 层）
│   │   │   ├── package.json
│   │   │   └── tsconfig.json
│   │   ├── rich-text/         # @easyink/material-rich-text
│   │   ├── image/             # @easyink/material-image
│   │   ├── rect/              # @easyink/material-rect
│   │   ├── line/              # @easyink/material-line
│   │   ├── barcode/           # @easyink/material-barcode
│   │   ├── data-table/        # @easyink/material-data-table
│   │   └── table/             # @easyink/material-table
│   │
│   ├── ui/                    # @easyink/ui — 内部 UI 组件库
│   │   ├── src/
│   │   │   ├── components/    # 表单编辑器组件（Input/Select/ColorPicker/Switch...）
│   │   │   ├── styles/        # 统一样式规范（CSS 变量主题）
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── icons/                 # @easyink/icons — Iconify 图标打包（离线）
│   │   └── package.json
│   │
│   └── shared/                # @easyink/shared — 共享工具与类型
│       ├── src/
│       │   ├── types/         # 公共 TypeScript 类型
│       │   ├── utils/         # 通用工具函数
│       │   └── index.ts
│       └── package.json
│
├── playground/                # 开发 playground（Vite 应用）
├── examples/                  # 使用示例
├── docs/                      # 文档站点
└── e2e/                       # E2E 测试
```

### 物料包内部结构（以 `@easyink/material-text` 为例）

每个物料包采用**三层子路径导出**，确保各层只引入所需依赖：

```
packages/materials/text/
├── src/
│   ├── index.ts              # 统一导出（定义 + props）
│   ├── definition.ts         # MaterialTypeDefinition（核心元信息）
│   ├── props.ts              # PropSchema[]（属性 Schema 定义）
│   ├── render.ts             # MaterialRenderFunction（DOM 渲染函数）
│   └── interaction.ts        # InteractionStrategy（设计器交互策略）
├── package.json
├── tsconfig.json
└── tsdown.config.ts
```

**package.json exports 配置：**

```jsonc
{
  "name": "@easyink/material-text",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "types": "./dist/index.d.mts"
    },
    "./render": {
      "import": "./dist/render.mjs",
      "types": "./dist/render.d.mts"
    },
    "./designer": {
      "import": "./dist/interaction.mjs",
      "types": "./dist/interaction.d.mts"
    }
  },
  "dependencies": {
    "@easyink/core": "workspace:*",
    "@easyink/shared": "workspace:*"
  },
  "peerDependencies": {
    "@easyink/renderer": "workspace:*",
    "@easyink/designer": "workspace:*"
  },
  "peerDependenciesMeta": {
    "@easyink/renderer": { "optional": true },
    "@easyink/designer": { "optional": true }
  }
}
```

**三层导出说明：**

| 导出路径 | 内容 | 依赖 | 使用场景 |
|---------|------|------|---------|
| `@easyink/material-text` | MaterialTypeDefinition + PropSchema[] | core + shared | 只需 Schema 操作 |
| `@easyink/material-text/render` | MaterialRenderFunction | core + shared + renderer | 需要渲染/打印 |
| `@easyink/material-text/designer` | InteractionStrategy | core + shared + designer + ui | 设计器交互 |

### pnpm-workspace.yaml

```yaml
packages:
  - playground
  - docs
  - packages/*
  - packages/materials/*
  - examples/*
```

## 包依赖关系

```
@easyink/shared           ← 无依赖，纯工具与类型
    ↑
@easyink/core             ← 依赖 shared；核心逻辑层（含 MaterialRegistry，不含内置物料）
    ↑
@easyink/renderer         ← 依赖 core + shared；渲染输出层（含 MaterialRendererRegistry）
    ↑
@easyink/ui               ← 依赖 shared；内部 UI 组件库（不对外导出）
    ↑
@easyink/designer         ← 依赖 core + renderer + ui + shared；设计器 UI（含 InteractionStrategyRegistry）

@easyink/icons            ← 独立包；Iconify 离线图标数据

@easyink/material-*       ← 物料独立包（每种物料一个包）
    依赖: core + shared
    可选 peer: renderer（render 子路径）、designer（designer 子路径）
    注意: core/renderer/designer 不依赖 material-*，避免循环依赖
```

**依赖方向（单向，无循环）：**

```
            shared
              ↑
            core  ←────────────── material-* (definition + props)
              ↑                         ↑ (render 子路径 peer dep)
           renderer ←──────────── material-*/render
              ↑                         ↑ (designer 子路径 peer dep)
  ui ──→ designer ←──────────── material-*/designer
              ↑
           icons
```

## 消费方式

```typescript
// 1. 只需渲染/打印（按需引入物料）
import { createRenderer } from '@easyink/renderer'
import { textDefinition } from '@easyink/material-text'
import { textRender } from '@easyink/material-text/render'

// 2. 需要设计器（按需引入物料 + 交互策略）
import { createDesigner } from '@easyink/designer'
import { textDefinition } from '@easyink/material-text'
import { textRender } from '@easyink/material-text/render'
import { textInteraction } from '@easyink/material-text/designer'

// 3. 只需操作 Schema
import { MaterialRegistry } from '@easyink/core'
import { textDefinition } from '@easyink/material-text'
```

- `@easyink/ui` 和 `@easyink/icons` 为内部包，对外发布但不公开文档
- 物料包对外发布，支持第三方按需安装
