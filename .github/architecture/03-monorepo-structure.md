# 3. Monorepo 包结构

采用**框架层 + 物料层**拆分策略：4 个核心框架包 + N 个内置物料包，确保关注点分离的同时保持可管理性：

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
│   │   │   ├── elements/      # 元素类型接口 + 注册中心（不含内置定义）
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── renderer/              # @easyink/renderer — DOM 渲染器 + 输出适配
│   │   ├── src/
│   │   │   ├── dom/           # DOM 渲染核心
│   │   │   ├── print/         # iframe 隔离打印
│   │   │   ├── pdf/           # PDF 生成管线（可插拔）
│   │   │   ├── image/         # 图片导出
│   │   │   └── index.ts       # 自动注册所有内置物料的 headless 层
│   │   └── package.json       # dependencies 包含所有 @easyink/material-*
│   │
│   ├── designer/              # @easyink/designer — 可视化设计器 Vue 组件
│   │   ├── src/
│   │   │   ├── components/    # 设计器 Vue 组件（画布、工具栏、属性面板...）
│   │   │   ├── composables/   # Vue Composable 封装
│   │   │   ├── interaction/   # 拖拽、对齐、选择、旋转等交互逻辑
│   │   │   ├── behavior/      # DesignerBehavior 原语解释器
│   │   │   ├── panels/        # 属性面板、图层面板、数据源面板
│   │   │   ├── locale/        # 默认中文语言包
│   │   │   ├── theme/         # CSS 变量主题
│   │   │   └── index.ts       # 自动注册所有内置物料的完整层（headless + designer）
│   │   └── package.json       # dependencies 包含所有 @easyink/material-*
│   │
│   ├── shared/                # @easyink/shared — 共享工具与类型
│   │   ├── src/
│   │   │   ├── types/         # 公共 TypeScript 类型
│   │   │   ├── utils/         # 通用工具函数
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── materials/             # 内置物料包集合（由 renderer/designer 统一引入）
│       ├── shared/            # @easyink/material-shared — 物料层共享组件/类型/工具
│       │   ├── src/
│       │   │   ├── components/  # 共用 overlay 组件（ColumnResizeOverlay 等）
│       │   │   ├── types/       # 共享类型（TableBorderConfig 等）
│       │   │   └── utils/       # 共享工具（列宽计算、border 合并等）
│       │   └── package.json
│       ├── text/              # @easyink/material-text
│       │   ├── src/
│       │   │   ├── headless/  # ElementTypeDefinition + Props 类型 + 渲染函数
│       │   │   └── designer/  # 设计器 Vue 组件 + Behavior 声明 + 自定义编辑器
│       │   └── package.json   # 两个 subpath exports: ./headless ./designer
│       ├── rich-text/         # @easyink/material-rich-text
│       ├── image/             # @easyink/material-image
│       ├── rect/              # @easyink/material-rect
│       ├── line/              # @easyink/material-line
│       ├── barcode/           # @easyink/material-barcode
│       ├── data-table/        # @easyink/material-data-table（依赖 material-shared）
│       └── table/             # @easyink/material-table（依赖 material-shared）
│
├── playground/                # 开发 playground（Vite 应用）
├── examples/                  # 使用示例
├── docs/                      # 文档站点
└── e2e/                       # E2E 测试
```

## 包依赖关系

```
@easyink/shared           ← 无依赖，纯工具与类型
    |
@easyink/core             <- 依赖 shared；核心逻辑层（含元素注册中心，不含内置元素）
    |
@easyink/material-shared  <- 依赖 core + shared；物料层共享组件/类型/工具
    |
@easyink/material-*       <- 依赖 core + shared（headless 层）；可选依赖 vue + material-shared（designer 层）
    |
@easyink/renderer         <- 依赖 core + shared + 所有 material-*；自动注册 headless 层
    |
@easyink/designer         ← 依赖 core + renderer + shared + 所有 material-*；自动注册完整层
```

### 物料包依赖规则

内置物料包作为 `@easyink/renderer` 和 `@easyink/designer` 的 `dependencies`，消费方无需单独安装：

```jsonc
// @easyink/material-text/package.json
{
  "name": "@easyink/material-text",
  "exports": {
    "./headless": "./dist/headless.js",    // definition + renderer（无 Vue 依赖）
    "./designer": "./dist/designer.js"     // Vue 组件 + Behavior + 编辑器
  },
  "dependencies": {
    "@easyink/core": "workspace:*",
    "@easyink/shared": "workspace:*"
  },
  "peerDependencies": {
    "vue": "^3"                            // 仅 designer 子路径需要
  },
  "peerDependenciesMeta": {
    "vue": { "optional": true }
  }
}

// @easyink/renderer/package.json（节选）
{
  "dependencies": {
    "@easyink/core": "workspace:*",
    "@easyink/shared": "workspace:*",
    "@easyink/material-text": "workspace:*",
    "@easyink/material-image": "workspace:*",
    "@easyink/material-rect": "workspace:*",
    "@easyink/material-line": "workspace:*",
    "@easyink/material-barcode": "workspace:*",
    "@easyink/material-rich-text": "workspace:*",
    "@easyink/material-data-table": "workspace:*",
    "@easyink/material-table": "workspace:*"
  }
}

// @easyink/designer/package.json（节选）
{
  "dependencies": {
    "@easyink/core": "workspace:*",
    "@easyink/renderer": "workspace:*",
    "@easyink/shared": "workspace:*",
    "@easyink/material-text": "workspace:*",
    "@easyink/material-image": "workspace:*",
    // ... 同上所有 material-*
  }
}
```

## 消费方式

- 只需渲染/打印：`npm install @easyink/renderer`
  - 自动包含所有内置物料的 headless 部分（definition + 渲染函数），无需手动安装或注册
- 需要设计器：`npm install @easyink/designer`
  - 自动包含所有内置物料的完整部分（headless + 设计器组件 + 行为声明）
- 需要操作 Schema：`npm install @easyink/core`
- 需要第三方自定义物料：安装第三方物料包后通过 `useMaterial()` 注册
