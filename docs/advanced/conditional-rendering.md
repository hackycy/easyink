---
description: EasyInk 条件渲染：使用安全的结构化规则，按运行时数据移除节点或保留占位。
---

# 条件渲染

条件渲染根据 Viewer 的原始运行时 `data` 决定节点是否输出。规则在数据绑定、测量、布局和分页之前求值，不执行 JavaScript。

Designer 只负责编辑规则。选中支持条件能力的物料后，在属性栏的“数据绑定”和“样式”之间可以找到“条件渲染”。字段可从数据源面板直接拖入规则中的字段槽位；未填写完整的草稿不会写入 Schema 或撤销历史。

## remove 和 reserve

- `remove`：节点不再绑定、测量、布局、分页或绘制。
- `reserve`：节点仍参与绑定、测量、布局和分页，但不绘制，因此保留本次运行时测量后的真实空间。

静态 `hidden: true` 优先于条件，并保持原有占位语义。

## Schema 示例

```json
{
  "renderCondition": {
    "enabled": true,
    "rule": {
      "kind": "compare",
      "operator": "gt",
      "operands": [
        { "kind": "field", "path": "order.total", "cast": "number" },
        { "kind": "literal", "value": 0 }
      ]
    },
    "whenFalse": "remove",
    "onUnknown": "include"
  }
}
```

`enabled: false` 会保留完整规则但不执行。字段路径始终从 `open({ schema, data })` 的全局 `data` 根读取，不使用 `sourceId`。

规则支持 `and` / `or` 组、`not` 和比较。比较操作数可使用字段、JSON 标量固定值和显式类型转换。

## 数据异常

求值结果使用 `true | false | unknown` 三值逻辑。字段缺失、类型不匹配或转换失败不会中断整页渲染：默认 `onUnknown: "include"` 保留节点；需要严格排除时设置为 `exclude`。

Viewer 会通过 `category: "condition"`、`scope: "condition"` 发出 warning 诊断。诊断只包含节点、规则位置和字段路径，不包含实际业务值。

## 互斥二维码

两个二维码可以重叠放置：主二维码使用 `exists(parentQrcode)`，备用二维码使用 `notExists(parentQrcode) AND exists(qrCode)`。示例模板 `conditional-qrcode` 已包含完整配置。

首期开放 `text`、`image`、`barcode`、`qrcode`、`line`、`rect`、`ellipse` 和 `signature`。表格、Flow Row、图表、页码、进度/评分和 SVG 系列暂不显示条件编辑入口。
