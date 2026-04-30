# 20. 性能策略

## 20.1 架构层预留

v1 不做激进的性能优化，但在架构层面为以下优化预留口子：

| 优化方向 | 预留接口 | 触发时机 |
|----------|----------|----------|
| **渲染缓存** | Viewer 渲染管线的 `beforeMaterialRender` 等 Hook 可插入缓存层 | 大量静态元素 |
| **Web Worker** | 布局测量或大数据预处理可移入 Worker | 大模板测量、业务侧装配 |
| **DOM 复用** | Viewer 页面层支持增量刷新而非全量替换 | 频繁数据变化 |

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

