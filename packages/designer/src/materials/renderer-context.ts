import type { TxOptions } from '@easyink/core'
import type { DeepReadonly, ResourceContext } from '@easyink/plugin-api'
import type { DesignerContext, DesignerRendererContext } from '@easyink/plugin-api/designer'
import type { MaterialNode } from '@easyink/schema'
import { DESIGNER_CONTEXT_TOKEN } from '@easyink/plugin-api/designer'
import { deepClone } from '@easyink/shared'

/** Fixed operations implemented by the framework, separate from the plugin context. */
export type DesignerRendererOperations = Omit<DesignerRendererContext, keyof ResourceContext | 'on' | 'emit'>

export function createDesignerRendererContext(operations: DesignerRendererOperations, resources: ResourceContext): DesignerRendererContext {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  resources.onDispose(() => listeners.clear())

  function assertCurrent() {
    if (resources.signal.aborted)
      throw new Error('Designer context is disposed')
  }

  function query<T>(read: () => T): DeepReadonly<T> {
    assertCurrent()
    const value = read()
    assertCurrent()
    return snapshot(value)
  }

  async function interact<T>(run: () => Promise<T>): Promise<T> {
    assertCurrent()
    const result = await run()
    assertCurrent()
    return result
  }

  const context: DesignerRendererContext = {
    signal: resources.signal,
    onDispose: resources.onDispose,
    getSchema: () => query(() => operations.getSchema()),
    getNode: id => query(() => operations.getNode(id)),
    getSelection: () => query(() => operations.getSelection()),
    getDataSources: () => query(() => operations.getDataSources()),
    getMaterials: () => query(() => operations.getMaterials()),
    getBindingLabel: (binding) => {
      assertCurrent()
      return operations.getBindingLabel(binding)
    },
    isEditing: (id) => {
      assertCurrent()
      return operations.isEditing(id)
    },
    t: (key) => {
      assertCurrent()
      return operations.t(key)
    },
    commitCommand: (command) => {
      assertCurrent()
      operations.commitCommand(command)
    },
    tx: Object.freeze<DesignerRendererContext['tx']>({
      run<TNode extends MaterialNode>(id: string, mutator: (draft: TNode) => void, options?: TxOptions) {
        assertCurrent()
        operations.tx.run<TNode>(id, (draft) => {
          mutator(draft)
          assertCurrent()
        }, options)
      },
      batch: (run) => {
        assertCurrent()
        return operations.tx.batch(() => {
          const result = run()
          assertCurrent()
          return result
        })
      },
    }),
    replaceDocument: (schema) => {
      assertCurrent()
      operations.replaceDocument(schema)
    },
    readDocumentExtension: namespace => query(() => operations.readDocumentExtension(namespace)),
    writeDocumentExtension: (namespace, value) => {
      assertCurrent()
      operations.writeDocumentExtension(namespace, value)
    },
    registerDataSource: (source) => {
      assertCurrent()
      operations.registerDataSource(source)
    },
    confirm: request => interact(() => operations.confirm(request)),
    pickAsset: request => interact(() => operations.pickAsset(request)),
    pickFileText: request => interact(() => operations.pickFileText(request)),
    executeCommand: (command, args) => interact(() => operations.executeCommand(command, args)),
    reportDiagnostic: (diagnostic) => {
      assertCurrent()
      operations.reportDiagnostic(diagnostic)
    },
    requestPropertyPanel: (overlay) => {
      assertCurrent()
      operations.requestPropertyPanel(overlay)
    },
    getZoom: () => {
      assertCurrent()
      return operations.getZoom()
    },
    getPageEl: () => {
      assertCurrent()
      return operations.getPageEl()
    },
    on: (event, handler) => {
      assertCurrent()
      let handlers = listeners.get(event)
      if (!handlers) {
        handlers = new Set()
        listeners.set(event, handlers)
      }
      handlers.add(handler)
      const unsubscribe = () => {
        handlers.delete(handler)
        if (!handlers.size)
          listeners.delete(event)
      }
      resources.onDispose(unsubscribe)
      return unsubscribe
    },
    emit: (event, payload) => {
      assertCurrent()
      for (const handler of listeners.get(event) ?? []) {
        assertCurrent()
        handler(payload)
      }
    },
  }
  return Object.freeze(context)
}

/** Independent UI and command consumers receive only their declared permissions. */
export function createDesignerContext(operations: DesignerRendererOperations, resources: ResourceContext, token?: object): DesignerContext {
  const { requestPropertyPanel: _panel, getZoom: _zoom, getPageEl: _page, on: _on, emit: _emit, ...context } = createDesignerRendererContext(operations, resources)
  const result = { ...context } as DesignerContext
  if (token)
    Object.defineProperty(result, DESIGNER_CONTEXT_TOKEN, { value: token })
  return Object.freeze(result)
}

function snapshot<T>(value: T): DeepReadonly<T> {
  const cloned = deepClone(value)
  const seen = new WeakSet<object>()
  function freeze(current: unknown) {
    if (!current || typeof current !== 'object' || seen.has(current))
      return
    seen.add(current)
    for (const child of Object.values(current))
      freeze(child)
    Object.freeze(current)
  }
  freeze(cloned)
  return cloned as DeepReadonly<T>
}
