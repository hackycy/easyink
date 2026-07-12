# @easyink/core

[![npm version](https://img.shields.io/npm/v/%40easyink%2Fcore?logo=npm)](https://www.npmjs.com/package/%40easyink%2Fcore)

Shared material-platform, editing, layout, and rendering contracts for EasyInk.

## Material platform

```ts
import {
  compileMaterialProfile,
  EASYINK_ENGINE_VERSION,
  loadDocumentWithProfile,
} from '@easyink/core'

const profile = compileMaterialProfile({
  id: 'application',
  engineVersion: EASYINK_ENGINE_VERSION,
  packages: [applicationMaterialPackage],
})

const loaded = loadDocumentWithProfile(input, profile)
const node = profile.createNode('acme/price-tag', { model: { value: 10 } })
```

The compiled profile is immutable and owns material manifests, namespace/package admission, surface intersections, node creation, and document budgets. Canonical nodes use `model`, `slots`, `bindings`, and `output`; material-private data belongs under `model`.

Public platform APIs include:

- `defineMaterialManifest`, `defineMaterialFacetFactory`, `compileMaterialProfile`
- `loadDocumentWithProfile`, `validateDocumentWithProfile`
- `MaterialFacetHost`
- material graph introspection, identity/reference validation, and clone helpers
- property accessors with declared RFC 6901 paths
- semantic Viewer render-tree builders and capability contracts
- `runMaterialConformance` and `assertMaterialConformance`

## Documentation

- [Architecture](https://github.com/hackycy/easyink/tree/main/.github/architecture)
- [Docs](https://hackycy.github.io/easyink/docs/)

## License

[MIT](https://github.com/hackycy/easyink/blob/main/LICENSE) © 2025-present hackycy
