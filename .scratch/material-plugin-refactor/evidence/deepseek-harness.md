# deepseek-harness：物料能力装配的参考证据

- 核查日期：2026-10-08（Asia/Shanghai）。
- 官方仓库：`deepseek-ai/deepseek-harness`，默认分支 `master`。
- 固定版本：`5badb15009ae1756c3afe0ae0cef1faafc290ccc`；下文链接全部固定此提交。
- 核查方法：阅读官方文档、vendored Cordis、Loader、作用域注册表、UI Slot、模块加载和对应测试源码；未安装依赖或执行 Harness。
- 本文件是随重构地图版本化的本地研究证据；正文足以理解结论，永久链接用于复核，更新版本必须重新核对行为。

## 结论与适用边界

Harness 值得借鉴的是“能力契约、提供者、消费者分离”和“注册有归属、清理有边界”。它的基础设施是 Cordis 的服务容器、带类型的事件和可撤销 effect，不是把所有能力塞入一个统一物料对象。[S01][][S02][][S03][]

它还有独立的 UI Slot 注册与 React 渲染层，提供比“插件都能注册东西”更具体的解耦样例。不同能力拥有不同的重名、选择、排序和作用域规则；不能概括成一个通用 `priority` 或最后注册者覆盖。[S12][][S16][][S17][]

EasyInk 保持现有文档 Schema 不变，是本次重构的约束，不是 Harness 提供的现成保证。以下迁移建议都作用于 Schema 之上的能力装配，不能据此往文档写入插件版本、组件实例、UI 状态或生命周期对象。

## 先分清四种不同对象

| 对象 | 已核实契约 | 对 EasyInk 的意义 |
|---|---|---|
| 普通 Cordis 插件 | 函数、带 `apply(ctx, config)` 的对象或 class；通过上下文贡献服务和注册。[S04][] | 插件是能力的贡献者；物料、Renderer、Designer UI、Viewer UI 可分别贡献。 |
| Loader entry / profile / bundle | entry 保存 `id/name/config/disabled/inject`；profile 按层组合 bundle 与 patch。[S02][][S05][] | 发布包、装配清单、运行实例必须区分，不能共用一个含义模糊的 id。 |
| UI Slot contribution | 声明好的 UI 位置接收组件；纯注册核心与 React renderer 分开。[S16][][S18][] | UI 贡献不应进入物料定义或渲染后端契约。 |
| dynamic Cordis package | Session 所有、进程内定义，含可选 Host / Client 两半与不可变版本；重启不恢复。[S22][] | 这是额外子系统，不是所有插件都必须经过的生命周期。 |

## 插件契约、注册 owner 与依赖

1. `Plugin.Base` 的字段是 `name`、`Config`、`inject`、`provide`、`intercept`；`name` 用于显示与诊断。基础类型没有一个声明所有领域 contribution 的通用清单。[S04][]
2. Registry 按执行 callback 身份保存 runtime；每次 `ctx.plugin()` 创建自己的 Fiber。基础运行实例身份不是插件显示名，也不是 npm 包名。[S04][][S06][]
3. `inject` 声明需要的服务键；仅在服务可用时激活，服务改变或消失时重新检查并卸载依赖者。它不是仅在启动时检查一次的 import 顺序。[S07][][S08][]
4. Loader 配置列表并发处理，列表位置不保证激活先后；需要的服务没有出现时插件保持 `PENDING`。这一状态可以无限持续。[S07][][S09][][S28][]
5. `ctx.provide()` 把服务记录绑定到调用方 Fiber；同一隔离域的同名服务已存在时抛错，并指出已有 provider。[S08][]
6. `ctx.on()` 与领域注册方法最终进入调用方 `ctx.effect()`，所以 contribution 归调用插件所有，卸载 provider 之外也能单独卸载贡献者。[S10][][S12][][S19][]
7. UI `SlotRegistry.register` 特别依赖服务代理在调用时绑定调用方上下文；源码明确禁止用固定 `this` 的实例箭头方法破坏归属。[S19][]
8. 作用域存储把“可见范围”和“销毁归属”同时从注册上下文取得；不能让 A 范围的能力意外由 B 生命周期清理。[S11][]

EasyInk 建议显式保存 `pluginId + installationId + contributionId` 等价的归属信息，并把登记入口绑定到安装实例；具体命名由后续契约票据确定。无须照搬 Cordis 的 Proxy / declaration merging 实现。

## 冲突、优先级与解析是领域契约

| 层次 | 固定提交的真实规则 | 不应推导出的结论 |
|---|---|---|
| 命名服务 | 同一 isolate label 同名 provider 拒绝；`isolate` 可创建独立解析域。[S08][][S30][] | 不是统一 last-write-wins。 |
| 命名作用域表 | 同一层重名抛错；合并祖先层时较近 scope 覆盖较远 scope。[S11][] | 不是所有普通服务自动继承该覆盖规则。 |
| 基础事件 | 注册顺序；`prepend` 可放到前面；不存在基础事件的数值 priority 字段。[S10][] | 不能把异步完成顺序作为稳定业务顺序。 |
| UI single / keyed / list | 同一 cell 不同 priority 可共存，数值最小者胜；同一 cell 同 priority 拒绝。[S17][] | 不是任意同 key 注册都合法，也不是任意同 key 注册都拒绝。 |
| UI chain | priority 升序，同值按登记顺序；首个非 null selector 胜；全空走 owner fallback。[S16][][S17][] | 这是 UI 路由协议，不是全平台统一 resolver。 |
| 浏览器模块图 | 外部模块依赖先于消费者；拒绝自依赖和环；相同条件保持扫描顺序。[S20][] | 模块加载依赖与 Cordis 服务依赖不是同一张图。 |

Tools 是具体 resolver 的例子：同一 scope 重名拒绝，scope 层可遮蔽全局，保留名拒绝注册；呈现、查找和执行共用同一个可见性计算入口，并在执行边界再应用模式限制。[S12][]

EasyInk 可让每种能力声明基数与解析规则：例如物料 type 的定义唯一；某个 `(materialType, rendererId, target)` 的渲染适配唯一；面板与工具栏采用稳定有序集合。若需要 override，必须是可诊断的显式策略，不能借插件加载顺序暗中覆盖。

## 生命周期、失败回滚与并发

已观察的 Fiber 状态包括 `PENDING / LOADING / ACTIVE / FAILED / UNLOADING / DISPOSED`；effect 可返回 disposer、Promise 或逐步产出 disposer 的迭代器。[S09][][S14][]

- 启动或配置校验失败会记录错误、切换到 inactive epoch，随后进入 `_unload()` 清理已经收集的 effect；`fiber.await()` 重抛启动错误。[S14][]
- effect 与子插件归父 Fiber；`fiber.dispose()` 等待清理完成，子插件也被递归处置。[S09][]
- 多个 disposer 反向开始，但 `_unload()` 使用 `Promise.all`，异步 disposer 并发运行；需要严格顺序时必须放在一个 disposer 内顺序 await。[S09][][S14][]
- 清理错误会记录日志并继续其它清理；不能把这个实现声称为会抛出所有清理错误的事务 API。[S14][]
- 失效 epoch 会阻止排队中的过期加载执行；浏览器模块更新另有串行更新队列和 generation，阻止旧下载完成后重新挂载。[S14][][S21][]
- `ScopedLayers.effect()` 先登记 undo 再通知；源码测试覆盖“通知抛错仍撤销插入”。UI 注入测试覆盖“第二项注册失败时撤销先前 yield 的注册”。[S11][][S15][][S29][]

这些机制支持“可撤销注册”的借鉴，但并不证明任意外部副作用都可回滚。插件绕过受管 API 发出的网络请求、写文件或启动资源，仍需自己提供对应清理与失败处理。

持久包安装也不是一个端到端全有或全无事务：pnpm 或 bundle 校验失败时恢复 manifest / lockfile；后续 enable 或 runtime publication 失败可保留已保存状态；下载文件可能残留。官方文档明确区分 saved selection、Host activation、浏览器同步和实际渲染成功。[S23][]

EasyInk 首版应按用户已确认范围落实：安装阶段失败撤回本次贡献与受管资源；宿主销毁等待清理完成；运行中替换后置。不要把“安装成功”定义为某个 UI 已实际渲染成功，也不要承诺回滚任意插件外部副作用。

## 同步与异步扩展点要逐项声明

| 机制 | 观察到的执行语义 |
|---|---|
| `emit` | 同步广播，不 await 返回 Promise，不收集返回值。[S10][] |
| `parallel` | 并发执行、等全部 settle，失败聚合为 `AggregateError`。[S10][] |
| `serial` | 顺序 await；遇到可 bail 的值即停止，其语义不等同于“保证全部监听器执行”。[S10][] |
| `bail` | 同步顺序选择第一个 bail 值。[S10][] |
| `waterfall` | around middleware；必须调用 `next()` 才继续；不调用即有意截断，调用端决定是否 await。[S10][] |
| plugin config 校验 | `StandardSchemaV1` 校验在 apply 前执行；该版本明确拒绝异步 schema 校验。[S14][] |

EasyInk 的物料查找、渲染适配选择、UI contribution 查询宜保持同步可预测；异步资源准备、安装与销毁必须有独立契约。应按现有调用边界决定，不应因为 Harness 支持 Promise 就让所有 resolver 变成异步。

## UI / 渲染解耦的直接证据

`ui-slots` 的运行时纯核心拥有声明、登记、基数校验、选择、撤销级联；`ui-renderer` 拥有 React 挂载与订阅绑定。前者仍使用 React 类型，因此“React-free”在这里不等于完全没有 React 类型依赖。[S16][][S18][]

1. Slot 由父贡献声明；声明也是该贡献渲染此位置的授权。未声明位置的注册、重复声明子位置、Store handle 跨 scope 挂载都会在装载时报错。[S16][]
2. Slot 注册可贡献组件并声明 child slots；卸载该条目递归撤销 child slots、贡献记录与 Store 挂载。[S16][]
3. Renderer contract 使用 `getSnapshot / subscribe`，不把 React hooks 放进引擎对象；renderer 把这些源绑定为组件 hook。[S16][][S18][]
4. 业务插件注册 Slot 或 Factory，接收带类型的 props；无须导入 renderer 的内部实现。实际 root 挂载由宿主调用。[S18][]
5. Conversation 装配层不把渲染组件写入事件记录；Chat 与 Trajectory 可以识别相同事件，但拥有各自 Definition State 与最终视图数据。[S24][]
6. keyed renderer 只消费节点数据和受限的 Location hooks，官方验证要求它不扫描完整事件窗口、Context 或另一视图的节点。[S24][]

EasyInk 可借鉴三处切口：物料定义描述语义；render adapter 消费 Schema 节点与渲染上下文；Designer / Viewer 各自的 UI contribution 消费宿主提供的数据与动作。不同 UI 可以共用物料能力，不需要彼此持有组件或管理器引用。

完整照搬其 Slot Factory、全应用声明表、Host / Client 模块系统没有必要；EasyInk 应先用当前属性面板、物料面板、Viewer 展示这几条真实消费链证明边界。

## 配置、组合与诊断

- Profile 的 bundle 顺序、profile patch、home patch、命令行 patch 构成有明确定义的覆盖层；patch 通过 entry id 定位。装配策略属于应用配置层。[S02][]
- entry `id` 稳定地识别更新；没有稳定 id 的条目在重读配置时可能被视为删除加新增。显示名、模块路径、entry 身份有不同职责。[S05][][S25][]
- 浏览器通过独立 `dsh.client` manifest 声明 web entry 与 external 模块；代码下载、factory materialization、Cordis 激活分开。[S21][]
- Plugin Manager 在包管理层检查 DSH peer 版本；这不在基础 `Plugin.Base` 的运行时 inject 契约里。版本约束与服务可用性是两种检查。[S04][][S23][]
- 官方 inventory 提供 entry id、module、effective enablement、live phase 的只读快照；无历史、无订阅，已经失败后移除的 fiber 不再出现。[S26][]
- 生成的服务 / 事件 API 文档标记来源及事件 dispatch mode，并要求 doc-sync 检查生成内容新鲜度。[S27][]

EasyInk 应把安装清单、解析结果、缺失 / 冲突诊断与持久 Schema 分开。可公开只读诊断视图，使调用方说明“所选能力、来源插件、拒绝原因”；文档应由契约与真实消费链支撑，避免只画模块框图。

## 明确不能从这些证据声称的能力

| 不成立或有边界的说法 | 证据约束 |
|---|---|
| “引用 Harness 就等于有完整 VS Code 式扩展平台” | 普通插件、Loader、持久 Plugin Manager、进程内 dynamic runner 是分开的机制。[S02][][S22][][S23][] |
| “基础 inject 会自动给所有缺依赖或环失败结果” | 缺服务可长期 PENDING；基础 Fiber 是可用性跟踪，浏览器模块图才有明确环诊断。[S07][][S20][][S25][] |
| “统一 priority 管理所有能力” | 服务拒绝重复，事件只有 prepend，UI 有自己的数值 priority 和基数规则。[S08][][S10][][S17][] |
| “作用域上下文隔离任意服务且形成沙箱” | 仅 scope-aware API 隔离状态；普通服务不会因调用上下文有 scope 就自动隔离；该原语不是安全边界。[S13][] |
| “安装失败会恢复所有外部状态” | effect 只清理受管资源；持久安装明确保留部分完成步骤，下载和已执行脚本效果可能保留。[S09][][S23][] |
| “支持任意包热替换，无须重启” | Plugin Manager 明确要求 package replacement 重启；浏览器 bootstrap / 平台身份也有 reload 限制。[S21][][S23][] |
| “动态包定义会随持久配置恢复” | dynamic runner 定义是 session-scoped、process-local，重启清空，与持久 bundle 安装不同。[S22][] |
| “生命周期超时覆盖所有异步工作” | dynamic runner 的 vmTimeout 只限制同步执行；等待浏览器授权没有超时。[S22][] |

未做运行验证：本文不宣称 Harness 在全部竞争条件下无泄漏，也不宣称 EasyInk 采用相似形状就获得相同性能或可靠性。所读测试是源证据，不是本次执行结果。

## 对路线的具体输入

| 首版应采用 | 后置或不直接搬入 |
|---|---|
| 插件只向已定义能力入口贡献；契约、provider、consumer 分离。 | 整体引入 Cordis、Node loader、npm 安装器或动态代码 VM。 |
| contribution 归安装实例；失败撤回与宿主销毁共用清理路径。 | 运行中替换、依赖者自动重启和 HMR。 |
| 能力类型自己声明唯一 / 集合 / 有序集合与冲突规则。 | 无使用场景的任意优先级遮蔽和多级 scope 覆盖。 |
| 显式同步解析，返回匹配或缺失 / 冲突诊断；UI 各自消费结果。 | 把所有查询 Promise 化、把所有行为都绕成中间件。 |
| 应用 composition root 选择插件组合；兼容 API 暂时适配同一内核。 | 在物料 Schema 内持久化 pluginId、运行对象或 renderer 实例。 |
| 契约文档、来源索引、迁移退出条件与行为测试随代码维护。 | 依赖会变动的外部 master 页面来解释本地架构。 |

建议验收包括：重复贡献可定位双方 owner；第二项安装失败后第一项不可见；销毁等待异步 cleanup；清理重入幂等；多个宿主互不污染；解析对装载完成顺序不敏感；Designer 与 Viewer 能在各自缺少另一方 UI 包时消费同一 Schema。

这些是 EasyInk 的路线建议，不是 Harness 的现有 API 名称或完整行为保证。最终实现票据必须把每项建议落到本仓库边界与可观察结果。

## 固定提交来源索引

[S01]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/README.md#L5-L15
[S02]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/docs/architecture.md#L9-L41
[S03]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/docs/architecture.md#L131-L164
[S04]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/vendor/cordis/src/registry.ts#L98-L145
[S05]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/vendor/loader/src/config/entry.ts#L9-L22
[S06]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/vendor/cordis/src/registry.ts#L316-L337
[S07]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/docs/cordis-tutorial/03-services.md#L41-L90
[S08]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/vendor/cordis/src/reflect.ts#L277-L335
[S09]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/docs/cordis-tutorial/02-lifecycle-and-effects.md#L5-L94
[S10]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/vendor/cordis/src/events.ts#L177-L301
[S11]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/core/scope/src/store.ts#L23-L265
[S12]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/core/tools/src/index.ts#L1057-L1261
[S13]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/core/scope/README.md#L58-L101
[S14]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/vendor/cordis/src/fiber.ts
[S15]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/core/scope/tests/store.spec.ts#L259-L288
[S16]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/client/ui-slots/README.md#L10-L64
[S17]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/client/ui-slots/src/index.ts#L1122-L1284
[S18]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/client/ui-renderer/README.md#L10-L58
[S19]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/client/ui-renderer/src/client/registry.ts#L160-L192
[S20]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/client/modules/src/index.ts#L492-L532
[S21]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/client/modules/README.md#L26-L135
[S22]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/extensions/cordis-host-runner/README.md#L10-L143
[S23]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/boot/plugin-manager/README.md#L61-L156
[S24]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/docs/subsystems/conversation.md
[S25]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/docs/cordis-tutorial/06-composition-and-hmr.md#L19-L63
[S26]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/host/plugin-inventory/README.md#L10-L42
[S27]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/docs/subsystems/extensions.md#L7-L15
[S28]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/vendor/loader/src/config/group.ts#L48-L65
[S29]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/client/ui-renderer/tests/registry.client.spec.ts#L402-L417
[S30]: https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/vendor/cordis/src/context.ts#L110-L125
