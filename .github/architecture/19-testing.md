# 19. 测试策略

## 19.1 单元测试（Vitest）

覆盖核心引擎的所有纯逻辑模块：

| 模块 | 测试重点 |
|------|----------|
| SchemaStore | DocumentSchema CRUD、校验、遍历、序列化 |
| Layout / Pagination Engine | 页面模型、回流、分页策略、表格 fragment 分页、overflow 诊断 |
| BindingResolver | `fieldPath` 根路径解析、`bindIndex`、格式化诊断 |
| MaterialDataContractResolver | 目标模型字段映射、共享 record collection 推导、顶层数组 index 对齐、source-scoped root 回退、诊断 |
| DataSourceRegistry | Designer 字段树注册、usage 解释、命名空间隔离 |
| CommandManager | 撤销/重做、命令合并、事务 |
| UnitManager | 单位转换精度 |
| MigrationRegistry | 版本迁移链路 |

物料与宿主的长期回归覆盖如下，按可观察行为断言，避免用整个 DOM、SVG 或内容哈希冻结实现细节：

| 范围 | 持续覆盖入口 |
| --- | --- |
| Schema normalization / codec | `packages/schema/src/defaults.test.ts`、`codec.test.ts`：未知节点、自定义数据、条件、单位及输入不变性；迁移身份由 `migration.test.ts` 覆盖 |
| builtin 集合与默认节点 | `packages/builtin/src/collection-source.test.ts`、`index.test.ts`、`condition.test.ts`、`material-defaults.test.ts`：成员、顺序、条件能力、mm/pt/px 几何及 props 覆盖语义 |
| 独立与自定义物料 | `packages/builtin/src/independent-materials.test.ts`、`custom-material.test.ts`、`designer.test.ts`：单物料消费、空集合、目录、locale、AI、懒加载及自定义输出 |
| Viewer 输出 | `packages/viewer/src/output-regression.test.ts`、`table-session.test.ts`、`conditional-schema.test.ts`、`text-image-materials.test.ts`：页数、份数、页码、几何、绑定、条件与表格分页内容 |
| Host / Session 所有权 | Designer、Viewer、plugin-runtime 中的生命周期测试：安装回滚、资源释放、并发隔离、懒加载失败重试与销毁 |
| 公共消费与依赖边界 | 各包 `public-contracts.test.*` 及 `test-fixtures/check-consumption.mjs`：真实 exports、构建声明、入口依赖隔离与公开类型消费 |

## 19.2 浏览器与平台回归

覆盖关键用户路径：

```
1. 加载模板 → Designer 传入数据源 → Viewer 传入调试数据 → 验证页面预览输出
2. 设计器打开 → 添加元素 → 设置属性 → 导出 Schema
3. 设计器打开 → 绑定字段 → 删除绑定 → 验证静态值恢复显示
4. 设计器打开 → `table-data` 绑定集合字段 → 验证集合前缀约束和绝对路径解析
5. 设计器打开 → `chart-bar` 绑定 data-contract 字段 → 验证不同数据形态下 Viewer 可解析并展示
6. 加载多页模板 → 验证 Viewer 分页结果、重复表头与 overflow 提示
7. 设计器打开 → 多次操作 → 撤销/重做 → 验证状态
```

实际浏览器检查通过 `internal-packages/viewer-runtime/scripts/check-resource-readiness.mjs` 驱动 Chromium。默认模式覆盖字体、图片等资源就绪；`--cutover` 模式覆盖 Playground、Assistant、PDF/PNG 输出、懒加载重试、托管打印和内嵌 runtime 的销毁链路。它们使用真实浏览器与输出，不由 DOM 模拟环境替代。

Android 的真实设备检查保留 `lib/EasyInk.Android/samples/minimal/src/test-fixtures/check-cutover.mjs` 和 instrumentation 入口；修改相关宿主或制品时执行。历史检查记录不能代替当前构建制品的验收。

## 19.3 明确不测的核心职责

- 模板动态计算
- 具体 PDF 引擎实现
- 具体图片导出引擎实现
- 物理打印设备可扫描性

这些能力不属于当前核心承诺，应由各业务输出链路自行验证。

## 19.4 测试工具与持续验证入口

根目录 `vitest.config.ts` 加载 Vue 插件并使用 happy-dom；`pnpm test` 执行 `vitest run --dom`，排除 e2e、dist 等目录。公共契约测试会调用对应包的消费校验脚本，需先构建声明和入口。

在仓库根目录依次执行：

```sh
pnpm build
pnpm lint
pnpm typecheck
pnpm test
node packages/builtin/src/test-fixtures/check-doc-examples.mjs
node packages/designer/src/test-fixtures/check-consumption.mjs --check-lazy
pnpm docs:build
pnpm render:manifest
```

文档示例校验器以自身测试目录中的虚拟 TypeScript 源文件消费真实 exports 与构建声明，不依赖临时工作目录。文档、架构示例和包 README 生成源变动时继续执行该检查。

准备好 Chromium 可执行文件后分别执行（macOS 等无法自动定位的环境需设置 `EASYINK_RENDER_BROWSER_PATH`）：

```sh
node internal-packages/viewer-runtime/scripts/check-resource-readiness.mjs
node internal-packages/viewer-runtime/scripts/check-resource-readiness.mjs --cutover
```

Android 设备检查需设置 `ANDROID_SERIAL` 并准备 SDK、JDK 和在线设备：

```sh
node lib/EasyInk.Android/samples/minimal/src/test-fixtures/check-cutover.mjs
```

## 19.5 强制覆盖（核心交互回归）

下列测试是 PR 准入护栏，删除或绕过将被拒绝合并：

- `packages/designer/src/interactions/canvas-interaction-controller.test.ts` — 覆盖画布手势仲裁全部决策路径（Cmd 多选、drag-then-click、dblclick 进入 editing-session、pointerdown 不进入、background pointerdown 退出顺序、右键保留、editing-session 路由 owner pointerdown）。对应审计 `.github/audit/202605010152.md` 与 `202605011431.md`。
- `packages/shared/src/pointer-gesture.test.ts` — 覆盖 pointercancel 与 pointerup 走同一 teardown 路径，capture acquire/release throw 不影响 onEnd 单次触发。对应 `202605011431.md` item 3。
- `packages/designer/src/editing/selection-store.test.ts` — 覆盖循环引用 payload 的回滚与诊断；`packages/designer/src/editing/behavior-dispatcher.test.ts` — 覆盖中间件顺序、事件与 selection 过滤及命令路由。
- `packages/core/src/page-planner.test.ts` / `pagination-engine.test.ts` / `editor-surface-plan.test.ts` / `binding-utils.test.ts` / `font.test.ts` — 协议边界回归。

新增交互/行为类协议时必须同步加测试；只改实现不加用例的 PR 默认拒绝。
