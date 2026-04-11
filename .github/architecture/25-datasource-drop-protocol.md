# 25 - 物料驱动的数据源展示控制与拖拽绑定协议

> 日期: 2026-04-11 | 状态: v1 | 依赖: 08-datasource, 11-material-extension, 23-table-v2-redesign, 24-dynamic-property-panel

## 25.1 动机

| 问题 | 原因 |
|------|------|
| 表格选中时 PropertiesPanel 显示 BindingSection 产生误导 | 表格绑定粒度是**单元格**而非元素级 |
| table-static 不支持从 DataSourcePanel 拖拽绑定 | `use-datasource-drop` 只硬编码了 table-data |
| `use-datasource-drop` 中 `isTableDataNode` 硬编码不可扩展 | chart/container 未来也需要自定义 drop 行为 |
| 拖拽悬停无视觉反馈 | 既有实现无 drop zone 高亮机制 |

## 25.2 面板 Section 动态过滤

### 25.2.1 sectionFilter 声明

`MaterialDefinition` 新增可选字段：

```
sectionFilter?: (sectionId: PanelSectionId, context: SectionFilterContext) => boolean
```

- `PanelSectionId = 'geometry' | 'props' | 'overlay' | 'binding' | 'visibility'`
- `SectionFilterContext = { node: MaterialNode, deepEditing: DeepEditingRuntimeState }`
- 返回 `false` 隐藏该 section；不提供时所有 section 默认显示

**为什么在 MaterialDefinition 而非 Extension**：sectionFilter 是注册时声明的静态配置；PropertiesPanel 已通过 `store.getMaterial(type)` 获取 Definition，接入路径最短。

### 25.2.2 PropertiesPanel 集成

模板中各 section 增加 `v-if="isSectionVisible(sectionId)"` 守卫。`isSectionVisible` 获取当前物料的 Definition，调用其 `sectionFilter`。

### 25.2.3 表格实现

table-static 和 table-data 注册时声明：

```
sectionFilter: (sectionId) => sectionId !== 'binding'
```

单元格级 binding 展示已通过 `PropertyPanelOverlay.binding` 在 cell-selected 阶段实现（doc 24），无需改动。

## 25.3 DatasourceDropHandler 协议

### 25.3.1 接口定义

新增于 `MaterialDesignerExtension`：

```
datasourceDrop?: DatasourceDropHandler
```

`DatasourceDropHandler` 包含两个方法：

| 方法 | 调用时机 | 职责 |
|------|---------|------|
| `onDragOver(field, point, node)` | dragOver 事件 | 返回 `DatasourceDropZone` 描述符或 `null` |
| `onDrop(field, point, node)` | drop 事件 | 执行绑定命令 |

`DatasourceDropZone` 描述符：

| 字段 | 类型 | 说明 |
|------|------|------|
| `status` | `'accepted' \| 'rejected'` | 控制视觉反馈样式 |
| `rect` | `{ x, y, w, h }` | 物料局部坐标的高亮矩形 |
| `label` | `string?` | 可选提示文案 |

`DatasourceFieldInfo`：从拖拽 payload 解析的字段信息（sourceId, sourceName, sourceTag, fieldPath, fieldKey, fieldLabel, use）。

### 25.3.2 职责分离

| 角色 | 职责 |
|------|------|
| **物料** | 计算 drop zone（hit-test）、决定 accept/reject、执行 Command |
| **Designer** | 解析拖拽事件、坐标转换、调用物料 handler、**统一渲染视觉反馈** |

物料不碰 DOM 渲染——只返回数据描述符。

### 25.3.3 默认回退

未实现 `datasourceDrop` 的物料（text、image、barcode 等）自动回退到默认行为：

- dragOver：整个元素矩形作为 drop zone，状态 `accepted`
- drop：`BindFieldCommand` 绑定到 `node.binding`

### 25.3.4 use-datasource-drop 重构

1. `onDragOver`：hit-test 物料后，若有 handler 则调用 `handler.onDragOver`，否则默认高亮整个元素
2. `onDrop`：有 handler 则调用 `handler.onDrop`，否则走 `BindFieldCommand`
3. 新增 `onDragLeave`：离开页面时隐藏 overlay
4. 删除 `handleTableDataDrop` 硬编码、删除 `isTableDataNode` 判断

**视觉反馈**：维护一个 `div.ei-drop-zone-overlay` DOM 元素，根据 `DatasourceDropZone.status` 切换样式：
- accepted: 绿色边框 + 半透明填充
- rejected: 红色边框 + 半透明填充
- label: 矩形上方小标签

## 25.4 表格物料 DatasourceDropHandler 实现

### 25.4.1 table-data

```
onDragOver:
  1. 检查 sourceId 是否匹配（已有 source 时不匹配 -> rejected）
  2. hitTestGridCell -> resolveMergeOwner -> computeCellRect
  3. 返回 { status: 'accepted', rect: cellRect }

onDrop:
  1. 首次拖入 -> BindTableSourceCommand 设置 table.source
  2. sourceId 不匹配 -> 拒绝
  3. hitTestGridCell -> resolveMergeOwner
  4. UpdateTableCellCommand 设置 cell.binding
```

### 25.4.2 table-static

```
onDragOver:
  1. hitTestGridCell -> resolveMergeOwner -> computeCellRect
  2. 返回 { status: 'accepted', rect: cellRect }
  （无 source 约束，每个 cell 可绑不同数据源）

onDrop:
  1. hitTestGridCell -> resolveMergeOwner
  2. BindStaticCellCommand 设置 cell.staticBinding
```

### 25.4.3 复用现有基础设施

| 函数 | 来源 | 用途 |
|------|------|------|
| `hitTestGridCell` | `@easyink/material-table-kernel` geometry | 坐标 -> 网格单元格 |
| `resolveMergeOwner` | `@easyink/material-table-kernel` topology | 合并单元格归属 |
| `computeCellRect` | `@easyink/material-table-kernel` geometry | 单元格矩形计算 |

## 25.5 设计决策记录

| # | 决策 | 原因 |
|---|------|------|
| D25-1 | sectionFilter 放在 MaterialDefinition 而非 Extension | 静态声明；PropertiesPanel 已持有 Definition 引用 |
| D25-2 | DatasourceDropHandler 放在 MaterialDesignerExtension | 与 deepEditing 同层次的运行时扩展能力 |
| D25-3 | 视觉反馈由 Designer 统一渲染 | 物料只返回数据，避免各物料重复实现 DOM 操作 |
| D25-4 | 无 handler 回退默认 | 普通物料零改动，向后兼容 |
| D25-5 | 通用协议设计 | chart/container/relation 未来可复用同一协议 |

## 25.6 文件变更索引

| 文件 | 变更 |
|------|------|
| `packages/core/src/material-extension.ts` | +DatasourceDropHandler, DatasourceDropZone, DatasourceFieldInfo |
| `packages/designer/src/types.ts` | +PanelSectionId, SectionFilterContext, sectionFilter |
| `packages/designer/src/components/PropertiesPanel.vue` | section v-if 守卫 |
| `packages/designer/src/composables/use-datasource-drop.ts` | 重构: handler 分发+视觉反馈+删除硬编码 |
| `packages/designer/src/components/CanvasWorkspace.vue` | +onDragLeave+cleanupOverlay |
| `packages/designer/src/materials/registry.ts` | table 注册 sectionFilter |
| `packages/materials/table-data/src/designer.ts` | +datasourceDrop handler |
| `packages/materials/table-static/src/designer.ts` | +datasourceDrop handler |
