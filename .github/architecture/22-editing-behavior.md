# 22. 编辑行为架构（Editing Behavior Architecture）

> 本章是 EasyInk 编辑交互的**正式协议**，**完全替代** 11 章中 `MaterialDesignerExtension.deepEditing` / `DeepEditingDefinition` / `SubSelectionHandler` / `InternalResizeHandler` / `KeyboardRouteHandler` 这套旧 FSM 协议。
>
> 适用范围：所有需要"在物料内部继续编辑"的复杂物料——表格（table-static / table-data / cell-free）、容器（container 子元素 in-place 编辑）、图表（chart 内图例/坐标轴/系列编辑）、SVG 路径/锚点编辑，以及未来扩展的表单、看板等。

## 22.0 两种 selection 的边界

EasyInk 里有两套同名但不同语义的 selection 模型，必须在阅读本章前区分清楚：

| 维度 | `SelectionModel`（画布层） | `EditingSession.selection` / `Selection<T>`（物料内部） |
|---|---|---|
| 位置 | `@easyink/core/selection.ts` | 22.3 协议 + `@easyink/designer/editing/selection-store.ts` |
| 单位 | 画布上的**整个元素**（id 集合） | 物料**内部**的子结构（cell / anchor / legend …） |
| 多选 | 原生 `Set<string>`，框选/Ctrl 点击/全选都改它 | 单值 `Selection \| null`，范围用 `payload + anchor` 表达 |
| 是否进入历史 | 否，纯 UI 状态 | 否，session 关闭即丢弃 |
| 是否可序列化 | id 字符串集合，天然 JSON-safe | 协议强制 JSON-safe（22.3） |

**互斥**：进入 `EditingSession`（双击表格、点击 SVG 锚点等）时，画布层 `SelectionModel` 会坍缩为 session 所属物料的单选；session 退出后才能恢复多选。`CanvasWorkspace` 的 marquee 启动会主动 `editingSession.exit()`，`useElementDrag` 的多选拖动也仅在没有活跃 session 时进入；不允许出现"画布上多选 + 某个物料正在编辑"的混合状态。

**面向新代码**：
- 操作"哪些元素被选中"用 `store.selection`（`SelectionModel`）。
- 操作"表格里哪个 cell / SVG 里哪个锚点"用 `session.selectionStore`（`Selection<T>`）。
- 不要把 `SelectionModel.ids` 写成 `Selection<unknown>`——它们职责不同，后者依赖 `nodeId` 把 selection 锁定到具体物料。

## 22.0.1 画布手势仲裁（CanvasInteractionController + SelectionIntent + GestureContext）

> 强制约束：本节描述的三件对象是画布层 selection 与编辑态的**唯一**写入路径（**画布手势**意义上）。
> 非画布手势（TopBar 按钮、CanvasContextMenu 菜单项、键盘快捷键、StructureTree 选择、MaterialPanel 添加、DataSource drop、paste / duplicate）走 `selection-api.ts` 的命名包装（`selectOne` / `selectMany` / `clearSelection`）。
> 任何代码（含 `*.vue`、`use-*` composable、material extension、editing-session 内部）直接调用 `store.selection.{select,add,toggle,clear,selectMultiple}` 都属于违规，PR 必须拒绝。详见下文 [22.0.2 选择写入双 API 并列](#2202-选择写入双-api-并列canvas-vs-non-canvas)。

### 为什么存在

历史上一次物理手势（pointerdown → pointermove → pointerup → click）会被三套独立代码各自解释一次：`CanvasWorkspace.vue` 解释 click、`useElementDrag` 解释 pointerdown、`EditingSessionManager.enter` 解释 selection。每一处都维护一个私有 boolean（`editEnteredOnPointerDown`、`dragJustOccurred`、`modifierSelectionPrimedElementId`）来"猜"另外两处刚刚做了什么。结果：

- Cmd+点击未选中元素 → pointerdown 被加进选区；click 又把它 toggle 出去。
- click-trigger 物料首次点击 → pointerdown 进入了 editing-session；click 仍然走"普通选择"分支。
- 多选拖动后释放 → click 把多选坍缩成单选。

这些不是"某个分支写错"，而是**同一手势的语义被多处分散重复解释**导致的必然冲突。

### 三件对象的边界

```
┌──────────────────────────────────────────────────────────┐
│ DOM 事件（pointerdown / click / dblclick / contextmenu） │
└────────────────────────────┬─────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────┐
│ CanvasInteractionController（唯一决策者）                │
│ - createGestureContext()  开启一次手势上下文             │
│ - 决定 SelectionIntent / 是否进入 editing-session        │
│ - 决定 drag 执行器是否启动                               │
└─────────────────┬────────────────────────────┬───────────┘
                  ▼                            ▼
        applySelectionIntent           useElementDrag
        （唯一选择写入入口）            （纯几何执行器，
                  │                     不再写 selection）
                  ▼
        store.selection（SelectionModel）
```

| 对象 | 文件 | 职责 | 不做什么 |
|---|---|---|---|
| `GestureContext` | `packages/designer/src/interactions/gesture-context.ts` | 一次物理手势的上下文，记录 modifier、prime、edit-entered、dragMoved。生命周期：pointerdown 创建，下次 pointerdown 覆盖 | 不参与决策，只承载事实 |
| `applySelectionIntent` | `packages/designer/src/interactions/selection-intent.ts` | 画布层 `SelectionModel` 的**唯一**写入入口，覆盖 single/add/toggle/replace/collapse-to-session-owner/clear/preserve-for-context-menu | 不解释 DOM 事件，不管理 editing-session |
| `useCanvasInteractionController` | `packages/designer/src/interactions/canvas-interaction-controller.ts` | 接收 element/scroll 的 pointerdown/click/dblclick，输出 SelectionIntent 与 session 进入/退出，并把 drag 委托给 `useElementDrag` | 不做几何（drag/snap/marquee 仍在 composable）、不做编辑会话内部逻辑 |

### 手势规则（与 22.0 互斥规则一致）

1. 任何带 `geometry` 的物料 → **dblclick 统一进入** editing-session（不再有 `enterTrigger: 'click'` — 见 [audit/202605011431.md item 1](../audit/202605011431.md)）。Single-click 只产生画布层 select + drag-eligible，与普通元素无差。
2. editing-session 活跃且 pointerdown 落在当前 owner → 事件路由 `editingSession.dispatch({ kind: 'pointer-down' })`，**不动** `SelectionModel`，**不**启动 drag。换言之：进入深度编辑后要移动元素必须先 Esc 退出（与 Figma / PowerPoint 一致 — 见 [audit/202605011431.md item 2](../audit/202605011431.md)）。先前的 `DeepEditDragHandle`（14×14 外置手柄）已删除。
3. editing-session 活跃且 pointerdown 落在其他元素 → 先 `editingSession.exit()`，再让 controller 重新解释手势。
4. 拖动有位移的 release → click 被 controller 忽略（依据 `gesture.dragMoved`）。
5. Cmd/Ctrl 在未选元素上 pointerdown → controller 写 `add` intent 并设 `selectionAddedViaPrime`；后续 click 直接忽略。Cmd/Ctrl 在已选元素上 click → 写 `toggle`。
6. 右键 → `preserve-for-context-menu` intent；不进 editing，不启动 drag。
7. 画布背景 pointerdown → 若 editing-session 活跃则**先** `exit()`，**后**触发 marquee hook（保证 marquee 看到的是退出后的稳定状态）。

### 错误处理边界（落实 22.10 / 21）

- `useElementDrag` 提交事务失败时：执行 `commands.rollbackTransaction()`，记录到 [DiagnosticsChannel](#2202-诊断通道-diagnosticschannel)，**不**把异常抛回浏览器事件循环——一个跨多个节点的 batch 失败不应让标尺/snap-line overlay 卡在半应用态。
- `applySelectionIntent` 的输入是受控的有限枚举；不做 try/catch，错误用类型保证而非运行时。
- `SelectionStore` 的 invalid payload 走 `_lastValid` 回滚（见 22.3.x），并向 DiagnosticsChannel 推送 `severity: 'warn'` 条目；用户主动清选 / 删除选中元素 / 切页面**不**回滚。

## 22.0.2 选择写入双 API 并列（canvas vs non-canvas）

> 落实 [audit/202605011431.md item 5](../audit/202605011431.md)：用一个 enum 同时承担"画布手势"和"非手势写入"会迫使 enum 不断膨胀（出现 `add-after-paste`、`select-on-tree-pick` 这类 pointer-irrelevant 的成员），或反过来把 `selectAll` 这种纯命令藏进名为 "intent" 的画布枚举里。两边的输入语义和约束完全不同，硬合并就是把混乱再封一层壳。

### 两条入口

| 入口 | 文件 | 适用场景 | 输入形态 |
|---|---|---|---|
| `applySelectionIntent` | `packages/designer/src/interactions/selection-intent.ts` | 画布 pointer 手势：controller / drag / marquee / editing-session 生命周期 | 离散 enum，每个 kind 对应一种物理手势结果 |
| `selectionApi.{selectOne, selectMany, clearSelection}` | `packages/designer/src/interactions/selection-api.ts` | 非手势：TopBar 按钮、CanvasContextMenu、键盘快捷键、StructureTree、MaterialPanel、DataSource drop、paste / duplicate / group / ungroup | 命名函数，参数即"我想要的最终选区" |

### 强制规则

- 任何代码 `import` `store.selection.{select,add,toggle,clear,selectMultiple}` 调用 → **拒绝合并**。
- 任何画布 pointer 路径 `import` `selection-api` → **拒绝合并**（应走 `selection-intent`）。
- 任何非画布路径 `import` `selection-intent` → **拒绝合并**（应走 `selection-api`）。
- 新增的非手势调用点 → 在 `selection-api.ts` 加一个命名包装，不要新增"通用万能写入函数"。每个包装都自带文档说明哪个非画布场景在用它，例外清单单点可审。

### 测试护栏

- 单元测试 `packages/designer/src/interactions/canvas-interaction-controller.test.ts` 覆盖审计列出的全部用例（Cmd 多选、drag-then-click、dblclick 进入、pointerdown 不进入、background exit + marquee 顺序、右键保留 etc.）。
- `useElementDrag` 的测试不再断言 selection 副作用——选择行为属于 controller 的契约。

## 22.0.3 诊断通道 DiagnosticsChannel

> 落实 [audit/202605011431.md item 4](../audit/202605011431.md)：可恢复错误此前散落在多处 `console.error` 中，没有任何一处能让宿主应用（Sentry / toast / 运维仪表盘）拿到结构化数据。

### 形态

- `packages/designer/src/store/diagnostics.ts` 暴露 `DiagnosticsChannel`，在 `DesignerStore` 构造时实例化并 `markRaw`，挂在 `store.diagnostics`。
- `entries` 用 `shallowRef` 承载，bounded buffer = 200，超出 silently 丢弃最旧条目（设计器侧 UI 永不因诊断列表无限增长 OOM）。
- 始终在线（生产也在线）—— 架构 README 禁止 silent failure，DEV-gating 会重新引入它。

### 强制接入点

- `SelectionStore`：解析失败的 invalid payload → `severity: 'warn'`，包含 `selectionType`、解析错误堆栈摘要。
- `BehaviorDispatcher`：middleware throw → `severity: 'error'`，包含 `eventKind`、`selectionType`、stack。
- `TransactionService`：`commitTransaction` 失败 → `severity: 'error'`，已 rollback。
- 物料扩展若需要上报恢复性错误：通过 `EditingSession` 注入的 `diagnostics` 句柄，禁止直接 `console.error`。

### 宿主消费

- Contribution 通过 `ctx.onDiagnostic(fn)` 订阅，返回的 unsubscribe 在 contribution dispose 时被 registry 自动调用。
- 内置 `DebugPanel.vue` 渲染最近 200 条（severity 颜色边框 + JSON detail + clear），开发与排查现场可直接打开。

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

### 22.5.5 与其它扩展协议的关系

`MaterialDesignerExtension` 上还有两个与"编辑期"相关、但**不**走 behavior 中间件总线的扩展点；它们的设计动机与本章一致——把物料特化逻辑收敛到物料包内、保持 `@easyink/core` 与 PropertiesPanel 的中立：

- **`resize?: MaterialResizeAdapter`**（详见 [11.6.1](./11-element-system.md#1161-resize-协议)）：覆盖 element resize handle 期间的物料私有数据同步（如表格行高），并通过 `MaterialResizeSideEffect` 与 `ResizeMaterialCommand` 一起进入 history。
- **`PropSchema.read / commit`**（详见 [11.4.1](./11-element-system.md#1141-propschemaread--commit-钩子)）：覆盖属性面板的取值与提交。`commit` 接收的 `PropCommitContext` 提供 `flushPendingEdits / activeEditingSession / exitEditingSession`，所以例如"隐藏表头时退出当前 cell 编辑会话"这类副作用由物料自己声明，不再让 PropertiesPanel 硬编码 `if (isTableNode) ...`。

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
  run: <TNode extends MaterialNode = MaterialNode>(
    nodeId: string,
    mutator: (draft: TNode) => void,
    options?: TxOptions,
  ) => void

  /** 手动开启批量域，期间多次 run() 合并为一条 Command */
  batch: <T>(fn: () => T) => T
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

`TNode` 是物料侧的编译期声明，例如表格行为使用 `tx.run<TableNode>(nodeId, draft => {...})`。框架不在运行时替物料校验私有 schema；进入 `tx.run` 前必须已经通过 `isTableNode`、selection type 或等价协议确认节点类型。

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
