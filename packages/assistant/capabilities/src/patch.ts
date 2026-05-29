import type { DocumentSchema } from '@easyink/schema'
import type { AssistantPatchOperation, AssistantSchemaDiff } from './types'

export function diffAssistantSchema(
  currentSchema: DocumentSchema | undefined,
  nextSchema: DocumentSchema,
): AssistantSchemaDiff {
  if (!currentSchema) {
    return {
      changed: true,
      operations: [{ op: 'replace', path: '', value: nextSchema }],
      summary: ['Created a full schema candidate.'],
    }
  }

  const operations: AssistantPatchOperation[] = []
  if (JSON.stringify(currentSchema.page) !== JSON.stringify(nextSchema.page)) {
    operations.push({ op: 'replace', path: '/page', value: nextSchema.page })
  }
  if (JSON.stringify(currentSchema.guides) !== JSON.stringify(nextSchema.guides)) {
    operations.push({ op: 'replace', path: '/guides', value: nextSchema.guides })
  }
  if (JSON.stringify(currentSchema.elements) !== JSON.stringify(nextSchema.elements)) {
    operations.push({ op: 'replace', path: '/elements', value: nextSchema.elements })
  }
  if (JSON.stringify(currentSchema.groups ?? []) !== JSON.stringify(nextSchema.groups ?? [])) {
    operations.push({ op: 'replace', path: '/groups', value: nextSchema.groups ?? [] })
  }

  return {
    changed: operations.length > 0,
    operations,
    summary: operations.length
      ? operations.map(operation => `${operation.op} ${operation.path || '/'}`)
      : ['No schema changes detected.'],
  }
}

export function applyAssistantPatch<T extends Record<string, unknown>>(
  target: T,
  operations: AssistantPatchOperation[],
): T {
  const next = deepClone(target)
  for (const operation of operations) {
    applyOperation(next, operation)
  }
  return next
}

function applyOperation(target: Record<string, unknown>, operation: AssistantPatchOperation): void {
  if (operation.path === '') {
    if (operation.op === 'remove')
      throw new Error('Cannot remove document root')
    const value = operation.value
    if (!isRecord(value))
      throw new TypeError('Root replacement must be an object')
    for (const key of Object.keys(target)) {
      delete target[key]
    }
    Object.assign(target, deepClone(value))
    return
  }

  const parts = operation.path.split('/').filter(Boolean).map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'))
  const key = parts.pop()
  if (!key)
    throw new Error(`Invalid patch path: ${operation.path}`)
  const parent = parts.reduce<unknown>((cursor, part) => {
    if (!isRecord(cursor))
      throw new Error(`Patch path does not resolve to an object: ${operation.path}`)
    return cursor[part]
  }, target)
  if (!isRecord(parent))
    throw new Error(`Patch parent does not resolve to an object: ${operation.path}`)

  if (operation.op === 'remove') {
    delete parent[key]
    return
  }
  parent[key] = deepClone(operation.value)
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
