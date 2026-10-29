# 9. 内部扩展机制

EasyInk 当前保留扩展抽象，但它的目标是支撑内置体系演进，而不是立刻开放成稳定的第三方插件平台。

## 已落地的公共声明入口

`@easyink/plugin-api` 已提供独立的 material/designer/viewer/ui 构建入口。完整物料声明包含同一共享模型和对应宿主 renderer 或 loader；目录、属性、locale 可以缺省。模型拥有 binding、condition 与 pageAware，renderer 负责绘制和设计交互。独立 UI/命令扩展以自己的 id 声明，无需伪造物料。

Designer UI 组件和回调取得受控上下文。组件业务 props 不得覆盖 `context`；物料属性上下文与独立 Designer 上下文类型不同。命令调用保留参数和结果类型。纯 Viewer 入口的 JavaScript 与声明依赖图均不包含 Vue 或 Designer。

验证入口是 `packages/plugin-api/src/test-fixtures/check-consumption.mjs` 与 `contracts.test.ts`：消费真实 exports 和已生成声明，负向夹具使用 `@ts-expect-error` 验证缺失 renderer、编辑权限、只读查询、异步 render 和组件 context 错配。消费检查也覆盖 plugin-runtime 的只读登记权限及 JavaScript/声明依赖图。

## 已落地的装配内核

`@easyink/plugin-runtime` 提供 Promise `createHost`：完整物料和独立扩展同步进入 owned staging，重复身份、唯一 key 争用及本地贡献重复使整体事务失败。登记错误不能通过捕获异常恢复，内部 setup 返回 Promise 也失败。最终组合通过后才能交给框架消费者初始化，初始化失败清理已取得资源后拒绝创建，并保留首因和清理错误。

registry 由 runtime 唯一写入，对外只提供深只读声明和不可变列表。locale 按输入顺序取首个有效值，应用文案优先，保持整树 fallback；相同文本共享，不同文本和无效叶子记录去重诊断，缺失返回 key。

`destroy` 在首个 await 前进入 disposing、递增代次、撤销登记视图并失效资源范围；先停消费者，再逆安装/登记顺序清理，异常继续且返回汇总结果。重复调用返回同一 Promise。受管任务检查 Host/Scope/任务代次，不等待尚未返回的外部 Promise；迟到资源释放错误单独保留。

内核行为测试位于 `packages/plugin-runtime/src/{assembly,locale,lifecycle}.test.ts`。Designer 的 `materials/host-consumer.ts` 与 Viewer 的 `material-host.ts` 已提供内部消费切片：声明只读自 runtime，缓存只保存已取得的实现及 pending task；按需 lazy 不在创建时加载，销毁禁止迟到发布。Designer 的 `materials/renderer-context.ts` 以固定操作构建受控上下文，查询为冻结快照，编辑经过 tx，资源失效后拒绝持有回调。`materials/store-operations.ts` 已逐项接线真实编辑、文档、数据源与交互操作；初始化时从内核取得最终物料和 locale 视图，不能读取旧 registry 或尚未交付的 Host。

公开 ViewerRuntime 已切到独立 Host：createViewer 返回 Promise，消费创建前选定的完整物料；产品层显式传入 builtin/all/viewer，底层省略或空数组为 none；创建后没有 registerMaterial 或可写 materialRegistry。destroy 返回同一 Promise，包含清理错误；必要 surface 初始化失败整体回滚。table/chart kernel 的纯子入口使默认 Viewer 的实际 JS 与声明图无 Vue。每轮 Render Session 固定输入并独占运行引用，只有最新候选可提交；输出容器由预览和已开始输出任务共同持有。

DesignerStore.create 返回 Promise，完整声明经唯一 Host 校验后才创建核心 Store 并初始化 eager factories；必需 factory 失败等待回滚，lazy 首次消费才加载。原物料写 Map、registerMaterial/registerDesignerFactory/registerLocaleMessages 与 bundle 登记 facade 已删除，工作台只投影最终物料/目录声明。UI/命令 context 按 owner Scope 缓存，仅包含 DesignerContext 权限；typed command 查内核登记并使用命令 owner 的 context。销毁同步失效，返回同一清理 Promise，字体和 lazy 的迟到结果不能更新缓存或活动诊断。

Vue 组件内部等待 Store 创建，通过 ready/error 和 loading/error slots 反馈启动；卸载后迟到 Store 自行销毁。实际工作台保留编辑/persistence/autosave，扩展 toolbar/overlay 只读消费内核声明，overlay 使用每实例 DOM 根，框架最后传入受控 context。旧 Contribution registry、activate、setupStore 与完整 Store 注入已删除。25 个物料根入口自带完整 Designer 声明，builtin all/basic Designer 子入口只聚合所选声明；playground 显式选择 all。五类 UI 以短挂载 Scope 消费声明；Session、UI 与物料功能有对应行为检查，实际平台链路另行验收。

## 9.1 当前边界

当前版本的扩展机制只服务以下场景：

- 内置物料包接入
- Designer 面板和工具栏扩展
- Viewer 运行时适配器扩展
- 数据源字段推荐扩展

不在当前稳定扩展面中的能力：

- 模板内执行任意脚本
- 模板内注册自定义表达式语言
- 运行时动态注入任意渲染器
- 面向第三方生态的兼容性承诺

## 9.2 扩展主题

内部扩展抽象围绕五类对象组织：

### 物料扩展

- 注册物料定义
- 注册 Designer 交互能力（factory 模式，按需创建扩展实例）
- 注册 Viewer 渲染能力
- 注册数据源投放提示

Viewer 与 DesignerStore 每实例从 plugin-runtime 的只读 registry 消费完整物料，已替换的物料写入 Map 和旧转发入口被删除。物料 `/viewer` 子入口和 builtin all/basic Viewer 集合不包含 UI；Designer 完整声明从物料根入口获得，组件内部管理独立 Host 启动与卸载。宿主间不会共享 registry 实例。

### 数据源扩展

- 扩展字段推荐
- 扩展示例数据来源

### 工作台扩展

- 注册面板
- 注册顶部工具栏动作
- 注册右键菜单动作

### Viewer 扩展

- 打印适配器
- 导出适配器
- 字体加载器
- 缩略图生成器

### 诊断扩展

- 订阅诊断事件
- 映射到工作台面板或宿主日志系统

## 9.3 声明与受控上下文

```typescript
import { DesignerStore } from '@easyink/designer'
import { createViewer } from '@easyink/viewer'
import { materials as designerMaterials } from '@easyink/builtin/all'
import { materials as viewerMaterials } from '@easyink/builtin/all/viewer'

const store = await DesignerStore.create({ materials: designerMaterials, extensions })
const viewer = await createViewer({ materials: viewerMaterials, container })
await viewer.open({ schema, data })
await store.destroy()
await viewer.destroy()
```

完整声明与独立扩展只在创建前选择；登记由 plugin-runtime 负责。没有 MaterialExtensionRegistry、任意 service token、动态补装或旧 register 转发。DesignerRendererContext 提供只读查询、tx/命令、文档/数据源/交互与必要画布操作；独立 UI/命令得到较窄的 DesignerContext，属性组件得到 MaterialPropertiesContext，均不包含 Store。

```typescript
// 已有输出驱动接口独立于物料装配，不转发到能力登记源。
interface ViewerOutputDrivers {
  registerPrintDriver(driver: PrintDriver): void
  registerExporter(exporter: ViewerExporter): void
}
```

PrintDriver 接收的是打印上下文，不是普通导出上下文。ViewerRuntime 会先解析统一的打印策略，再把同一份策略传给 driver 和浏览器 fallback：

```typescript
interface ViewerPrintContext extends ViewerExportContext {
  printPolicy: ViewerPrintPolicy
  renderedPages: ViewerPageMetrics[]
  container?: HTMLElement
}

interface PrintDriver {
  id: string
  print(context: ViewerPrintContext): Promise<void>
}
```

打印驱动必须消费 `context.printPolicy` 或 `context.renderedPages` 中的尺寸信息，不能重新从 `.ei-viewer-page` 的 inline style 反推打印纸张。这样 continuous-paper 策略和固定纸张导出在 driver 和浏览器 fallback 两条路径上保持同一语义。

## 9.4 固定能力与生命周期

首版仅支持有实际消费者的固定声明能力，不公开通用 Hook 或任意 point/service 注册。核心启动失败整体清理，局部 UI 失败隔离并诊断；资源通过 signal/onDispose 归属 Host 或子范围。active 后的命令、lazy 与交互失败属于运行阶段，不能回溯为创建失败。

## 9.5 发布与后续验收边界

公共契约可供完整物料、renderer、独立 UI 和命令作者消费。持续验证入口见[测试策略](./19-testing.md)；发布前按[文档维护与发布约定](../../docs/AGENTS.md)重新核对当前源码、内嵌 runtime 与 Go/Android 制品。历史检查结果不能代替当前制品验收。0.1.0 由用户按仓库流程手动发布；不发布重构过程中的 0.0.x 中间版本。
