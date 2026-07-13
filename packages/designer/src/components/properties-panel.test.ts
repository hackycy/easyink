// @ts-expect-error Node types are available in the Vitest runtime.
import { readFileSync } from 'node:fs'
// @ts-expect-error Node types are available in the Vitest runtime.
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

declare const process: { cwd: () => string }

const source = readFileSync(resolve(process.cwd(), 'packages/designer/src/components/PropertiesPanel.vue'), 'utf8')

describe('properties panel transaction editing contract', () => {
  it('uses the document transaction engine without the legacy property transaction', () => {
    expect(source).toContain('new PropertyPreviewController(store.documentTransactions)')
    expect(source).not.toContain('store.materialTransaction')
    expect(source).not.toContain('MaterialPropertyPreviewSession')
  })

  it('routes page, material, and geometry previews through one controller', () => {
    expect(source).toMatch(/propertyPreview\.preview\(`page:\$\{descriptor\.id\}`/)
    expect(source).toContain('propertyPreview.previewProperty(key, el, schema, value')
    expect(source).toMatch(/propertyPreview\.preview\(`geometry:\$\{key\}`/)
    expect(source).toMatch(/preview\.replaceNode\(el\.id, \[`\/\$\{key\}`\]/)
  })

  it('commits and cancels continuous edits by stable property key', () => {
    expect(source).toMatch(/propertyPreview\.commit\(`page:\$\{descriptor\.id\}`\)/)
    expect(source).toMatch(/propertyPreview\.cancel\(`page:\$\{descriptorId\}`\)/)
    expect(source).toMatch(/propertyPreview\.commit\(`geometry:\$\{key\}`\)/)
    expect(source).toContain('propertyPreview.commit(key)')
    expect(source).toContain('propertyPreview.cancel(key)')
  })

  it('cancels on selection, session, unmount, and failed font loading', () => {
    expect(source).toContain('watch(() => selectedElement.value?.id')
    expect(source).toContain('watch(() => store.editingSession.activeSession?.nodeId')
    expect(source).toContain('onUnmounted(() => propertyPreview.cancelActive())')
    expect(source).toContain('rollbackPropPreview(key)')
    expect(source).toContain('rollbackPagePreview(descriptor.id)')
  })
})
