# 13. 单位系统

## 13.1 设计决策

**Schema 存储用户选择的单位值**，不做归一化转换。顶层 `unit` 声明了整个文档使用的单位，所有元素的坐标和尺寸数值都基于该单位。

```typescript
// Schema 中的存储方式
{
  unit: 'mm',
  page: {
    width: 210,
    height: 297,
  },
  elements: [{
    x: 15, y: 20, width: 50, height: 10, // 值的单位是 mm
    props: {},
  }]
}
```

## 13.2 单位管理器

```typescript
class UnitManager {
  /** 当前模板单位 */
  readonly unit: 'mm' | 'inch' | 'pt'

  /**
   * 将模板单位值转换为屏幕像素值
   * @param value - 模板单位值
   * @param dpi - 屏幕 DPI（默认 96）
   * @param zoom - 缩放倍率
   */
  toPixels(value: number, dpi?: number, zoom?: number): number

  /**
   * 将屏幕像素值转换回模板单位值
   */
  fromPixels(px: number, dpi?: number, zoom?: number): number

  /**
   * 单位间转换
   */
  convert(value: number, from: Unit, to: Unit): number

  /**
   * 获取显示用的格式化值（带单位后缀）
   */
  format(value: number, precision?: number): string
}

// 转换常量
const UNIT_CONVERSIONS = {
  mm: { toInch: 1 / 25.4, toPt: 72 / 25.4 },
  inch: { toMm: 25.4, toPt: 72 },
  pt: { toMm: 25.4 / 72, toInch: 1 / 72 },
} as const
```

## 13.3 渲染时转换

> Viewer 根据顶层 `unit` 直出对应 CSS 物理单位（mm -> CSS `mm`、pt -> CSS `pt`、inch -> CSS `in`），不做 px 换算。设计器画布同样跟随 `unit` 定位 + CSS `transform: scale()` 控制缩放。屏幕预览不做 DPI 补偿，打印保真是唯一硬目标。

### 13.3.1 Viewer CSS 物理单位直出

Viewer 输出的 DOM 中，所有坐标和尺寸直接使用顶层 `unit` 对应的 CSS 单位：

```css
/* mm 模板的渲染产物 */
.material-node {
  position: absolute;
  left: 15mm;
  top: 20mm;
  width: 50mm;
  height: 10mm;
}

/* pt 模板的渲染产物 */
.material-node {
  position: absolute;
  left: 42.52pt;
  top: 56.693pt;
  width: 141.732pt;
  height: 28.346pt;
}

/* inch 模板的渲染产物 */
.material-node {
  position: absolute;
  left: 0.591in;
  top: 0.787in;
  width: 1.969in;
  height: 0.394in;
}
```

| unit | CSS 单位后缀 | 打印精度 |
|-----------|-------------|----------|
| `mm`      | `mm`        | 浏览器原生支持，最可靠 |
| `pt`      | `pt`        | 浏览器原生支持（1pt = 1/72in） |
| `inch`    | `in`        | 浏览器原生支持 |

- CSS 物理单位让浏览器打印引擎直接处理物理尺寸映射，无需手动 DPI 换算
- 不同浏览器对屏幕上物理单位的渲染可能有微小差异，但打印输出是一致的；框架不做屏幕预览补偿
- 如果用户对精度有极高要求，建议使用 mm 单位（浏览器支持最成熟）
- CSS 值直接使用 schema 中存储的数值 + 单位后缀，**不截断小数**

### 13.3.2 @page 打印样式

Viewer 自动注入 `@page` 规则，单位跟随顶层 `unit`：

```css
/* mm 模板 */
@page { size: 210mm 297mm; margin: 0; }

/* pt 模板 */
@page { size: 595.276pt 841.89pt; margin: 0; }

/* inch 模板 */
@page { size: 8.268in 11.693in; margin: 0; }
```

### 13.3.3 设计器画布单位

设计器画布元素跟随顶层 `unit` 定位，通过 CSS `transform: scale(zoom)` 控制缩放倍率：

```
画布容器 {
  transform: scale(zoom);
  transform-origin: 0 0;
}

/* 以 mm 模板为例 */
元素节点 {
  left: {x}mm;
  top: {y}mm;
  width: {width}mm;
  height: {height}mm;
}

/* 以 pt 模板为例 */
元素节点 {
  left: {x}pt;
  top: {y}pt;
  width: {width}pt;
  height: {height}pt;
}
```

缩放仅影响视觉呈现，不改变 schema 中的数值。

### 13.3.4 鼠标坐标与页面单位互转

设计器需要将屏幕像素坐标转换为顶层 `unit` 对应的值。CSS 标准定义了固定映射：

| 单位   | 与 CSS px 的关系    | unitFactor |
|--------|--------------------|-----------|
| mm     | 1mm = 96/25.4 px   | 25.4      |
| pt     | 1pt = 96/72 px     | 72        |
| inch   | 1in = 96 px        | 1         |

```typescript
// 屏幕 px -> document unit
const cssPixelsPerUnit = 96 / unitFactor  // mm: 3.7795, pt: 1.3333, in: 96
const unitValue = (screenPx - canvasOffset + scrollOffset) / zoom / cssPixelsPerUnit

// document unit -> 屏幕 px（用于标尺、吸附等）
const screenPx = unitValue * cssPixelsPerUnit * zoom + canvasOffset - scrollOffset
```

`getBoundingClientRect()` 返回 CSS px（与 `devicePixelRatio` 无关），因此反算时使用固定 96dpi 即可。

### 13.3.5 UnitManager 保留用途

UnitManager 仍用于：
- 设计器鼠标交互坐标转换（屏幕 px <-> document unit）
- 标尺刻度渲染（unit 值 -> 屏幕 px）
- 属性面板数值显示与输入（格式化带单位后缀）
- 单位切换时的 schema 数值批量转换

但**渲染路径**不经过 UnitManager 的 toPixels() 转换，Viewer 直接读顶层 `unit` 输出对应 CSS 单位。

## 13.4 精度策略

### 13.4.1 Schema 存储精度

- 渲染器 CSS 输出：直接使用 schema 中的数值，**不截断小数**
- 单位切换时的换算值：保留小数后 **3 位**，写入 schema
- 两阶段渲染反算（getBoundingClientRect px -> page unit）：保留小数后 **3 位**，用于推移 delta 计算

### 13.4.2 CSS 标准反算公式

两阶段渲染中，离屏测量用顶层 `unit` 对应的 CSS 物理单位定位 DOM，测量后通过 `getBoundingClientRect()` 取 px 值反算回 document unit：

```typescript
// getBoundingClientRect 返回 CSS px
const pxHeight = el.getBoundingClientRect().height

// 反算回 document unit（保留 3 位小数）
const UNIT_FACTOR: Record<string, number> = { mm: 25.4, pt: 72, inch: 1 }
const measuredHeight = Math.round(pxHeight * UNIT_FACTOR[unit] / 96 * 1000) / 1000
```
