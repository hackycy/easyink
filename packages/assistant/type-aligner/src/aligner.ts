import type { FieldType, MaterialKnowledge, MaterialKnowledgeRegistry } from '@easyink/assistant-material-knowledge'
import type {
  AlignmentResult,
  DataTypeSignature,
  FieldMapping,
  FieldTransform,
  MissingField,
  RequiredDataShape,
  RequiredField,
  TypedField,
  UnmatchedField,
} from './types'

export class TypeAligner {
  private readonly registry: MaterialKnowledgeRegistry

  constructor(registry: MaterialKnowledgeRegistry) {
    this.registry = registry
  }

  infer(sample: unknown, name = 'dataSource'): DataTypeSignature {
    return { name, fields: this.inferFields(sample, '') }
  }

  demand(materialType: string): RequiredDataShape | undefined {
    const knowledge = this.registry.get(materialType)
    if (!knowledge)
      return undefined
    return {
      materialType,
      bindingMode: knowledge.bindingSpec.mode,
      fields: this.deriveRequiredFields(knowledge),
    }
  }

  align(available: DataTypeSignature, required: RequiredDataShape): AlignmentResult {
    const matched: FieldMapping[] = []
    const unmatched: UnmatchedField[] = []
    const missing: MissingField[] = []
    const transforms: FieldTransform[] = []

    const flatAvailable = this.flattenFields(available.fields)

    for (const req of required.fields) {
      const candidates = flatAvailable.filter(f => this.isTypeCompatible(f.type, req.acceptTypes, f.isArray, req.isArray))
      if (candidates.length > 0) {
        const best = candidates[0]
        matched.push({
          sourcePath: best.path,
          targetRole: req.role,
          sourceType: best.type,
          targetType: req.acceptTypes[0],
          confidence: best.type === req.acceptTypes[0] ? 1.0 : 0.7,
        })
      }
      else if (req.required) {
        missing.push({ role: req.role, acceptTypes: req.acceptTypes, required: true })
      }
    }

    for (const field of flatAvailable) {
      if (!matched.some(m => m.sourcePath === field.path)) {
        unmatched.push({ path: field.path, type: field.type, reason: 'No matching material requirement' })
      }
    }

    const totalRequired = required.fields.filter(f => f.required).length
    const matchedRequired = matched.filter(m => required.fields.find(r => r.role === m.targetRole)?.required).length
    const confidence = totalRequired > 0 ? matchedRequired / totalRequired : 1.0

    return { matched, unmatched, missing, transforms, confidence }
  }

  generateBindings(signature: DataTypeSignature, materialType: string): Record<string, string> {
    const knowledge = this.registry.get(materialType)
    if (!knowledge)
      return {}

    const bindings: Record<string, string> = {}
    const flatFields = this.flattenFields(signature.fields)

    if (knowledge.bindingSpec.mode === 'scalar') {
      const first = flatFields.find(f => !f.isArray)
      if (first)
        bindings.fieldPath = first.path
    }
    else if (knowledge.bindingSpec.mode === 'collection') {
      const arrayField = flatFields.find(f => f.isArray)
      if (arrayField) {
        bindings.collectionPath = arrayField.path
        const children = signature.fields.find(f => f.path === arrayField.path)?.children ?? []
        for (const child of children) {
          bindings[child.name] = `${arrayField.path}/${child.name}`
        }
      }
    }

    return bindings
  }

  private inferFields(sample: unknown, parentPath: string): TypedField[] {
    if (sample === null || sample === undefined)
      return []
    if (Array.isArray(sample)) {
      if (sample.length === 0)
        return []
      const first = sample[0]
      if (typeof first === 'object' && first !== null) {
        return [{
          path: parentPath || 'items',
          name: parentPath.split('/').pop() || 'items',
          type: 'array',
          isArray: true,
          children: this.inferFields(first, parentPath || 'items'),
        }]
      }
      return []
    }
    if (typeof sample === 'object') {
      const fields: TypedField[] = []
      for (const [key, value] of Object.entries(sample as Record<string, unknown>)) {
        const path = parentPath ? `${parentPath}/${key}` : key
        if (Array.isArray(value)) {
          const childFields = value.length > 0 && typeof value[0] === 'object'
            ? this.inferFields(value[0], path)
            : []
          fields.push({ path, name: key, type: 'array', isArray: true, children: childFields })
        }
        else if (typeof value === 'object' && value !== null) {
          fields.push({ path, name: key, type: 'object', isArray: false, children: this.inferFields(value, path) })
        }
        else {
          fields.push({ path, name: key, type: this.inferPrimitiveType(value), isArray: false })
        }
      }
      return fields
    }
    return []
  }

  private inferPrimitiveType(value: unknown): FieldType {
    if (typeof value === 'number')
      return 'number'
    if (typeof value === 'boolean')
      return 'boolean'
    if (typeof value === 'string') {
      if (/^\d{4}-\d{2}-\d{2}/.test(value))
        return 'date'
      if (/^https?:\/\/.*\.(?:png|jpg|jpeg|gif|svg|webp)/i.test(value))
        return 'image-url'
    }
    return 'string'
  }

  private deriveRequiredFields(knowledge: MaterialKnowledge): RequiredField[] {
    const spec = knowledge.bindingSpec
    if (spec.mode === 'none')
      return []
    if (spec.mode === 'scalar') {
      return [{ role: 'value', acceptTypes: spec.accepts.types, isArray: false, required: true }]
    }
    if (spec.mode === 'collection') {
      const fields: RequiredField[] = [{ role: 'collection', acceptTypes: ['array'], isArray: true, required: true }]
      if (spec.accepts.requiredChildFields) {
        for (const f of spec.accepts.requiredChildFields) {
          fields.push({ role: f, acceptTypes: ['string', 'number'], isArray: false, required: true })
        }
      }
      return fields
    }
    return [{ role: 'field', acceptTypes: spec.accepts.types, isArray: false, required: false }]
  }

  private flattenFields(fields: TypedField[], result: TypedField[] = []): TypedField[] {
    for (const field of fields) {
      result.push(field)
      if (field.children)
        this.flattenFields(field.children, result)
    }
    return result
  }

  private isTypeCompatible(sourceType: FieldType, targetTypes: FieldType[], sourceArray: boolean, targetArray: boolean): boolean {
    if (sourceArray !== targetArray)
      return false
    return targetTypes.includes(sourceType)
  }
}
