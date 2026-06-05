import type { FieldType, MaterialKnowledge, MaterialKnowledgeRegistry } from '@easyink/assistant-material-knowledge'
import type {
  AlignmentResult,
  DataTypeSignature,
  FieldMapping,
  FieldTransform,
  GeneratedMaterialBinding,
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
    const usedPaths = new Set<string>()

    for (const req of required.fields) {
      const candidates = flatAvailable
        .filter(f => !usedPaths.has(f.path) && this.isFieldCompatible(f, req))
        .map(field => ({ field, score: this.scoreRoleMatch(req.role, field) }))
        .sort((a, b) => b.score - a.score)
      if (candidates.length > 0) {
        const best = candidates[0]!.field
        usedPaths.add(best.path)
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

  generateBindings(signature: DataTypeSignature, materialType: string): GeneratedMaterialBinding {
    const knowledge = this.registry.get(materialType)
    if (!knowledge)
      return { kind: 'none' }

    const flatFields = this.flattenFields(signature.fields)

    if (knowledge.bindingSpec.mode === 'scalar') {
      const first = flatFields.find(f => !f.isArray)
      if (first) {
        return {
          kind: 'binding-ref',
          binding: {
            sourceId: signature.name,
            sourceName: signature.name,
            fieldPath: first.path,
            fieldLabel: first.title ?? first.name,
          },
        }
      }
    }
    else if (knowledge.bindingSpec.mode === 'collection') {
      if (knowledge.bindingSpec.produces.kind === 'multi-field') {
        const requiredRoles = knowledge.bindingSpec.accepts.requiredChildFields ?? []
        const matched = this.matchRoles(requiredRoles, flatFields)
        if (Object.keys(matched).length > 0) {
          return {
            kind: 'data-contract',
            binding: {
              kind: 'data-contract',
              mappings: Object.fromEntries(Object.entries(matched).map(([role, field]) => [
                role,
                {
                  sourceId: signature.name,
                  sourceName: signature.name,
                  select: {
                    path: field.path,
                    label: field.title ?? field.name,
                  },
                },
              ])),
              relation: { kind: 'auto' },
            },
          }
        }
      }

      const arrayField = flatFields.find(f => f.isArray)
      if (arrayField) {
        const fields: Record<string, string> = {}
        const children = signature.fields.find(f => f.path === arrayField.path)?.children ?? []
        for (const child of children)
          fields[child.name] = `${arrayField.path}/${child.name}`
        return { kind: 'collection-path', collectionPath: arrayField.path, fields }
      }
    }

    return { kind: 'none' }
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
          itemType: 'object',
          isArray: true,
          children: this.inferFields(first, parentPath || 'items'),
        }]
      }
      return [{
        path: parentPath || 'items',
        name: parentPath.split('/').pop() || 'items',
        type: 'array',
        itemType: this.inferPrimitiveType(first),
        isArray: true,
      }]
    }
    if (typeof sample === 'object') {
      const fields: TypedField[] = []
      for (const [key, value] of Object.entries(sample as Record<string, unknown>)) {
        const path = parentPath ? `${parentPath}/${key}` : key
        if (Array.isArray(value)) {
          const first = value[0]
          const childFields = value.length > 0 && typeof first === 'object' && first !== null
            ? this.inferFields(value[0], path)
            : []
          fields.push({
            path,
            name: key,
            type: 'array',
            itemType: value.length > 0
              ? typeof first === 'object' && first !== null ? 'object' : this.inferPrimitiveType(first)
              : undefined,
            isArray: true,
            children: childFields,
          })
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
        for (const f of spec.accepts.requiredChildFields)
          fields.push({ role: f, acceptTypes: this.acceptTypesForRole(f), isArray: false, required: true })
      }
      return fields
    }
    return [{ role: 'field', acceptTypes: spec.accepts.types, isArray: false, required: false }]
  }

  private matchRoles(roles: string[], fields: TypedField[]): Record<string, TypedField> {
    const result: Record<string, TypedField> = {}
    const used = new Set<string>()
    for (const role of roles) {
      const candidates = fields
        .filter(field => !used.has(field.path) && this.roleCanUseField(role, field))
        .map(field => ({ field, score: this.scoreRoleMatch(role, field) }))
        .filter(candidate => candidate.score > 0)
        .sort((a, b) => b.score - a.score)
      const best = candidates[0]
      if (best) {
        result[role] = best.field
        used.add(best.field.path)
      }
    }
    return result
  }

  private scoreRoleMatch(role: string, field: TypedField): number {
    const roleText = role.toLowerCase()
    const fieldText = `${field.name} ${field.path} ${field.title ?? ''}`.toLowerCase()
    const effectiveType = this.effectiveFieldType(field)
    let score = 0

    if (fieldText.includes(roleText))
      score += 5
    if (roleText === 'category') {
      if (effectiveType && ['string', 'date'].includes(effectiveType))
        score += 3
      if (/category|label|name|title|month|date|day|type|group/i.test(fieldText))
        score += 4
    }
    else if (roleText === 'value') {
      if (effectiveType === 'number')
        score += 5
      if (/value|amount|total|price|revenue|sales|count|qty|quantity|number|score|rate/i.test(fieldText))
        score += 4
    }
    else {
      score += this.isTypeCompatible(field.type, ['string', 'number'], field.isArray, false) ? 1 : 0
    }
    return score
  }

  private roleCanUseField(role: string, field: TypedField): boolean {
    const effectiveType = this.effectiveFieldType(field)
    if (!effectiveType)
      return false
    return this.acceptTypesForRole(role).includes(effectiveType)
  }

  private effectiveFieldType(field: TypedField): FieldType | undefined {
    if (field.isArray)
      return field.itemType && field.itemType !== 'object' ? field.itemType : undefined
    return field.type
  }

  private isFieldCompatible(field: TypedField, requirement: RequiredField): boolean {
    if (field.isArray === requirement.isArray)
      return this.isTypeCompatible(field.type, requirement.acceptTypes, field.isArray, requirement.isArray)
    if (field.isArray && !requirement.isArray && field.itemType)
      return requirement.acceptTypes.includes(field.itemType)
    return false
  }

  private acceptTypesForRole(role: string): FieldType[] {
    if (role === 'category')
      return ['string', 'date']
    if (role === 'value')
      return ['number']
    return ['string', 'number']
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
