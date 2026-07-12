# 9. 物料包与扩展系统

物料平台以不可变 manifest、原子 package 和编译 profile 为边界。这里的“插件”不表示进程级 mutable registration。

## 9.1 Manifest 与 package

`MaterialManifest` 包含版本、engine range、type、modelVersion、common contract、schema adapter 以及可选 designer/viewer/AI facets。`defineMaterialManifest()` 校验并深冻结完整声明。

`MaterialPackageRegistration` 声明 `packageId / kind / required / manifests`。外部包必须提供 namespace，物料 type 使用 `namespace/name`；内置包使用无 namespace 的稳定 type。重复 package/type、越权 namespace 和不兼容版本在 compile 时确定性失败或隔离。

package 是隔离原子：required package 失败会终止编译；optional package 任一 manifest 失败时整包 quarantine，不允许半包覆盖或 last-write-wins。

## 9.2 Compile profile

宿主调用：

```ts
const profile = compileMaterialProfile({
  id: 'host',
  engineVersion: EASYINK_ENGINE_VERSION,
  packages,
})
```

`CompiledMaterialProfile` 发布冻结 manifest snapshot、admission budget、diagnostics、materialTypes 以及独立的 surface sets，并提供 `getManifest / hasSurface / createNode`。创建节点由 profile 物化 canonical empty maps、合并默认私有 model、验证 binding ports，并运行 adapter；宿主不直接拼接物料根字段。

## 9.3 Facet host

`MaterialFacetHost` 负责 designer/viewer facet 的延迟激活、并发去重、surface-local quarantine、服务注入与确定性 dispose。激活模式只有 `sync` 与显式 `async-isolated`。AI facet 是 portable data，不在 facet host 内执行代码。

profile 是 Viewer 与 Designer 的共同输入。内置包由 `compileBuiltinMaterialProfile('all' | 'basic' | 'none')` 提供；自定义宿主把自己的原子 package 一并编译，而不是修改全局 registry。

API 见 [`packages/core/src/material-profile.ts`](../../packages/core/src/material-profile.ts)、[`packages/core/src/material-manifest.ts`](../../packages/core/src/material-manifest.ts) 和 [`packages/core/src/material-facet-host.ts`](../../packages/core/src/material-facet-host.ts)。
