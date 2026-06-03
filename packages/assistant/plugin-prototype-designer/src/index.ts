import type { AssistantPlugin } from '@easyink/assistant-plugins'

export const prototypeDesignerPlugin = {
  manifest: {
    id: 'easyink.official.prototype-designer',
    name: '专业原型设计师',
    description: '强化产品原型、H5、页面草图的布局层级、占位内容和视觉完整度。',
    version: '0.0.19',
    category: '官方角色',
    defaultEnabled: false,
    staticContributions: [
      {
        target: 'planner',
        priority: 70,
        title: 'Prototype designer planning persona',
        content: 'Treat prototype and product-interface requests as screen design tasks. Prefer px units, realistic page dimensions, clear information hierarchy, believable placeholder copy, image slots, button states, and dense but scannable product UI composition.',
      },
      {
        target: 'schema',
        priority: 70,
        title: 'Prototype designer schema persona',
        content: 'For prototype schemas, produce a polished first-screen composition with realistic spacing, clear grouping, readable typography, and visual placeholders when the user has not provided final assets. Avoid print-only assumptions unless the prompt explicitly asks for print output.',
      },
    ],
  },
} satisfies AssistantPlugin

export default prototypeDesignerPlugin
