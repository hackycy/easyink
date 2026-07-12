import type { JsonPointer, MaterialLoadDiagnostic } from '@easyink/core'
import type { DocumentSchema, MaterialNode } from '@easyink/schema'

export function collectAdapterQuarantinedAddresses(
  schema: DocumentSchema,
  diagnostics: readonly MaterialLoadDiagnostic[],
): ReadonlySet<JsonPointer> {
  const nodeAddresses = collectMaterialNodeAddresses(schema)
  const quarantined = new Set<JsonPointer>()
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity !== 'error' || diagnostic.stage === 'graph')
      continue
    const address = findNearestNodeAddress(diagnostic.path, nodeAddresses)
    if (address)
      quarantined.add(address)
  }
  return quarantined
}

function collectMaterialNodeAddresses(schema: DocumentSchema): ReadonlySet<JsonPointer> {
  const addresses = new Set<JsonPointer>()
  const stack: Array<{ node: MaterialNode, path: JsonPointer }> = []
  for (let index = schema.elements.length - 1; index >= 0; index -= 1)
    stack.push({ node: schema.elements[index]!, path: `/elements/${index}` })

  while (stack.length > 0) {
    const { node, path } = stack.pop()!
    addresses.add(path)
    const slots = Object.entries(node.slots)
    for (let slotIndex = slots.length - 1; slotIndex >= 0; slotIndex -= 1) {
      const [slot, children] = slots[slotIndex]!
      for (let childIndex = children.length - 1; childIndex >= 0; childIndex -= 1) {
        stack.push({
          node: children[childIndex]!,
          path: `${path}/slots/${escapePointerToken(slot)}/${childIndex}`,
        })
      }
    }
  }
  return addresses
}

function findNearestNodeAddress(
  diagnosticPath: `/${string}`,
  nodeAddresses: ReadonlySet<JsonPointer>,
): JsonPointer | undefined {
  let candidate: string = diagnosticPath
  while (candidate.length > 0) {
    if (nodeAddresses.has(candidate as JsonPointer))
      return candidate as JsonPointer
    const separator = candidate.lastIndexOf('/')
    if (separator <= 0)
      return undefined
    candidate = candidate.slice(0, separator)
  }
  return undefined
}

function escapePointerToken(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
}
