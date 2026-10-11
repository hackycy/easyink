import fs from 'node:fs'
import path from 'node:path'
function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]) }
for (const file of files('packages/materials').filter(f => f.endsWith('designer.test.ts') && !f.includes('node_modules') && !f.includes('dist'))) {
  let source = fs.readFileSync(file, 'utf8')
  if (!source.includes('function createContext(')) continue
  source = source.replace('    getSchema: () => schema,', `    signal: new AbortController().signal,
    onDispose: () => {},
    getDataSources: () => [],
    getMaterials: () => [],
    isEditing: () => false,
    replaceDocument: () => {},
    readDocumentExtension: () => undefined,
    writeDocumentExtension: () => {},
    registerDataSource: () => {},
    confirm: async () => false,
    pickAsset: async () => null,
    pickFileText: async () => null,
    executeCommand: async () => { throw new Error('No commands installed') },
    reportDiagnostic: () => {},
    getSchema: () => schema,`)
  fs.writeFileSync(file, source)
}
for (const file of ['packages/materials/table/static/src/designer.ts', 'packages/materials/table/data/src/designer.ts']) {
  let source = fs.readFileSync(file, 'utf8')
  source = "import { deepClone } from '@easyink/shared'\n" + source
  source = source.replace('const node = context.getNode(nodeId)\n      return node && isTableNode(node) ? node : undefined', `const snapshot = context.getNode(nodeId)
      // Editing helpers receive a detached query value; writes still use tx drafts.
      const node = snapshot ? deepClone(snapshot) as MaterialNode : undefined
      return node && isTableNode(node) ? node : undefined`)
  fs.writeFileSync(file, source)
}
const file = 'packages/materials/flow-row/src/designer.ts'
let source = fs.readFileSync(file, 'utf8')
source = "import { deepClone } from '@easyink/shared'\n" + source
source = source.replace('getFlowRowProps(current) : getFlowRowProps(node)', 'getFlowRowProps(deepClone(current) as MaterialNode) : getFlowRowProps(node)')
fs.writeFileSync(file, source)
