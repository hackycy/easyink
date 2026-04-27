# EasyInk

[![License][license-src]][license-href]

✨ EasyInk - Print is Easy!

## Packages

| Package | Version |
| --- | --- |
| [@easyink/ai](packages/ai) | [![npm][ai-npm-version-src]][ai-npm-version-href] |
| [@easyink/core](packages/core) | [![npm][core-npm-version-src]][core-npm-version-href] |
| [@easyink/datasource](packages/datasource) | [![npm][datasource-npm-version-src]][datasource-npm-version-href] |
| [@easyink/designer](packages/designer) | [![npm][designer-npm-version-src]][designer-npm-version-href] |
| [@easyink/icons](packages/icons) | [![npm][icons-npm-version-src]][icons-npm-version-href] |
| [@easyink/mcp-server](packages/mcp-server) | [![npm][mcp-server-npm-version-src]][mcp-server-npm-version-href] |
| [@easyink/samples](packages/samples) | [![npm][samples-npm-version-src]][samples-npm-version-href] |
| [@easyink/schema](packages/schema) | [![npm][schema-npm-version-src]][schema-npm-version-href] |
| [@easyink/schema-tools](packages/schema-tools) | [![npm][schema-tools-npm-version-src]][schema-tools-npm-version-href] |
| [@easyink/shared](packages/shared) | [![npm][shared-npm-version-src]][shared-npm-version-href] |
| [@easyink/ui](packages/ui) | [![npm][ui-npm-version-src]][ui-npm-version-href] |
| [@easyink/viewer](packages/viewer) | [![npm][viewer-npm-version-src]][viewer-npm-version-href] |
| [@easyink/viewer-materials-builtin](packages/viewer-materials-builtin) | [![npm][viewer-materials-builtin-npm-version-src]][viewer-materials-builtin-npm-version-href] |
| [@easyink/material-barcode](packages/materials/barcode) | [![npm][material-barcode-npm-version-src]][material-barcode-npm-version-href] |
| [@easyink/material-chart](packages/materials/chart) | [![npm][material-chart-npm-version-src]][material-chart-npm-version-href] |
| [@easyink/material-container](packages/materials/container) | [![npm][material-container-npm-version-src]][material-container-npm-version-href] |
| [@easyink/material-ellipse](packages/materials/ellipse) | [![npm][material-ellipse-npm-version-src]][material-ellipse-npm-version-href] |
| [@easyink/material-image](packages/materials/image) | [![npm][material-image-npm-version-src]][material-image-npm-version-href] |
| [@easyink/material-line](packages/materials/line) | [![npm][material-line-npm-version-src]][material-line-npm-version-href] |
| [@easyink/material-page-number](packages/materials/page-number) | [![npm][material-page-number-npm-version-src]][material-page-number-npm-version-href] |
| [@easyink/material-qrcode](packages/materials/qrcode) | [![npm][material-qrcode-npm-version-src]][material-qrcode-npm-version-href] |
| [@easyink/material-rect](packages/materials/rect) | [![npm][material-rect-npm-version-src]][material-rect-npm-version-href] |
| [@easyink/material-svg](packages/materials/svg) | [![npm][material-svg-npm-version-src]][material-svg-npm-version-href] |
| [@easyink/material-table-data](packages/materials/table-data) | [![npm][material-table-data-npm-version-src]][material-table-data-npm-version-href] |
| [@easyink/material-table-kernel](packages/materials/table-kernel) | [![npm][material-table-kernel-npm-version-src]][material-table-kernel-npm-version-href] |
| [@easyink/material-table-static](packages/materials/table-static) | [![npm][material-table-static-npm-version-src]][material-table-static-npm-version-href] |
| [@easyink/material-text](packages/materials/text) | [![npm][material-text-npm-version-src]][material-text-npm-version-href] |

## Release

1. 为需要发布的变更添加 changeset：`pnpm changeset`。
2. 合并到 `main` 后，GitHub Actions 会创建 Changesets release PR。
3. 合并 release PR 后，发布 workflow 会先执行 `pnpm build`，再通过 GitHub OIDC + npm Trusted Publishing 发布到 npm。
4. 新包首次发布需要维护者先手动发布一次，并在 npmjs.com 为对应包配置 Trusted Publisher；之后不再使用 `NPM_TOKEN`。

## Development

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm build
```

## License

[MIT](./LICENSE)

[license-src]: https://img.shields.io/github/license/hackycy/easyink.svg?style=flat&colorA=080f12&colorB=1fa669
[license-href]: https://github.com/hackycy/easyink/blob/main/LICENSE

[ai-npm-version-src]: https://img.shields.io/npm/v/@easyink/ai?style=flat&colorA=080f12&colorB=1fa669
[ai-npm-version-href]: https://npmjs.com/package/@easyink/ai
[core-npm-version-src]: https://img.shields.io/npm/v/@easyink/core?style=flat&colorA=080f12&colorB=1fa669
[core-npm-version-href]: https://npmjs.com/package/@easyink/core
[datasource-npm-version-src]: https://img.shields.io/npm/v/@easyink/datasource?style=flat&colorA=080f12&colorB=1fa669
[datasource-npm-version-href]: https://npmjs.com/package/@easyink/datasource
[designer-npm-version-src]: https://img.shields.io/npm/v/@easyink/designer?style=flat&colorA=080f12&colorB=1fa669
[designer-npm-version-href]: https://npmjs.com/package/@easyink/designer
[icons-npm-version-src]: https://img.shields.io/npm/v/@easyink/icons?style=flat&colorA=080f12&colorB=1fa669
[icons-npm-version-href]: https://npmjs.com/package/@easyink/icons
[mcp-server-npm-version-src]: https://img.shields.io/npm/v/@easyink/mcp-server?style=flat&colorA=080f12&colorB=1fa669
[mcp-server-npm-version-href]: https://npmjs.com/package/@easyink/mcp-server
[samples-npm-version-src]: https://img.shields.io/npm/v/@easyink/samples?style=flat&colorA=080f12&colorB=1fa669
[samples-npm-version-href]: https://npmjs.com/package/@easyink/samples
[schema-npm-version-src]: https://img.shields.io/npm/v/@easyink/schema?style=flat&colorA=080f12&colorB=1fa669
[schema-npm-version-href]: https://npmjs.com/package/@easyink/schema
[schema-tools-npm-version-src]: https://img.shields.io/npm/v/@easyink/schema-tools?style=flat&colorA=080f12&colorB=1fa669
[schema-tools-npm-version-href]: https://npmjs.com/package/@easyink/schema-tools
[shared-npm-version-src]: https://img.shields.io/npm/v/@easyink/shared?style=flat&colorA=080f12&colorB=1fa669
[shared-npm-version-href]: https://npmjs.com/package/@easyink/shared
[ui-npm-version-src]: https://img.shields.io/npm/v/@easyink/ui?style=flat&colorA=080f12&colorB=1fa669
[ui-npm-version-href]: https://npmjs.com/package/@easyink/ui
[viewer-npm-version-src]: https://img.shields.io/npm/v/@easyink/viewer?style=flat&colorA=080f12&colorB=1fa669
[viewer-npm-version-href]: https://npmjs.com/package/@easyink/viewer
[viewer-materials-builtin-npm-version-src]: https://img.shields.io/npm/v/@easyink/viewer-materials-builtin?style=flat&colorA=080f12&colorB=1fa669
[viewer-materials-builtin-npm-version-href]: https://npmjs.com/package/@easyink/viewer-materials-builtin
[material-barcode-npm-version-src]: https://img.shields.io/npm/v/@easyink/material-barcode?style=flat&colorA=080f12&colorB=1fa669
[material-barcode-npm-version-href]: https://npmjs.com/package/@easyink/material-barcode
[material-chart-npm-version-src]: https://img.shields.io/npm/v/@easyink/material-chart?style=flat&colorA=080f12&colorB=1fa669
[material-chart-npm-version-href]: https://npmjs.com/package/@easyink/material-chart
[material-container-npm-version-src]: https://img.shields.io/npm/v/@easyink/material-container?style=flat&colorA=080f12&colorB=1fa669
[material-container-npm-version-href]: https://npmjs.com/package/@easyink/material-container
[material-ellipse-npm-version-src]: https://img.shields.io/npm/v/@easyink/material-ellipse?style=flat&colorA=080f12&colorB=1fa669
[material-ellipse-npm-version-href]: https://npmjs.com/package/@easyink/material-ellipse
[material-image-npm-version-src]: https://img.shields.io/npm/v/@easyink/material-image?style=flat&colorA=080f12&colorB=1fa669
[material-image-npm-version-href]: https://npmjs.com/package/@easyink/material-image
[material-line-npm-version-src]: https://img.shields.io/npm/v/@easyink/material-line?style=flat&colorA=080f12&colorB=1fa669
[material-line-npm-version-href]: https://npmjs.com/package/@easyink/material-line
[material-page-number-npm-version-src]: https://img.shields.io/npm/v/@easyink/material-page-number?style=flat&colorA=080f12&colorB=1fa669
[material-page-number-npm-version-href]: https://npmjs.com/package/@easyink/material-page-number
[material-qrcode-npm-version-src]: https://img.shields.io/npm/v/@easyink/material-qrcode?style=flat&colorA=080f12&colorB=1fa669
[material-qrcode-npm-version-href]: https://npmjs.com/package/@easyink/material-qrcode
[material-rect-npm-version-src]: https://img.shields.io/npm/v/@easyink/material-rect?style=flat&colorA=080f12&colorB=1fa669
[material-rect-npm-version-href]: https://npmjs.com/package/@easyink/material-rect
[material-svg-npm-version-src]: https://img.shields.io/npm/v/@easyink/material-svg?style=flat&colorA=080f12&colorB=1fa669
[material-svg-npm-version-href]: https://npmjs.com/package/@easyink/material-svg
[material-table-data-npm-version-src]: https://img.shields.io/npm/v/@easyink/material-table-data?style=flat&colorA=080f12&colorB=1fa669
[material-table-data-npm-version-href]: https://npmjs.com/package/@easyink/material-table-data
[material-table-kernel-npm-version-src]: https://img.shields.io/npm/v/@easyink/material-table-kernel?style=flat&colorA=080f12&colorB=1fa669
[material-table-kernel-npm-version-href]: https://npmjs.com/package/@easyink/material-table-kernel
[material-table-static-npm-version-src]: https://img.shields.io/npm/v/@easyink/material-table-static?style=flat&colorA=080f12&colorB=1fa669
[material-table-static-npm-version-href]: https://npmjs.com/package/@easyink/material-table-static
[material-text-npm-version-src]: https://img.shields.io/npm/v/@easyink/material-text?style=flat&colorA=080f12&colorB=1fa669
[material-text-npm-version-href]: https://npmjs.com/package/@easyink/material-text
