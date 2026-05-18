# 18. 构建与产物

## 18.1 构建工具链

| 工具 | 用途 |
|------|------|
| **tsdown** | 主构建工具，打包各 package 为主 ESM 产物 |
| **rollup-plugin-vue** | Vue SFC 编译（设计器包） |
| **Vite** | playground/examples 的开发服务器 |
| **TypeScript** | 类型检查（noEmit，声明文件由 tsdown 生成） |

## 18.2 产物格式

主产物保持 **ESM**，同时为浏览器直接落地场景补充 **IIFE** 兼容包：

```
packages/core/dist/
  ├── index.mjs
  ├── index.d.mts
  └── chunks/

packages/viewer/dist/
  ├── index.mjs
  ├── index.d.mts
  ├── browser/
  │   └── index.global.js
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
  ├── browser/
  │   └── index.global.js
  └── style.css

packages/locales/dist/
  ├── index.mjs
  └── index.d.mts

packages/prop-schemas/dist/
  ├── index.mjs
  └── index.d.mts
```

约束如下：

- npm / workspace 的主消费面继续以 ESM 为准。
- IIFE 是兼容补充，不改变主入口，也不回退到 CJS/UMD 多格式维护。
- `@easyink/viewer` 的 IIFE 优先级高于 `@easyink/designer`，因为独立预览、打印和导出是更稳定的浏览器消费面。
- `@easyink/designer` 的 IIFE 仅服务无需构建链的嵌入式场景，不反向要求 viewer 带上设计器依赖。
- `@easyink/locales` 与 `@easyink/prop-schemas` 只发布 ESM 主入口和类型声明；designer 的 `./locale` 子路径是 facade，编译产物应保持轻量 re-export。
- `@easyink/export-runtime` 只发布 ESM 主入口，仅含运行时内核，不绑定第三方导出库。
- `@easyink/export-plugin-dom-pdf` 只发布 ESM 主入口；`html2canvas` / `jspdf` 在 plugin 内部动态 import 按需装载。

## 18.3 Package.json 导出配置

```jsonc
// packages/core/package.json
{
  "name": "@easyink/core",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "types": "./dist/index.d.mts"
    }
  },
  "files": ["dist"]
}

// packages/viewer/package.json
{
  "name": "@easyink/viewer",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "types": "./dist/index.d.mts"
    }
  }
}
```

说明：

- `exports` 仍只暴露 ESM 入口和类型声明。
- `@easyink/designer` 必须持续暴露 `./locale` 子路径，并从 `@easyink/locales` re-export 内置语言包，避免应用层依赖语言文件物理路径。
- CDN 用 IIFE 文件作为附加发布产物存在于 `dist/browser/` 或 release artifact 中，不纳入 `exports` 主合同。
- `@easyink/viewer` 必须维持无 Vue 依赖的最小运行时入口，允许业务方只消费 Schema、data、预览和打印能力而不引入设计器。

## 18.4 当前不导出的能力

- `@easyink/viewer/pdf`
- `@easyink/viewer/print`
- `@easyink/viewer/image`

这些子路径若未来重新引入，应作为独立扩展包或独立入口，而不是默认核心产物的一部分。当前 PDF 导出能力归属 `@easyink/export-runtime`，不作为 `@easyink/viewer/pdf` 子路径暴露。
