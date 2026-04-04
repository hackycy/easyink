# 15. 输出与导出边界

## 15.1 当前结论

EasyInk 当前不把 PDF 生成器做成 `core` 的职责，但 `viewer` 层需要承担预览、打印和导出入口。也就是说，输出能力存在于产品架构中，只是不下沉到 Schema/Core 层。

这个调整的原因是：

- 不同业务部署环境对 PDF、打印和下载链路差异很大。
- 预览与分页已经是 Viewer 主职责，但具体导出实现仍需适配宿主环境。
- 过早把底层导出实现下沉到核心层，会放大维护面并稀释主线。

## 15.2 EasyInk 负责什么

- `viewer` 提供页面预览、打印入口、导出入口和诊断事件。
- `viewer` 负责页面集合、缩略图、字体加载、数据加载和页面样式生成。
- `core` 与 `schema` 只提供文档模型和布局规则，不直接实现导出链路。

## 15.3 EasyInk 不负责什么

- 物理打印设备精度和缩放校准
- 业务侧文件上传、权限控制和审计
- 强绑定某一种浏览器外的 PDF 引擎实现
- 物理打印设备精度和缩放校准

## 15.4 业务侧推荐组合方式

```typescript
const viewer = createViewer({ mode: 'fixed' })

await viewer.open({ schema, data, dataSources })
await viewer.print()
await viewer.exportDocument()

// 宿主仍可按自己的部署环境补充：
// 1. 浏览器打印桥接
// 2. Puppeteer / Playwright PDF 落地
// 3. 上传、存储、权限控制
```

## 15.5 后续演进原则

如果继续扩展导出适配层，也必须满足：

- 不反向污染 `@easyink/core` 和 `@easyink/schema` 的数据模型
- 不要求模板层重新引入动态计算 DSL 或导出专用 DSL
- 输出适配器优先挂在 `@easyink/viewer` 扩展面，而不是回退到旧 `renderer` 中心模型
