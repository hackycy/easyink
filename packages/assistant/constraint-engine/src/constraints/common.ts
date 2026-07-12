import type { ConstraintContext, MaterialConstraint } from '@easyink/assistant-material-knowledge'
import type { MaterialNode } from '@easyink/schema'

export const commonConstraints: MaterialConstraint[] = [
  {
    id: 'required-model',
    severity: 'error',
    message: 'Element is missing its canonical model',
    check: (node: MaterialNode, _context: ConstraintContext) => {
      if (node.model === null || typeof node.model !== 'object' || Array.isArray(node.model))
        return { passed: false, details: 'No model object' }
      return { passed: true }
    },
  },
  {
    id: 'positive-dimensions',
    severity: 'error',
    message: 'Element must have positive width and height',
    check: (node: MaterialNode) => {
      const passed = node.width > 0 && node.height > 0
      return { passed, details: passed ? undefined : `width=${node.width}, height=${node.height}` }
    },
    autoFix: (node: MaterialNode) => {
      return {
        ...node,
        width: Math.max(node.width, 5),
        height: Math.max(node.height, 5),
      } as MaterialNode
    },
  },
  {
    id: 'non-negative-position',
    severity: 'warning',
    message: 'Element position should not be negative',
    check: (node: MaterialNode) => {
      return { passed: node.x >= 0 && node.y >= 0 }
    },
    autoFix: (node: MaterialNode) => {
      return {
        ...node,
        x: Math.max(node.x, 0),
        y: Math.max(node.y, 0),
      } as MaterialNode
    },
  },
  {
    id: 'valid-element-id',
    severity: 'error',
    message: 'Element must have a non-empty id',
    check: (node: MaterialNode) => {
      return { passed: typeof node.id === 'string' && node.id.length > 0 }
    },
  },
]
