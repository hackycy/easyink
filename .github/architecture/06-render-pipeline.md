# 6. 渲染管线

## 6.1 统一 DOM 渲染策略

EasyInk 当前只承诺一条渲染主线：`Schema + 展示值数据 -> DOM`。设计器画布和业务侧运行时共享同一套 DOM 渲染语义，设计器只是在 DOM 页面之上额外叠加交互层。

```
Schema JSON
    │
    ▼
┌──────────────┐    ┌──────────────┐
│ SchemaEngine │───▶│ DataResolver │── 简单字段绑定
└──────────────┘    └──────────────┘
    │
    ▼
┌──────────────┐
│ LayoutEngine │── 坐标推移计算
└──────────────┘
    │
    ▼
┌───────────────────┐
│    DOMRenderer    │── DOM 节点树生成（单页）
└───────────────────┘
    │
    ├──▶ 设计器画布（叠加交互层）
    └──▶ 业务运行时容器（由业务方继续打印/导出）
```

## 6.2 渲染器接口

```typescript
interface Renderer {
  readonly name: string

  on(event: 'diagnostic', listener: (event: RenderDiagnosticEvent) => void): () => void

  /**
   * 将 Schema 渲染到目标容器。
  * data 必须已经是展示值数据，不在渲染期做模板动态计算、格式化和条件计算。
   */
  render(schema: TemplateSchema, data: Record<string, unknown>, container: HTMLElement): RenderResult

  destroy(): void
}

interface RenderResult {
  /** 渲染产生的页面 DOM 节点 */
  page: HTMLElement
  /** 内容底部位置（页面单位） */
  contentBottom: number
  /** 是否超出声明纸张高度 */
  overflowed: boolean
  /** 销毁函数 */
  dispose: () => void
}

interface RenderDiagnosticEvent {
  type: 'schema' | 'data' | 'material' | 'resource' | 'layout'
  severity: 'warning' | 'error'
  code: string
  message: string
  materialId?: string
  path?: string
  phase: 'load' | 'resolve' | 'layout' | 'render'
}
```

### 6.2.1 诊断通道

- diagnostics 的主通道是 `diagnostic` 事件流，而不是 `render()` 返回值中的汇总数组。
- 事件按渲染过程逐条发出，便于上层应用实时写日志、在打印前阻断或映射为 UI 提示。
- `render()` 返回值继续聚焦 DOM 页面节点与测量结果，避免把可观测性和 DOM 结果耦合成一个大对象。
- 上层应用如需批量收集，可自行在一次 `render()` 周期内订阅并缓存事件。

## 6.3 运行时边界

- 渲染器不内建打印适配器、PDF 生成器和图片导出器。
- 渲染器不负责业务数据装配，只消费已经准备好的展示值对象。
- 渲染器会暴露 `overflowed` 和测量结果，帮助业务方决定是否阻止打印或走自定义导出流程。
- 对于缺失字段、绑定类型不匹配、未知物料、缺少自定义编辑器等问题，运行时优先保持页面可渲染，并通过 `diagnostic` 事件逐条暴露非阻断问题。
- 单值绑定 resolve 为 `undefined` 时，渲染结果为空白，不回退静态 `props`。
- 运行时遇到未注册物料类型时，不直接跳过节点；应在原声明位置渲染明显的占位 DOM 块，并发出 `material` 类诊断，避免打印结果被误判为正常。
- 外部图片、背景图、字体等资源只保存引用。浏览器默认加载行为与失败语义被视为底层能力，框架不负责上传、缓存、离线或失效恢复。

## 6.4 渲染前数据准备

业务方应在调用渲染器前把原始业务数据转换为“可直接展示”的对象：

- 日期、金额、编号等先格式化成最终字符串
- 地址、姓名等先完成拼接
- 条码/二维码值先完成清洗
- 复杂对象先拍平成扁平字段或一层对象数组

```typescript
const preparedDisplayData = {
  orderNo: 'ORD-2024-001',
  amountText: '¥250.00',
  fullAddress: '北京市朝阳区朝阳路 1 号',
  barcodeValue: 'ORD2024001',
  orderItems: [
    { itemName: '商品A', itemQty: '2', itemAmount: '¥200.00' },
    { itemName: '商品B', itemQty: '1', itemAmount: '¥50.00' },
  ],
}

renderer.render(schema, preparedDisplayData, container)
```

## 6.5 业务侧组合方式

```typescript
const result = renderer.render(schema, preparedDisplayData, container)

if (result.overflowed) {
  // 业务侧自行决定：告警、阻止提交、允许打印、另走导出链路
}

// 业务侧如需 PDF / image：基于 result.page 自行组合 Puppeteer、Playwright、html-to-image 等方案
```

```typescript
const stopListen = renderer.on('diagnostic', (event) => {
  console.warn(`[${event.phase}] ${event.code}`, event)
})

const result = renderer.render(schema, preparedDisplayData, container)

// 打印或导出完成后释放监听
stopListen()
result.dispose()
```
