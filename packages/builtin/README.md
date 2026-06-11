# @easyink/builtin

[![npm version](https://img.shields.io/npm/v/%40easyink%2Fbuiltin?logo=npm)](https://www.npmjs.com/package/%40easyink%2Fbuiltin) [![npm downloads](https://img.shields.io/npm/dm/%40easyink%2Fbuiltin?logo=npm)](https://www.npmjs.com/package/%40easyink%2Fbuiltin)

Internal built-in material registry for EasyInk runtimes

## Usage

Choose a material set by subpath:

```ts
import { builtinDesignerMaterialBundle, registerBuiltinViewerMaterials } from '@easyink/builtin/all'

const runtimeConfig = {
  materials: {
    bundles: [builtinDesignerMaterialBundle],
  },
}

registerBuiltinViewerMaterials((type, binding, extension) => {
  viewer.registerMaterial(type, binding, extension)
})
```

Available subpaths: `@easyink/builtin/all`, `@easyink/builtin/basic`, `@easyink/builtin/none`.

## Documentation

- [Docs](https://hackycy.github.io/easyink/docs/)

## License

[MIT](https://github.com/hackycy/easyink/blob/main/LICENSE) © 2025-present hackycy
