# 20. 性能策略

## 20.1 架构层预留

v1 不做激进的性能优化，但在架构层面为以下优化预留口子：

| 优化方向 | 预留接口 | 触发时机 |
|----------|----------|----------|
| **渲染缓存** | Viewer 渲染管线的 `beforeMaterialRender` 等 Hook 可插入缓存层 | 大量静态元素 |
| **Web Worker** | 布局测量或大数据预处理可移入 Worker | 大模板测量、业务侧装配 |
| **DOM 复用** | Viewer 页面层支持增量刷新而非全量替换 | 频繁数据变化 |
| **Designer 物料懒加载** | `DesignerMaterial.loadRenderer` 只延迟加载 `DesignerRenderInstance` | 重型设计态渲染器、全量图表库、复杂代码编辑器 |

## 20.2 基本性能目标

| 场景 | 目标 |
|------|------|
| 设计器加载（空模板） | < 500ms |
| 中等模板渲染（50 elements） | < 200ms |
| 大型模板渲染（200 elements） | < 1s |
| 拖拽/缩放交互帧率 | >= 30fps |

## 20.3 选区命中加速（延迟实现）

画布的 marquee 框选与 element-drag 的 snap candidate 收集目前都是 O(N) 全表扫描（见 `use-marquee-select.ts`、`use-element-drag.ts`）。在 v1 的目标场景（≤ 200 elements）下每帧成本可以接受。

阈值：**当单页元素数稳定 > 500 且实测 marquee 拖动帧率掉到 < 30fps 时**，引入 spatial index：

- **首选**：固定网格 hash（cell size ≈ 平均元素宽高的 2 倍）。建表 O(N)，查询 O(k)，无需平衡。
- **次选**：R-tree（需要引入依赖，仅当元素尺寸差异极大时考虑）。

接入点：在 `DesignerStore` 暴露一个 `getElementsIntersecting(rect: Rect): MaterialNode[]`，由 marquee / snap collect / minimap dirty rect 共用。物料几何变更（增删、移动、resize、rotation）必须主动失效相关 cell。

**不在此之前实现**的理由：v1 没有任何线上模板触及阈值；提前实现会引入"网格失效正确性"这条新的 bug 类，得不偿失。

## 20.4 设计器物料懒加载

Designer 完整物料的 `loadRenderer` 只延迟重型设计态实现。共享模型、属性、palette、locale 和 AI 在创建时完整可用，目录和 Assistant 不依赖 renderer chunk。

Store 的 `getDesignerExtension(type)` 在加载时返回 loading 实例。Host consumer 执行受管 loader，并只缓存有效代次的 renderer 实例；成功后更新 `materialExtensionRevision` 使画布重挂载。运行加载失败记录局部诊断，保留 Schema 和声明；销毁后迟到结果不发布。Viewer 的内置实现按所选完整集合静态引用；声明同样允许受管 loader，应用创建后不补注册。

使用边界：

- 适合：完整 ECharts、自定义代码编辑器、复杂设计态交互内核。
- 不适合：只包含普通 DOM 文本、少量 SVG 或轻量渲染函数的物料。
- 懒加载 chunk 内不应包含物料面板必须同步读取的信息，否则会造成点击/拖拽/属性面板先于渲染器加载时状态不完整。
