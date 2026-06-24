---
description: EasyInk 条件渲染：使用安全的结构化规则，按运行时数据移除节点或保留占位。
---

# 条件渲染

条件渲染根据 Viewer 的原始运行时 `data` 决定节点是否输出。规则在数据绑定、测量、布局和分页之前求值，不执行 JavaScript。

Designer 只负责编辑规则。选中物料后，默认可以在属性栏的“数据绑定”和“样式”之间找到“条件渲染”；只有物料显式禁用条件能力或隐藏该属性区块时不显示。字段可从数据源面板直接拖入规则中的字段槽位；未填写完整的草稿不会写入 Schema 或撤销历史。

## remove 和 reserve

- `remove`：节点不再绑定、测量、布局、分页或绘制。
- `reserve`：节点仍参与绑定、测量、布局和分页，但不绘制，因此保留本次运行时测量后的真实空间。

静态 `hidden: true` 优先于条件，并保持原有占位语义。

## Schema 示例

```json
{
  "renderCondition": {
    "enabled": true,
    "whenMatched": "show",
    "whenHidden": "remove",
    "onUnknown": "show",
    "groups": [
      {
        "conditions": [
          {
            "source": { "path": "order/total", "fieldLabel": "订单金额" },
            "operator": { "compare": "gt" },
            "valueType": "number",
            "value": { "kind": "literal", "value": 0 }
          }
        ]
      }
    ]
  }
}
```

`enabled: false` 会保留完整规则但不执行。字段路径始终从 `open({ schema, data })` 的全局 `data` 根读取，不使用 `sourceId`。

规则使用固定两层结构：同一组内的 `conditions` 使用 AND，多组 `groups` 之间使用 OR。否定语义通过 `neq`、`notIn`、`notContains`、`notExists` 等操作符表达，不保存独立的 `not` 节点。

## 数据异常

求值结果使用 `true | false | unknown` 三值逻辑。字段缺失、类型不匹配或转换失败不会中断整页渲染：默认 `onUnknown: "show"` 保留节点；需要严格隐藏时设置为 `"hide"`。

Viewer 会通过 `category: "condition"`、`scope: "condition"` 发出 warning 诊断。诊断只包含节点、规则位置和字段路径，不包含实际业务值。

## 互斥二维码

两个二维码可以重叠放置：主二维码使用 `exists(parentQrcode)`，备用二维码使用 `notExists(parentQrcode) AND exists(qrCode)`。示例模板 `conditional-qrcode` 已包含完整配置。

条件渲染默认适用于所有物料。物料只有在自身语义不适合默认的 `remove/reserve` 行为时，才需要显式收窄或禁用条件能力。
