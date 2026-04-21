# 22. 编辑行为架构（Editing Behavior Architecture）

> 本章是 EasyInk 编辑交互的**正式协议**，**完全替代** 11 章中 `MaterialDesignerExtension.deepEditing` / `DeepEditingDefinition` / `SubSelectionHandler` / `InternalResizeHandler` / `KeyboardRouteHandler` 这套旧 FSM 协议。
>
> 适用范围：所有需要"在物料内部继续编辑"的复杂物料——表格（table-static / table-data / cell-free）、容器（container 子元素 in-place 编辑）、图表（chart 内图例/坐标轴/系列编辑）、SVG 路径/锚点编辑，以及未来扩展的表单、看板等。

## 22.1 设计动机

旧协议在表格落地后暴露的根本问题：

1. **Overlay 几何与物料内容长期错位**。物料视觉高度因占位行/虚拟列而 ≠ `node.height`；缩放/旋转后 overlay 坐标系与内容错位；物料内部 DOM 滚动时 overlay 不跟随；嵌套场景 z-index 与坐标系冲突。当前 `computeCellRectWithPlaceholders` 是补丁而非协议。
2. **行为耦合在 phase 内**。`onEnter/onExit` 是命令式 DOM 挂载，三件事被搅在一起：选区表达、行为响应、UI 渲染。无法跨物料复用（如"撤销边界"、"键盘光标"），也无法跨 phase 组合。
3. **PropertyPanel 与 DeepEditing 是两条平行通道**。物料每次 selection 变化都得手动 `requestPropertyPanel(overlay)`，重复样板。
4. **状态不可序列化**。`shared.selectedCell = {...}` 是物料内部闭包，URL 状态、协作远端光标、跨会话恢复都无入口。
5. **键盘事件路由扁平**。`phase.keyboardHandler` 优先，escape 兜底，没有"工作台 fallback / 命令系统 / region 上下文"的层级。

## 22.2 核心抽象（5 个一级对象）

```
┌─────────────────────────────────────────────────────────────────┐
│ EditingSession                  会话：一个物料处于编辑态        │
│  ├─ Selection                   类型化选区（含子选择路径）       │
│  ├─ Geometry                    几何查询（resolveLocation）      │
│  ├─ Behaviors[]                 已激活行为中间件链               │
│  ├─ Surfaces                    overlay / toolbar / panel 渲染挂点 │
│  └─ Transaction                 编辑事务管道（draft + patch）    │
└─────────────────────────────────────────────────────────────────┘
```

| 对象 | 归属 | 职责 |
|---|---|---|
| `EditingSession` | 框架 | 生命周期、互斥约束、事件总线、selection store |
| `Selection` | 框架定义形状，物料注册类型 | 类型化、可序列化、可被框架查询几何 |
| `Geometry` | 物料实现 | 把"逻辑选区"映射成"屏幕矩形"，吸收 designer/viewer 渲染差 |
| `Behavior` | 物料注册，可跨物料复用 | 中间件，处理输入、产出 transaction、决定下一步 |
| `Surfaces` | 框架渲染容器 + 物料注入 Vue 组件 | 自动跟随 selection 渲染高亮/把手/面板 |
| `Transaction` | 框架 | mutate draft → patch → 合并为单条 Command |

**互斥约束**：任何时刻最多一个 `EditingSession` 处于活动状态（扉面式）。容器内子物料的编辑 = 退出容器编辑、进入子物料编辑。selection 永远只属于 session 当前所属物料。

## 22.3 Selection 协议

### 22.3.1 形状

```typescript
interface Selection<T = unknown> {
  /** 选区类型，物料命名空间内唯一，如 'table.cell' / 'svg.anchor' / 'chart.legend' */
  type: string
  /** 编辑会话所属物料 id */
  nodeId: string
  /** 类型化负载，必须是 JSON-safe（无 DOM 引用、无函数、无 class 实例） */
  payload: T
  /** 可选锚点：范围选择 / 多选时使用 */
  anchor?: T
}
```

### 22.3.2 类型注册

物料在 extension 里声明：

```typescript
interface SelectionType<T> {
  /** 唯一类型名，必须以物料类型为前缀，如 'table.cell' */
  id: string
  /** 触发自动派生 PropertyPanel 的 schema 提供器（见 22.6） */
  getPropertySchema?: (sel: Selection<T>, node: MaterialNode) => SubPropertySchema | null
  /** 该选区在屏幕上的几何（见 22.4） */
  resolveLocation: (sel: Selection<T>, node: MaterialNode) => Rect[]
  /** 序列化校验（默认 JSON.parse(JSON.stringify) round-trip） */
  validate?: (payload: unknown) => payload is T
}
```

**JSON-safe 约束的强制**：框架在 `setSelection()` 时执行 `validate` + 结构化深拷贝校验（用 `JSON.parse(JSON.stringify(payload))`，**不用 `structuredClone`**，遵循仓库禁令）。任何带 DOM ref / 函数 / Symbol 的 payload 直接抛错，避免协作场景下出现"序列化时丢失"的隐性故障。

### 22.3.3 多选与范围

不抽象成"selection 数组"。框架的 selection 始终是单值（`Selection | null`）。范围/多选用 `payload + anchor` 表达，由物料 `resolveLocation` 一次返回多个矩形：

```typescript
// 表格选了 (1,1) 到 (3,4) 的范围
{
  type: 'table.cell',
  nodeId: 't1',
  payload: { row: 3, col: 4 },
  anchor: { row: 1, col: 1 },
}
```

### 22.3.4 与现有 SubSelectionHandler 的差异

| 旧 | 新 |
|---|---|
| `hitTest()` 返回 `{ path: unknown }`，物料把 path 塞回闭包 | 框架在 store 里持有 typed `Selection`，物料只声明类型 |
| `getSelectedPath()` / `clearSelection()` 命令式 | `store.selection` 响应式，物料只读 |
| 不可序列化 | 强制 JSON-safe，协作可注入 |

## 22.4 Geometry 协议（Overlay 边界根治方案）

### 22.4.1 物料必须实现

```typescript
interface MaterialGeometry {
  /**
   * 物料整体的"编辑期"布局描述。是 overlay 一切几何计算的基准。
   * - contentBox: 物料在画布坐标系下占据的总矩形（可能 ≠ node.width × node.height，
   *   例如 designer 场景虚拟占位行让物料视觉更高）
   * - viewport: 物料内部裁剪/可见区域，超出此区域的子选区 overlay 必须裁剪
   * - scroll: 物料内部滚动偏移（如果支持），overlay 跟随此偏移
   * - transform: 物料自身的 CSS transform（旋转/翻转），框架自动反向应用到 overlay
   */
  getContentLayout: (node: MaterialNode) => ContentLayout

  /**
   * 把任意 Selection 翻译为屏幕矩形数组。
   * 范围选择 / 跨片段选择 / 多选都通过返回 Rect[] 表达。
   * 如果选区在当前 viewport 外，返回 [] 即可。
   */
  resolveLocation: (selection: Selection, node: MaterialNode) => Rect[]

  /**
   * 屏幕坐标 → 物料逻辑选区。
   * point 是 contentBox 局部坐标（已扣除 transform / scroll）。
   * 命中 = 返回 selection 候选；不命中 = 返回 null。
   */
  hitTest: (point: Point, node: MaterialNode) => Selection | null
}

interface ContentLayout {
  contentBox: Rect            // 画布坐标系
  viewport?: Rect             // contentBox 内的可见子矩形
  scroll?: { x: number, y: number }
  transform?: { rotate?: number, scaleX?: number, scaleY?: number }
}
```

### 22.4.2 框架必须提供

```typescript
interface GeometryService {
  /** 屏幕像素 ↔ 画布逻辑单位（已含 zoom、page offset、ruler scale） */
  screenToCanvas: (px: { x: number, y: number }) => Point
  canvasToScreen: (pt: Point) => { x: number, y: number }

  /** 画布逻辑 ↔ 物料局部（已含物料 transform/scroll） */
  canvasToLocal: (pt: Point, node: MaterialNode) => Point
  localToCanvas: (pt: Point, node: MaterialNode) => Point

  /** 当前 selection 的屏幕矩形（聚合 resolveLocation 与 viewport 裁剪） */
  getSelectionRects: () => Rect[]
}
```

### 22.4.3 Designer/Viewer 渲染差异的边界

**这是协议的核心妥协点**：designer 与 viewer 渲染像素本就允许不一致（designer 模拟、viewer 实际），框架不强制收敛。

约束：

- **`resolveLocation` 与 `hitTest` 由物料独立实现**，且**只为 designer 场景负责**。viewer 不消费这两个协议。
- 物料内部如何处理"虚拟占位行"、"调试边框"、"模拟背景"等 designer-only 几何噪音，**全部内化在 `resolveLocation` 内**。
- 框架/中间件/overlay 渲染器只看 `Rect[]`，不感知"占位行"这种概念。

**结果**：所有"overlay 与物料对不上"的 bug 都在 `resolveLocation` 一个函数里发现并修复。表格的 `computeCellRectWithPlaceholders` 这种补丁不再扩散到 designer 层。

### 22.4.4 几何变化追踪

物料发布 `layout-change` 事件，框架重算 selection rects 与 overlay 位置：

```typescript
session.events.emit('layout-change', { reason: 'resize' | 'scroll' | 'mutation' })
```

可选项：物料可在 extension 声明 `autoTrack: true`，框架对 contentBox 加 `ResizeObserver` 自动触发。默认关闭，避免双重事件。

## 22.5 Behavior 中间件总线

### 22.5.1 形态：Koa 风格

```typescript
type BehaviorMiddleware = (ctx: BehaviorContext, next: () => Promise<void>) => Promise<void>

interface BehaviorContext {
  // 输入事件（联合类型）
  event: BehaviorEvent

  // 当前 session 状态
  selection: Selection | null
  node: MaterialNode

  // 服务
  tx: TransactionAPI
  geometry: GeometryService
  selectionStore: SelectionStore
  surfaces: SurfacesAPI

  // 中间件可写入并被后续中间件读取
  meta: Record<string, unknown>
}

type BehaviorEvent =
  | { kind: 'pointer-down', point: Point, originalEvent: PointerEvent }
  | { kind: 'pointer-move', point: Point, originalEvent: PointerEvent }
  | { kind: 'pointer-up', point: Point, originalEvent: PointerEvent }
  | { kind: 'key-down', key: string, originalEvent: KeyboardEvent }
  | { kind: 'paste', data: DataTransfer }
  | { kind: 'drop', field: DatasourceFieldInfo, point: Point }
  | { kind: 'command', command: string, payload?: unknown }
```

### 22.5.2 注册与作用域

```typescript
interface BehaviorRegistration {
  id: string
  middleware: BehaviorMiddleware
  /** 限定只对某些 selection.type 生效；不填 = 所有 */
  selectionTypes?: string[]
  /** 限定只对某些事件生效 */
  eventKinds?: BehaviorEvent['kind'][]
  /** 注册顺序决定执行顺序；同一物料内允许覆盖 */
  priority?: number
}
```

物料在 extension 里声明 `behaviors: BehaviorRegistration[]`。框架级中间件（如 `selectionMiddleware`、`undoBoundaryMiddleware`、`keyboardCursorMiddleware`、`pasteRouterMiddleware`）从 `@easyink/core/behaviors` 导出，物料按需引用：

```typescript
import { selectionMiddleware, undoBoundaryMiddleware } from '@easyink/core/behaviors'

const tableExt: MaterialDesignerExtension = {
  // ...
  behaviors: [
    selectionMiddleware(),
    undoBoundaryMiddleware({ groupBy: 'cell' }),
    { id: 'cell-edit', middleware: cellEditMiddleware, selectionTypes: ['table.cell'] },
  ],
}
```

### 22.5.3 事件路由优先级（自上而下）

```
1. 命令系统（全局快捷键，如 Cmd+Z；可被 capture 取消）
2. 活跃 behavior 链（按注册顺序，可调 next() 传递、可不调断链）
3. 子选择上下文（基于 selection.type 的快捷键集合：方向键/Enter/Tab）
4. 工作台 fallback（撤销/复制/删除/Esc 退出 session）
```

每一层都消费一个 `BehaviorContext`。下一层是否执行取决于上层是否：(a) 调用 `next()`，或 (b) 返回前未对 `event.originalEvent` 调用 `preventDefault()/stopPropagation()`。

### 22.5.4 中间件能力边界

允许：

- `await next()` 传递事件
- `await ctx.tx.run(...)` 提交编辑事务
- `ctx.surfaces.requestPanel(...)` 推送临时面板（escape hatch，22.6）
- `ctx.selectionStore.set(...)` 改 selection
- 异步：`await confirmDialog(...)`、`await remoteValidate(...)`，期间事件链阻塞但 session 仍存在
- 多个中间件的 `tx.run()` 自动合并为**一条** Command（22.7）

禁止：

- 直接操作 DOM（用 surfaces 声明式 schema）
- 直接 push 命令到 history（必须走 tx）
- 跨 session 状态（用 store）

## 22.6 Surfaces：声明式叠加层

### 22.6.1 三类 Surface

| 名称 | 触发条件 | 框架是否定位 | 物料提供 |
|---|---|---|---|
| **SelectionDecoration** | selection 变化 | 是（基于 `resolveLocation` 返回的矩形数组） | Vue 组件，接收 `{ rects, selection, node }` |
| **PropertyPanel** | selection 变化 | 是（属性面板挂载位） | `getPropertySchema(selection, node)` 返回 PropSchema 树 |
| **EphemeralPanel**（escape hatch） | 物料/中间件命令式 push | 否（物料自定位） | `ctx.surfaces.requestPanel(panel)` |

**Toolbar 不在框架范围内**。深度编辑期间的工具栏完全是物料自身的事——物料可以选择用 `EphemeralPanel`、自己挂 DOM、或在 `SelectionDecoration` 组件里渲染。框架不提供 toolbar 容器，也不规定 toolbar 形状。

### 22.6.2 SelectionDecoration

```typescript
interface SelectionDecorationDef {
  /** 哪些 selection.type 触发本装饰 */
  selectionTypes: string[]
  /** Vue 组件，作为 props 接收 rects（已含 viewport 裁剪与 transform 反算） */
  component: Component<{
    rects: Rect[]
    selection: Selection
    node: MaterialNode
  }>
  /** 渲染层级；同一 layer 内按注册顺序 */
  layer?: 'below-content' | 'above-content' | 'above-handles'
}
```

物料只声明"画什么"，不管"画在哪"。框架根据 `getSelectionRects()` 自动定位，selection 变化、layout-change、缩放、滚动时自动重算。

### 22.6.3 PropertyPanel 自动派生

```typescript
interface SubPropertySchema {
  title: string
  schemas: PropSchema[]
  /** 读值；框架在每次重渲染调用 */
  read: (key: string) => unknown
  /** 写值；框架转交 tx.run() */
  write: (key: string, value: unknown, tx: TransactionAPI) => void
  binding?: BindingRef | BindingRef[] | null
  clearBinding?: (bindIndex?: number) => void
  editors?: Record<string, Component>
}
```

selection 变化时框架自动调 `selectionType.getPropertySchema(sel, node)`，结果非 null 就 push 到属性面板"子选区"区段；返回 null 就 pop。**90% 场景物料不需要写任何"push panel"代码**。

属性面板渲染顺序固定为：

```
[ 物料级 props ]    ← 始终展示
[ 子选区 schema ]   ← selection 非空且有 getPropertySchema 时自动展示
[ EphemeralPanel ]  ← 命令式 push，最高层
```

### 22.6.4 Escape Hatch：EphemeralPanel

少数场景（异步加载字段、AI 建议、与 selection 完全无关的瞬时操作面板）保留命令式：

```typescript
ctx.surfaces.requestPanel({
  id: 'ai-suggest',
  title: '...',
  position: { anchor: 'selection-bottom', offset: { x: 0, y: 8 } },
  component: AiSuggestPanel,
  props: { ... },
  onClose: () => { ... },
})
```

EphemeralPanel 与 selection 解耦，需物料自管生命周期。框架仅提供定位锚点（`selection-bottom` / `viewport-top` / `cursor` 等）。

## 22.7 Transaction API

### 22.7.1 形态：draft + patch + coalesce

```typescript
interface TransactionAPI {
  /**
   * 一个 tx.run 调用 = 一条进入历史的 Command。
   * draft 是 node 的 immer-style 可变副本，框架对比生成 patch。
   */
  run: (
    nodeId: string,
    mutator: (draft: MaterialNode) => void,
    options?: TxOptions,
  ) => Promise<void>

  /** 手动开启批量域，期间多次 run() 合并为一条 Command */
  batch: <T>(fn: () => Promise<T>) => Promise<T>
}

interface TxOptions {
  /**
   * 合并键。连续的同 mergeKey 事务（在 mergeWindowMs 内）自动 coalesce 为一条 Command。
   * 用于：拖拽 resize（持续触发）、富文本输入（连续按键）。
   */
  mergeKey?: string
  /** 默认 300ms */
  mergeWindowMs?: number
  /** 描述，用于历史面板与 a11y */
  label?: string
}
```

### 22.7.2 与现有 Command 系统的关系

`tx.run()` 内部产出的 patch 由框架包装为 `PatchCommand`（新建的内置命令），加入 `commitCommand` 链。即：

- 历史面板看到的仍是 Command 列表
- 撤销/重做仍是 Command 粒度
- coalesce 在生成 Command **之前**完成，不污染历史

物料原有的 `BindFieldCommand` / `UpdateNodeCommand` 等保留，可与 `PatchCommand` 共存。Behavior 中间件应**优先**使用 `tx.run`；只有需要副作用（异步保存、跨 node 操作）才直接 `commitCommand`。

### 22.7.3 不使用 structuredClone

draft 实现禁止使用 `structuredClone`（CLAUDE.md 禁令）。采用基于 Proxy 的 lazy clone（参考 immer.js mutative 实现思路），仅在写入路径上克隆。

## 22.8 与现有协议的兼容方案

旧协议的去除是**完全替代**（用户决策）。迁移分两步：

### 22.8.1 packages/core 协议层重构

```
packages/core/src/material-extension.ts
  - 删除：DeepEditingDefinition / DeepEditingPhase / SubSelectionHandler /
          InternalResizeHandler / KeyboardRouteHandler / PhaseContainers
  - 新增：MaterialGeometry / SelectionType<T> / BehaviorRegistration /
          SelectionDecorationDef / SubPropertySchema
  - 修改 MaterialDesignerExtension：
      removed: deepEditing
      added:   geometry, selectionTypes, behaviors, decorations
```

`PropertyPanelOverlay` / `DatasourceDropHandler` 保留：前者改为 EphemeralPanel 的等价物，后者保持不变（拖拽-绑定本质就是 `BehaviorEvent.drop` 的特化，可后续合并）。

### 22.8.2 物料迁移路径

`packages/materials/table-kernel/src/deep-editing.ts` 全部重写：

| 旧概念 | 新落地 |
|---|---|
| `createTableSelectedPhase` | 移除。table 选中即 `selection = null` 但 `session.active = true` |
| `createCellSelectedPhase.subSelection.hitTest` | `MaterialGeometry.hitTest` |
| `shared.selectedCell` | 完全移除，状态在 `selectionStore` |
| `renderCellOverlay` 命令式 div | `SelectionDecoration` Vue 组件 |
| `renderToolbar` 命令式 | 物料自管，不在框架范围 |
| `createContentEditingPhase` 输入框 | `cellEditMiddleware` + `EphemeralPanel`（输入框作为 panel） |
| `keyboardHandler` | `behaviors` 链，框架统一路由 |
| `commitCellUpdate` 等 delegate | `tx.run(nodeId, draft => { ... })` |
| `computeCellRectWithPlaceholders` | 内化为 `resolveLocation` 实现细节 |

迁移完成后删除 `packages/designer/src/composables/use-deep-editing.ts`，对应 store 字段（`deepEditing.currentPhase` 等）替换为 `editingSession.selection`。

### 22.8.3 文档变更

- 11 章 §11.4「深度编辑工具栏」与 §11.5「深度编辑元素的通用交互模型」整段删除，替换为指向本章的引用
- 11 章 `MaterialDesignerExtension` 接口示例同步更新
- 12 章 Command 系统增加 `PatchCommand` 段落
- 10 章工作台无变化（编辑会话不影响窗口/工具组带）

## 22.9 协作预留

selection 与 transaction 都满足协作必要条件：

- `Selection` 是 JSON-safe，可经 WebSocket 广播为远端光标
- `Patch` 是 RFC 6902 兼容形态，可作为 OT/CRDT 输入
- `BehaviorContext` 不暴露任何运行时引用（所有访问都经 service 接口），便于注入"远端 behavior"模拟其它人的输入
- `EditingSession` 互斥语义可扩展为"远端 lock"：本地拿不到 session 时只渲染远端 selection decoration，不响应输入

不在本期实现，但本期协议形状必须满足以上约束。任何 PR 引入 DOM ref 进 selection / 非 JSON 数据进 tx，都视为破坏协议。

## 22.10 验收清单

- [x] `packages/core` 旧 deep editing 协议全部删除，新协议接口完成
- [x] `packages/designer` 提供框架级中间件、SelectionStore、GeometryService、SurfacesRenderer
- [x] `packages/materials/table-kernel` 重写为新协议实现，旧 phase 代码清零
- [x] `table-static` / `table-data` extension 迁移完成
- [x] `pnpm lint` / `pnpm typecheck` / `pnpm build` 通过
- [x] 单元测试覆盖：selection 序列化往返、tx coalesce、resolveLocation 跨 viewport 裁剪、behavior 中间件优先级
- [x] 11 章 / 12 章对应段落同步更新
