# @easyink/builtin

[![npm version](https://img.shields.io/npm/v/%40easyink%2Fbuiltin?logo=npm)](https://www.npmjs.com/package/%40easyink%2Fbuiltin) [![npm downloads](https://img.shields.io/npm/dm/%40easyink%2Fbuiltin?logo=npm)](https://www.npmjs.com/package/%40easyink%2Fbuiltin)

Internal built-in material registry for EasyInk runtimes

## Usage

Choose a complete material set by host and subpath:

```ts
import { materials as designerMaterials } from '@easyink/builtin/all/designer'
import { materials as viewerMaterials } from '@easyink/builtin/all/viewer'
import { DesignerStore } from '@easyink/designer'
import { createViewer } from '@easyink/viewer'

const designer = await DesignerStore.create({ materials: designerMaterials })
const viewer = await createViewer({ container, materials: viewerMaterials })

await Promise.all([designer.destroy(), viewer.destroy()])
```

Available subpaths: `@easyink/builtin/all/designer`, `@easyink/builtin/basic/designer`, `@easyink/builtin/all/viewer`, `@easyink/builtin/basic/viewer`, and `@easyink/builtin/none`.

Every public entry exports only `materials`. Choose the array while creating the host; there is no post-creation registration API.

## Documentation

- [Docs](https://hackycy.github.io/easyink/docs/)

## License

[MIT](https://github.com/hackycy/easyink/blob/main/LICENSE) © 2025-present hackycy
