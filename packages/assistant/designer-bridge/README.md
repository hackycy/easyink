# @easyink/assistant-designer-bridge

[![npm version](https://img.shields.io/npm/v/%40easyink%2Fassistant-designer-bridge?logo=npm)](https://www.npmjs.com/package/%40easyink%2Fassistant-designer-bridge) [![npm downloads](https://img.shields.io/npm/dm/%40easyink%2Fassistant-designer-bridge?logo=npm)](https://www.npmjs.com/package/%40easyink%2Fassistant-designer-bridge)

Designer contribution bridge for EasyInk Assistant

## Optional plugins

Official Assistant plugins are shipped as separate packages. Hosts decide which
ones to register:

```ts
import { createAssistantContribution } from '@easyink/assistant-designer-bridge'
import { placeholderImagesPlugin } from '@easyink/assistant-plugin-placeholder-images'
import { prototypeDesignerPlugin } from '@easyink/assistant-plugin-prototype-designer'
import { receiptDesignerPlugin } from '@easyink/assistant-plugin-receipt-designer'

const assistant = createAssistantContribution({
  plugins: [
    placeholderImagesPlugin,
    prototypeDesignerPlugin,
    receiptDesignerPlugin,
  ],
})
```

Plugins appear in the Assistant plugin center. The UI only toggles plugins,
calls Promise-based plugin actions, and sends returned structured context to the
orchestrator.

## Documentation

- [Docs](https://hackycy.github.io/easyink/docs/)

## License

[MIT](https://github.com/hackycy/easyink/blob/main/LICENSE) © 2025-present hackycy
