# 18. 构建与产物

## 18.1 构建工具链

| 工具 | 用途 |
|------|------|
| **tsdown** | 主构建工具，打包各 package 为主 ESM 产物 |
| **rollup-plugin-vue** | Vue SFC 编译（设计器包） |
| **Vite** | playground/examples 的开发服务器 |
| **TypeScript** | 类型检查（noEmit，声明文件由 tsdown 生成） |

## 18.2 产物格式

主产物保持 **ESM**，各包通过 `tsdown` 生成 `dist/index.mjs` / `dist/index.d.mts` 及少量额外子入口：

```
packages/core/dist/
  ├── index.mjs
  ├── index.d.mts
  └── chunks/

packages/export-runtime/dist/
  ├── index.mjs
  ├── index.d.mts
  └── chunks/

packages/designer/dist/
  ├── index.mjs
  ├── index.d.mts
  ├── locale/
  │   ├── index.mjs
  │   └── index.d.mts
  └── index.css

packages/locales/dist/
  ├── index.mjs
  └── index.d.mts

packages/prop-schemas/dist/
  ├── index.mjs
  └── index.d.mts

packages/materials/chart/custom/dist/
  ├── index.mjs
  ├── designer.mjs
  ├── viewer.mjs
  ├── schema.mjs
  ├── prop-schemas.mjs
  ├── locale.mjs
  └── ai.mjs

packages/materials/chart/kernel/dist/
  ├── index.mjs
  └── full.mjs
```

约束如下：

- npm / workspace 的主消费面继续以 ESM 为准。
- 不引入 CJS/UMD/IIFE 主入口，主消费面统一以 ESM 为准。
- `@easyink/designer` 额外暴露 `./locale` 和 `./index.css` 子入口；`@easyink/viewer` 目前仅暴露主入口。
- `@easyink/locales` 与 `@easyink/prop-schemas` 只发布 ESM 主入口和类型声明；designer 的 `./locale` 子路径是 facade，编译产物应保持轻量 re-export。
- `@easyink/export-runtime` 只发布 ESM 主入口，仅含运行时内核，不绑定第三方导出库。
- `@easyink/export-plugin-dom-pdf` 只发布 ESM 主入口；`html2canvas` / `jspdf` 在 plugin 内部动态 import 按需装载。
- 物料包可以按需暴露 `./designer`、`./viewer`、`./schema`、`./prop-schemas`、`./locale`、`./ai` 等子入口，便于内置注册同步读取元数据，同时让 Designer 重型渲染器通过动态 import 懒加载。
- `@easyink/material-chart-kernel` 默认入口保持轻量 chart helper；`./full` 子入口导出完整 ECharts 包和 full renderer，仅供自定义 ECharts 等确实需要完整 option 能力的物料使用。

## 18.3 Package.json 导出配置

```jsonc
// packages/core/package.json
{
  "name": "@easyink/core",
  "type": "module",
  "exports": { ".": "./dist/index.mjs" },
  "files": ["dist"]
}

// packages/viewer/package.json
{
  "name": "@easyink/viewer",
  "type": "module",
  "exports": { ".": "./dist/index.mjs" }
}
```

说明：

- `exports` 仍只暴露 ESM 入口。
- `@easyink/designer` 必须持续暴露 `./locale` 与 `./index.css` 子路径，并从 `@easyink/locales` re-export 内置语言包。
- `@easyink/viewer` 必须维持无 Vue 依赖的最小运行时入口，允许业务方只消费 Schema、data、预览和打印能力而不引入设计器。
- 物料包的子路径必须与 `tsdown.config.ts` entry 和 `package.json exports` 同步；新增懒加载入口时要补 package export 测试或构建验证，避免源码可 import 但发布产物缺入口。

## 18.4 当前不导出的能力

- `@easyink/viewer/pdf`
- `@easyink/viewer/print`
- `@easyink/viewer/image`

这些子路径若未来重新引入，应作为独立扩展包或独立入口，而不是默认核心产物的一部分。当前 PDF 导出能力主要通过 `ViewerExporter` 或独立导出 runtime 承接，不作为 `@easyink/viewer/pdf` 子路径暴露。
