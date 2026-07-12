# @easyink/designer

[![npm version](https://img.shields.io/npm/v/%40easyink%2Fdesigner?logo=npm)](https://www.npmjs.com/package/%40easyink%2Fdesigner)

EasyInk document/report designer workbench.

## Material profile

Designer receives either one precompiled profile or a package list:

```ts
const runtimeConfig = {
  materials: {
    profile,
  },
} satisfies DesignerRuntimeConfig
```

```vue
<EasyInkDesigner
  v-model:schema="schema"
  :runtime-config="runtimeConfig"
/>
```

`materials.profile` and `materials.packages` are mutually exclusive. The Designer consumes only the profile's Designer surface. Property panels use manifest property accessors, binding UI uses declared ports, and schema publication is validated against load/edit/history sidecars.

## Documentation

- [Docs](https://hackycy.github.io/easyink/docs/)

## License

[MIT](https://github.com/hackycy/easyink/blob/main/LICENSE) © 2025-present hackycy
