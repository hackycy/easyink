import type { DocumentSchema } from '@easyink/schema'
import type { AssistantPatchApplyMode, AssistantPatchOperation, AssistantSchemaDiff } from './types'

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
  operations.push(...diffElementArray(currentSchema.elements ?? [], nextSchema.elements ?? []))
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

export function selectAssistantPatchOperations(
  operations: AssistantPatchOperation[],
  mode: Exclude<AssistantPatchApplyMode, 'selected-elements'>,
): AssistantPatchOperation[] {
  if (mode === 'full')
    return operations
  return operations.filter(operation => operation.op === 'add' && isElementPath(operation.path))
}

export function selectAssistantPatchOperationsForElements(
  operations: AssistantPatchOperation[],
  schema: DocumentSchema,
  elementIds: string[],
): AssistantPatchOperation[] {
  const selected = new Set(elementIds)
  if (!selected.size)
    return []
  return operations.filter(operation => isOperationForSelectedElement(operation, schema, selected))
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
    if (Array.isArray(cursor)) {
      const index = parseArrayIndex(part, cursor.length)
      return cursor[index]
    }
    if (!isRecord(cursor))
      throw new Error(`Patch path does not resolve to an object: ${operation.path}`)
    return cursor[part]
  }, target)
  if (!isRecord(parent) && !Array.isArray(parent))
    throw new Error(`Patch parent does not resolve to an object or array: ${operation.path}`)

  if (Array.isArray(parent)) {
    if (operation.op === 'remove') {
      parent.splice(parseArrayIndex(key, parent.length), 1)
      return
    }
    if (key === '-') {
      parent.push(deepClone(operation.value))
      return
    }
    const index = parseArrayIndex(key, parent.length)
    if (operation.op === 'add')
      parent.splice(index, 0, deepClone(operation.value))
    else
      parent[index] = deepClone(operation.value)
    return
  }

  if (operation.op === 'remove') {
    delete parent[key]
    return
  }
  parent[key] = deepClone(operation.value)
}

function diffElementArray(
  currentElements: DocumentSchema['elements'],
  nextElements: DocumentSchema['elements'],
): AssistantPatchOperation[] {
  const currentById = new Map(currentElements.map((element, index) => [element.id, { element, index }]))
  const nextIds = new Set(nextElements.map(element => element.id))
  const operations: AssistantPatchOperation[] = []

  currentElements.forEach((element, index) => {
    if (!nextIds.has(element.id))
      operations.push({ op: 'remove', path: `/elements/${index}` })
  })
  operations.sort((a, b) => {
    if (a.op === 'remove' && b.op === 'remove')
      return lastPathNumber(b.path) - lastPathNumber(a.path)
    return 0
  })

  nextElements.forEach((element, index) => {
    const current = currentById.get(element.id)
    if (!current) {
      operations.push({ op: 'add', path: `/elements/${index}`, value: element })
      return
    }
    if (JSON.stringify(current.element) !== JSON.stringify(element))
      operations.push({ op: 'replace', path: `/elements/${current.index}`, value: element })
  })

  return operations.length ? operations : []
}

function isOperationForSelectedElement(
  operation: AssistantPatchOperation,
  schema: DocumentSchema,
  selected: Set<string>,
): boolean {
  const index = elementPathIndex(operation.path)
  if (index === undefined)
    return false
  if (isRecord(operation.value) && typeof operation.value.id === 'string' && selected.has(operation.value.id))
    return true
  const current = schema.elements[index]
  return !!current && selected.has(current.id)
}

function isElementPath(path: string): boolean {
  return elementPathIndex(path) !== undefined
}

function elementPathIndex(path: string): number | undefined {
  const [, index] = /^\/elements\/(\d+)(?:\/|$)/.exec(path) ?? []
  if (index === undefined)
    return undefined
  return Number(index)
}

function parseArrayIndex(value: string, length: number): number {
  if (value === '-')
    return length
  const index = Number(value)
  if (!Number.isInteger(index) || index < 0 || index > length)
    throw new Error(`Invalid array patch index: ${value}`)
  return index
}

function lastPathNumber(path: string): number {
  const parts = path.split('/')
  return Number(parts[parts.length - 1])
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
