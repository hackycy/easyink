# Schema 保持不变时的渲染状态与未知物料约束

Type: research
Labels: wayfinder:research
Status: resolved
Assignee: Codex/render_research
Parent: [EasyInk 物料能力装配层重构地图](../map.md)
Blocked by: none

## Question

现有 Schema、codec 与 Viewer 管线对未知类型、binding、条件派生、测量、重排、分页、fragment 和并发渲染有什么约束？table-data 缓存如何传递状态？独立 Viewer、iframe 及其他渲染宿主在哪里组装能力？

研究必须给出可定位的源码证据、需要维持的行为与现有回归入口，不实现新接口。

## Answer

已完成 [Schema、渲染状态与宿主装配调查](../evidence/rendering-schema.md)。证据覆盖 canonical/benchmark 编码边界、未知类型、条件与绑定、layout/fragment 协议、table-data WeakMap 的完整内容与寿命、重复测量、并发和销毁，以及浏览器、iframe、打印和 Go 内嵌运行时的装配点。

路线必须保留 `getRenderSize`、`fragmentPaginator`、`pageAware`、条件默认值及重复测量语义；新的 RenderSession 需显式保存声明尺寸基线、物料准备/测量状态和片段状态，并贯穿最终 page plan。当前没有通用物料 prepare 或迭代布局收敛环；这两者不能写成已存在能力。

当前测试只作为入口记录，本次未运行应用构建或测试；已检查证据文件中所有相对 Markdown 链接均可解析。新增验收应覆盖未知物料往返、多 Viewer 隔离、重叠 updateData、字体 await 期间销毁及多级分页。
