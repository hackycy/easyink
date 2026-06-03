# @easyink/assistant-plugins

Plugin contribution protocol for EasyInk Assistant.

Plugins expose optional static prompt contributions and Promise-based actions.
The Assistant UI owns presentation and state, while plugin actions only return
structured context that can be passed into an Assistant task.

## Shape

```ts
import type { AssistantPlugin } from '@easyink/assistant-plugins'

export const myPlugin = {
  manifest: {
    id: 'example.prompt-library',
    name: 'Prompt Library',
    version: '1.0.0',
    actions: [{ id: 'select', label: 'Select prompt' }],
  },
  async invoke() {
    return {
      contributions: [{
        target: 'schema',
        content: 'Use the selected saved prompt as design guidance.',
      }],
    }
  },
} satisfies AssistantPlugin
```
