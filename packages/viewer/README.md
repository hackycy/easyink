# @easyink/viewer

[![npm version](https://img.shields.io/npm/v/%40easyink%2Fviewer?logo=npm)](https://www.npmjs.com/package/%40easyink%2Fviewer)

Viewer runtime for EasyInk preview, print, and export.

## Usage

```ts
import { compileBuiltinMaterialProfile } from '@easyink/builtin/all'
import { createBrowserViewerHost, createViewer } from '@easyink/viewer'

const host = createBrowserViewerHost(container)
const viewer = createViewer({
  host,
  profile: compileBuiltinMaterialProfile('all'),
})

await viewer.open({ schema, data })
```

Viewer loads documents through the compiled profile, activates Viewer facets through `MaterialFacetHost`, and renders semantic trees through browser capabilities. Raw HTML is not a render contract. Sanitized markup is an opaque capability token; imperative DOM requires both facet and host grants and a disposer lifecycle.

`break-opportunities` is currently a core scheduling declaration. The complete Viewer break/layout API remains a separate Viewer Layout dependency.

## Documentation

- [Docs](https://hackycy.github.io/easyink/docs/)

## License

[MIT](https://github.com/hackycy/easyink/blob/main/LICENSE) © 2025-present hackycy
