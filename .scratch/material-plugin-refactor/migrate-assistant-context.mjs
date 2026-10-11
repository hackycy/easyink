import fs from 'node:fs'
const file = 'packages/assistant/designer-bridge/src/apply.ts'
let source = fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n')
source = source.replace("import type { ContributionContext } from '@easyink/designer'", "import type { DesignerContext } from '@easyink/plugin-api/designer'\nimport type { DocumentSchemaInput } from '@easyink/schema'")
source = source.replaceAll("ContributionContext['store']", 'DesignerContext').replaceAll('store.schema', 'store.getSchema()')
source = source.replaceAll('store.setSchema(', 'store.replaceDocument(').replaceAll('store.dataSourceRegistry.registerSource(', 'store.registerDataSource(')
source = source.replaceAll("store.getExtension<AssistantDesignerExtension>('assistant')", "store.readDocumentExtension('assistant') as AssistantDesignerExtension | undefined")
source = source.replaceAll("...store.readDocumentExtension('assistant') as AssistantDesignerExtension | undefined", "...(store.readDocumentExtension('assistant') as AssistantDesignerExtension | undefined)")
source = source.replaceAll('store.setExtension(', 'store.writeDocumentExtension(').replaceAll('store.selection.ids', 'store.getSelection().ids')
source = source.replaceAll('  store.markDraftModified()\n', '')
source = source.replace('store.replaceDocument(assistant.beforeApplySchema)', 'store.replaceDocument(assistant.beforeApplySchema as DocumentSchemaInput)')
source = source.replace('store.getSchema(), store.getSelection().ids', 'cloneJson(store.getSchema()), [...store.getSelection().ids]')
fs.writeFileSync(file, source)
const pkgFile = 'packages/assistant/designer-bridge/package.json'
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'))
pkg.dependencies['@easyink/plugin-api'] = 'workspace:*'
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n')
const testFile = 'packages/assistant/designer-bridge/src/apply.test.ts'
source = fs.readFileSync(testFile, 'utf8').replaceAll('\r\n', '\n')
source = source.replace("import { DesignerStore } from '@easyink/designer'", "import { DesignerStore } from '@easyink/designer'\nimport { afterEach } from 'vitest'")
source = source.replace('describe(', `const stores: DesignerStore[] = []
async function fixture(schema: Parameters<typeof DesignerStore.create>[0]['schema']) {
  const store = await DesignerStore.create({ schema, extensions: [{ id: 'fixture', commands: [{ id: 'fixture.context', handler: () => {} }] }] })
  stores.push(store)
  const context = store.getExtensionContext(store.getContributions('designer.command')[0].owner)
  return { store, context }
}
afterEach(async () => { await Promise.all(stores.splice(0).map(store => store.destroy())) })

describe(`)
source = source.replaceAll('const store = await DesignerStore.create({ schema: ', 'const { store, context } = await fixture(').replaceAll(' })\n', ')\n')
source = source.replace('  const { store, context } = await fixture(schema, extensions:', '  const store = await DesignerStore.create({ schema, extensions:')
source = source.replace('handler: () => {} }] }])', 'handler: () => {} }] }] })')
for (const name of ['applyAssistantPatchToDesigner', 'rollbackAssistantDesigner', 'applySelectedAssistantElementsToDesigner', 'applyAssistantDataSourceToDesigner', 'applyAssistantResultToDesigner'])
  source = source.replaceAll(`${name}(store`, `${name}(context`)
fs.writeFileSync(testFile, source)
