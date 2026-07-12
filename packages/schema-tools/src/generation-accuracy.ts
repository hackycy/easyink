import type { CompiledMaterialProfile } from '@easyink/core'
import type { BindingRef, DocumentSchema, MaterialNode } from '@easyink/schema'
import type { AIGenerationPlan, JsonObject } from '@easyink/shared'
import { loadDocumentWithProfile, validateDocumentWithProfile, walkMaterialNodes, writePointer } from '@easyink/core'
import { traverseNodes } from '@easyink/schema'
import { deepClone, FIELD_PATH_SEPARATOR } from '@easyink/shared'

export interface GenerationRepairIssue {
  code: string
  message: string
  path: string
  original: unknown
  fixed: unknown
}

export interface GenerationAccuracyIssue {
  code: string
  message: string
  path: string
}

export interface GenerationAccuracyOptions {
  allowedMaterialTypes: Set<string>
  materialAliases?: Record<string, string>
  plan?: AIGenerationPlan
  profile?: CompiledMaterialProfile
  generationContracts?: ReadonlyMap<string, { modelSchema: JsonObject, bindingShape: JsonObject, requiredModelPaths?: readonly string[] }>
}

export function repairGeneratedSchema(
  schema: DocumentSchema,
  options: GenerationAccuracyOptions,
): { schema: DocumentSchema, issues: GenerationRepairIssue[] } {
  const fixed = deepClone(schema)
  const issues: GenerationRepairIssue[] = []

  applyPagePlan(fixed, options.plan, issues)
  repairElements(fixed.elements, options, issues, 'elements')
  normalizeBindings(fixed, options.profile, issues)

  return { schema: fixed, issues }
}

export function validateGeneratedSchemaAccuracy(
  schema: DocumentSchema,
  options: GenerationAccuracyOptions,
): GenerationAccuracyIssue[] {
  const issues: GenerationAccuracyIssue[] = []
  validateElements(schema.elements, options, issues, 'elements')
  if (options.profile)
    collectProfileDiagnostics(schema, options.profile, issues)
  return issues
}

function applyPagePlan(
  schema: DocumentSchema,
  plan: AIGenerationPlan | undefined,
  issues: GenerationRepairIssue[],
): void {
  if (!plan || plan.domain === 'generic')
    return

  const expected = plan.page
  const page = schema.page
  const fields = ['mode', 'width', 'height'] as const
  for (const field of fields) {
    if (page[field] !== expected[field]) {
      issues.push({
        code: 'PAGE_PLAN_MISMATCH_FIXED',
        message: `Adjusted page.${field} to match inferred ${plan.domain} profile.`,
        path: `page.${field}`,
        original: page[field],
        fixed: expected[field],
      })
      ;(page[field] as typeof expected[typeof field]) = expected[field]
    }
  }
  if (expected.mode === 'continuous') {
    page.layout = { strategy: 'stack-flow', flowAxis: 'y' }
    page.pagination = { strategy: 'none' }
    page.reflow = { strategy: 'flow-y', preserveTrailingGap: true, collisionPolicy: 'diagnose' }
  }
  else if (expected.mode === 'fixed') {
    page.layout = { strategy: 'absolute' }
    page.pagination = { strategy: 'fixed-sheets', pageCount: page.pages }
    page.reflow = { strategy: 'measure-only' }
  }
}

function repairElements(
  elements: MaterialNode[],
  options: GenerationAccuracyOptions,
  issues: GenerationRepairIssue[],
  basePath: string,
): void {
  for (let index = 0; index < elements.length; index++) {
    const element = elements[index]!
    const elementPath = `${basePath}[${index}]`
    const canonicalType = options.materialAliases?.[element.type]
    if (canonicalType && options.allowedMaterialTypes.has(canonicalType)) {
      issues.push({
        code: 'MATERIAL_ALIAS_FIXED',
        message: `Mapped material alias "${element.type}" to canonical type "${canonicalType}".`,
        path: `${elementPath}.type`,
        original: element.type,
        fixed: canonicalType,
      })
      element.type = canonicalType
    }

    for (const [slot, children] of Object.entries(element.slots))
      repairElements(children, options, issues, `${elementPath}.slots.${slot}`)
  }
}

function normalizeBindings(
  schema: DocumentSchema,
  profile: CompiledMaterialProfile | undefined,
  issues: GenerationRepairIssue[],
): void {
  const visit = (node: MaterialNode, binding: BindingRef, path: string): void => {
    if (!binding.fieldPath.includes('.'))
      return
    const fixedPath = binding.fieldPath.replace(/\./g, FIELD_PATH_SEPARATOR)
    issues.push({
      code: 'BINDING_PATH_NORMALIZED',
      message: 'Normalized binding fieldPath from dot notation to slash notation.',
      path: `${node.id}${path}/fieldPath`,
      original: binding.fieldPath,
      fixed: fixedPath,
    })
    writePointer(node, path as `/${string}`, { ...binding, fieldPath: fixedPath })
  }
  if (profile) {
    walkMaterialNodes(schema, profile, (node, _address, introspection) => {
      for (const slot of introspection.bindings)
        visit(node, slot.value, slot.path)
    })
  }
  else {
    traverseNodes(schema, (node) => {
      for (const slot of collectBindingRefs(node.bindings, '/bindings'))
        visit(node, slot.binding, slot.path)
    })
  }
}

function collectBindingRefs(value: unknown, path: `/${string}`): Array<{ binding: BindingRef, path: `/${string}` }> {
  if (!value || typeof value !== 'object')
    return []
  if (!Array.isArray(value)
    && typeof (value as Record<string, unknown>).sourceId === 'string'
    && typeof (value as Record<string, unknown>).fieldPath === 'string') {
    return [{ binding: value as BindingRef, path }]
  }
  const result: Array<{ binding: BindingRef, path: `/${string}` }> = []
  for (const [key, item] of Object.entries(value)) {
    result.push(...collectBindingRefs(item, `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`))
  }
  return result
}

function collectProfileDiagnostics(schema: DocumentSchema, profile: CompiledMaterialProfile, issues: GenerationAccuracyIssue[]): void {
  const loaded = loadDocumentWithProfile(schema, profile)
  const validated = validateDocumentWithProfile(loaded.schema, profile)
  const seen = new Set<string>()
  for (const diagnostic of [...loaded.diagnostics, ...validated.diagnostics]) {
    const key = `${diagnostic.code}:${diagnostic.path}:${diagnostic.nodeId ?? ''}`
    if (seen.has(key))
      continue
    seen.add(key)
    issues.push({
      code: diagnostic.code,
      message: diagnostic.message,
      path: diagnostic.path,
    })
  }
}

function pointerExists(root: unknown, pointer: string): boolean {
  let current = root
  for (const token of pointer.slice(1).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'))) {
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, token))
      return false
    current = (current as Record<string, unknown>)[token]
  }
  return true
}

function validatePortableSchema(value: unknown, schema: JsonObject): boolean {
  if (schema.const !== undefined && value !== schema.const)
    return false
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return false
    const required = Array.isArray(schema.required) ? schema.required : []
    if (required.some(key => typeof key !== 'string' || !Object.hasOwn(value, key)))
      return false
    const properties = schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
      ? schema.properties as JsonObject
      : {}
    const patterns = schema.patternProperties && typeof schema.patternProperties === 'object' && !Array.isArray(schema.patternProperties)
      ? schema.patternProperties as JsonObject
      : {}
    for (const [key, item] of Object.entries(value)) {
      const child = properties[key]
        ?? Object.entries(patterns).find(([source]) => new RegExp(source, 'u').test(key))?.[1]
        ?? (schema.additionalProperties && typeof schema.additionalProperties === 'object' && !Array.isArray(schema.additionalProperties)
          ? schema.additionalProperties
          : undefined)
      if (child && typeof child === 'object' && !Array.isArray(child) && !validatePortableSchema(item, child)) {
        return false
      }
      if (child === undefined && schema.additionalProperties === false)
        return false
    }
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value))
      return false
    if (schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items)
      && value.some(item => !validatePortableSchema(item, schema.items as JsonObject))) {
      return false
    }
  }
  if (schema.type === 'string' && typeof value !== 'string')
    return false
  if (schema.type === 'number' && typeof value !== 'number')
    return false
  if (schema.type === 'boolean' && typeof value !== 'boolean')
    return false
  return true
}

function validateElements(
  elements: MaterialNode[],
  options: GenerationAccuracyOptions,
  issues: GenerationAccuracyIssue[],
  basePath: string,
): void {
  for (let index = 0; index < elements.length; index++) {
    const element = elements[index]!
    const elementPath = `${basePath}[${index}]`

    if (!options.allowedMaterialTypes.has(element.type)) {
      issues.push({
        code: 'UNKNOWN_MATERIAL_TYPE',
        message: `Unknown material type "${element.type}". Use only canonical material types from materials.json.`,
        path: `${elementPath}.type`,
      })
    }

    const contract = options.generationContracts?.get(element.type)
    if (contract && !validatePortableSchema(element.model, contract.modelSchema)) {
      issues.push({
        code: 'MATERIAL_MODEL_SCHEMA_INVALID',
        message: `Material model for "${element.type}" does not match its portable generation schema.`,
        path: `${elementPath}.model`,
      })
    }
    for (const path of contract?.requiredModelPaths ?? []) {
      if (!pointerExists(element.model, path)) {
        issues.push({
          code: 'MATERIAL_REQUIRED_MODEL_PATH_MISSING',
          message: `Material model for "${element.type}" is missing required path "${path}".`,
          path: `${elementPath}.model${path}`,
        })
      }
    }
    if (contract && !validatePortableSchema(element.bindings, contract.bindingShape)) {
      issues.push({
        code: 'MATERIAL_BINDING_SHAPE_INVALID',
        message: `Material bindings for "${element.type}" do not match its portable generation shape.`,
        path: `${elementPath}.bindings`,
      })
    }
    for (const [slot, children] of Object.entries(element.slots))
      validateElements(children, options, issues, `${elementPath}.slots.${slot}`)
  }
}
