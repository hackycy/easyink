import type { BindingRef, MaterialBinding, MaterialNode } from '@easyink/schema'
import type { BindingDisplayFormat } from '@easyink/shared'
import type { Command } from '../command'
import { getBindingRefs } from '@easyink/schema'
import { deepClone, generateId } from '@easyink/shared'
import { findNode } from './helpers'

// ─── Data Commands ──────────────────────────────────────────────────

export class BindFieldCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'bind-field'
  readonly description = 'Bind field'
  private oldBinding: MaterialBinding | undefined

  constructor(
    private elements: MaterialNode[],
    private nodeId: string,
    private binding: BindingRef,
    private port = 'value',
  ) {}

  execute(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    this.oldBinding = deepClone(node.bindings[this.port])
    node.bindings[this.port] = deepClone(this.binding)
  }

  undo(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    if (this.oldBinding)
      node.bindings[this.port] = this.oldBinding
    else
      delete node.bindings[this.port]
  }
}

export class ClearBindingCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'clear-binding'
  readonly description = 'Clear binding'
  private oldBinding: MaterialBinding | undefined

  constructor(
    private elements: MaterialNode[],
    private nodeId: string,
    private port = 'value',
  ) {}

  execute(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    this.oldBinding = deepClone(node.bindings[this.port])
    delete node.bindings[this.port]
  }

  undo(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    if (this.oldBinding)
      node.bindings[this.port] = this.oldBinding
    else
      delete node.bindings[this.port]
  }
}

export class UpdateMaterialBindingCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'update-material-binding'
  readonly description = 'Update material binding'
  private oldBinding: MaterialBinding | undefined

  constructor(
    private elements: MaterialNode[],
    private nodeId: string,
    private binding: MaterialBinding | undefined,
    private port = 'value',
  ) {}

  execute(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    this.oldBinding = deepClone(node.bindings[this.port])
    if (this.binding)
      node.bindings[this.port] = deepClone(this.binding)
    else
      delete node.bindings[this.port]
  }

  undo(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    if (this.oldBinding)
      node.bindings[this.port] = this.oldBinding
    else
      delete node.bindings[this.port]
  }
}

export class UpdateBindingFormatCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'update-binding-format'
  readonly description = 'Update binding format'
  private oldBinding: MaterialBinding | undefined

  constructor(
    private elements: MaterialNode[],
    private nodeId: string,
    private format: BindingDisplayFormat | undefined,
    private bindIndex = 0,
    private port = 'value',
  ) {}

  execute(): void {
    const node = findNode(this.elements, this.nodeId)
    const binding = node?.bindings[this.port]
    if (!node || !binding)
      return
    this.oldBinding = deepClone(binding)
    const refs = getBindingRefs(binding)
    const target = refs.find(ref => (ref.bindIndex ?? 0) === this.bindIndex) ?? refs[0]
    if (!target)
      return
    target.format = this.format ? deepClone(this.format) : undefined
  }

  undo(): void {
    const node = findNode(this.elements, this.nodeId)
    if (!node)
      return
    if (this.oldBinding)
      node.bindings[this.port] = this.oldBinding
    else
      delete node.bindings[this.port]
  }
}

export class UnionDropCommand implements Command {
  readonly id = generateId('cmd')
  readonly type = 'union-drop'
  readonly description = 'Union drop'
  private nodeIds: string[]

  constructor(
    private elements: MaterialNode[],
    private nodes: MaterialNode[],
  ) {
    this.nodeIds = nodes.map(n => n.id)
  }

  execute(): void {
    for (const node of this.nodes)
      this.elements.push(node)
  }

  undo(): void {
    const ids = new Set(this.nodeIds)
    for (let i = this.elements.length - 1; i >= 0; i--) {
      if (ids.has(this.elements[i]!.id))
        this.elements.splice(i, 1)
    }
  }
}
