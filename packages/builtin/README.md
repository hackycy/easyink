# @easyink/builtin

[![npm version](https://img.shields.io/npm/v/%40easyink%2Fbuiltin?logo=npm)](https://www.npmjs.com/package/%40easyink%2Fbuiltin)

Immutable built-in material packages and compiled profiles for EasyInk runtimes.

## Usage

```ts
import type { DesignerRuntimeConfig } from '@easyink/designer'
import { compileBuiltinMaterialProfile } from '@easyink/builtin/all'
import { createViewer } from '@easyink/viewer'

const profile = compileBuiltinMaterialProfile('all')
const runtimeConfig = { materials: { profile } } satisfies DesignerRuntimeConfig
const viewer = createViewer({ profile, container: document.body })
```

Pass `runtimeConfig` to Designer and the same compiled profile to Viewer.

Available public subpaths are `@easyink/builtin/all`, `@easyink/builtin/basic`, and `@easyink/builtin/none`. Each exposes its immutable `builtinMaterialPackage` plus `compileBuiltinMaterialProfile`. Built-in conformance runs in an authenticated, bounded child-process gate.

## Documentation

- [Docs](https://hackycy.github.io/easyink/docs/)

## License

[MIT](https://github.com/hackycy/easyink/blob/main/LICENSE) © 2025-present hackycy
