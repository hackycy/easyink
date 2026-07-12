# 11. 物料系统

物料由一个公共节点 envelope、一个私有版本化 model 和若干显式 facet 组成。公共系统只依赖 manifest 与 introspection，不通过根级业务字段识别物料。

## 11.1 公共 envelope

- 几何：`id / type / x / y / width / height / rotation / alpha / zIndex`
- 私有状态：`modelVersion / model`
- 公共关系：`slots / bindings`
- 编辑与输出：`editorState / output`

`model / slots / bindings` 使用 canonical empty maps。`output.visibility` 总是存在。table-static 与 table-data 的 v1 `TableModel` 直接位于 `model`，kernel 负责其 schema adapter 和 introspection。

## 11.2 Binding ports 与私有模型

manifest 用 port policy 定义可绑定入口。display port 可以投影到声明的 `/model/...` 路径；semantic port 只表达业务输入，不允许宿主猜测私有字段。model-key port 由物料策略从当前 model 解析，解析结果仍必须唯一且满足声明的 value shape。

## 11.3 属性访问器

属性 descriptor 不等于 root props。每个可写属性通过 `PropertyAccessor` 声明 canonical RFC 6901 `paths`，典型目标为 `/model/fontFamily` 或 `/output/placement`。`createModelPropertyAccessor()`、`createNodePropertyAccessor()` 和 `resolvePropertyAccessor()` 负责读写；accessor 只修改传入 draft，不能创建命令或产生副作用。

conformance 会比较实际 patch 与声明 paths，禁止通过声明叶子路径替换祖先对象，也检查 alternate value roundtrip 和读取不变性。

## 11.4 Introspection 与 identity

adapter 的 `introspect()` 返回 identities、structures、references、resources、bindings 五类槽位。Identity scope 只有：

- `document`：跨物料的文档级稳定身份。
- `material`：只在所属物料私有图内唯一。

每个 identity/reference 都携带 value/key location 与可选 encoding。克隆、重排、引用重写、资源收集和 binding 遍历只使用这些声明，不扫描私有 model 拓扑。

## 11.5 Layout 与 surfaces

`common.layout` 声明 intrinsic size、overflow、page repeat 与 fragmentation。`break-opportunities` 是 core scheduling 声明，完整 Viewer break API 留给 Viewer Layout 计划。Designer、Viewer、AI 各有独立 surface；generatable 集合是启用 AI 且同时具备 Designer/Viewer facet 的交集。

定义与测试见 [`packages/core/src/material-manifest.ts`](../../packages/core/src/material-manifest.ts)、[`packages/core/src/material-properties.ts`](../../packages/core/src/material-properties.ts) 和 [`packages/core/src/material-introspection.ts`](../../packages/core/src/material-introspection.ts)。
