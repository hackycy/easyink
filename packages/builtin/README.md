# @easyink/builtin

[![npm version](https://img.shields.io/npm/v/%40easyink%2Fbuiltin?logo=npm)](https://www.npmjs.com/package/%40easyink%2Fbuiltin)

Immutable built-in material packages and compiled profiles for EasyInk runtimes.

## Usage

```ts
import { compileBuiltinMaterialProfile } from '@easyink/builtin/all'

const profile = compileBuiltinMaterialProfile('all')
```

Pass the same `CompiledMaterialProfile` contract to Designer or Viewer:

```ts
const runtimeConfig = { materials: { profile } }
const viewer = createViewer({ profile, host })
```

Available public subpaths are `@easyink/builtin/all`, `@easyink/builtin/basic`, and `@easyink/builtin/none`. Each exposes its immutable `builtinMaterialPackage` plus `compileBuiltinMaterialProfile`. Built-in conformance runs in an authenticated, bounded child-process gate.

## Documentation

- [Docs](https://hackycy.github.io/easyink/docs/)

## License

[MIT](https://github.com/hackycy/easyink/blob/main/LICENSE) © 2025-present hackycy
