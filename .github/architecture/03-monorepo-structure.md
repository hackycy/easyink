# 3. Monorepo 包结构

采用粗粒度拆分策略（3-5 个核心包），确保关注点分离的同时保持可管理性：

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
│   │   │   ├── elements/      # 内置元素类型定义
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── renderer/              # @easyink/renderer — DOM 渲染器 + 输出适配
│   │   ├── src/
│   │   │   ├── dom/           # DOM 渲染核心
│   │   │   ├── print/         # iframe 隔离打印
│   │   │   ├── pdf/           # PDF 生成管线（可插拔）
│   │   │   ├── image/         # 图片导出
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── designer/              # @easyink/designer — 可视化设计器 Vue 组件
│   │   ├── src/
│   │   │   ├── components/    # 设计器 Vue 组件（画布、工具栏、属性面板...）
│   │   │   ├── composables/   # Vue Composable 封装
│   │   │   ├── interaction/   # 拖拽、对齐、选择、旋转等交互逻辑
│   │   │   ├── panels/        # 属性面板、图层面板、数据源面板
│   │   │   ├── locale/        # 默认中文语言包
│   │   │   ├── theme/         # CSS 变量主题
│   │   │   └── index.ts
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

## 包依赖关系

```
@easyink/shared       ← 无依赖，纯工具与类型
    ↑
@easyink/core         ← 依赖 shared；核心逻辑层
    ↑
@easyink/renderer     ← 依赖 core + shared；渲染输出层
    ↑
@easyink/designer     ← 依赖 core + renderer + shared；完整设计器 UI
```

## 消费方式

- 只需渲染/打印：`npm install @easyink/renderer`（自动引入 core）
- 需要设计器：`npm install @easyink/designer`（自动引入全部）
- 需要操作 Schema：`npm install @easyink/core`
