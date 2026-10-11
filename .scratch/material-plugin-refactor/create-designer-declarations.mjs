import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync('packages/builtin/src/designer.ts', 'utf8')
const ast = ts.createSourceFile('designer.ts', source, ts.ScriptTarget.Latest, true)
const imports = new Map()
for (const node of ast.statements) {
  if (ts.isImportDeclaration(node)) {
    for (const entry of node.importClause?.namedBindings?.elements ?? [])
      imports.set(entry.name.text, node.moduleSpecifier.text)
  }
}
let declaration
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'ALL_BUILTIN_DESIGNER_MATERIAL_BUNDLE') declaration = node.initializer
  ts.forEachChild(node, visit)
}
visit(ast)
const properties = new Map(declaration.properties.map(p => [p.name.getText(ast), p.initializer]))
const groups = new Map()
for (const group of properties.get('catalogs').elements) {
  const attrs = new Map(group.properties.map(p => [p.name.getText(ast), p.initializer]))
  const id = attrs.get('id').text
  attrs.get('items').elements.forEach((item, order) => groups.set(item.properties[0].initializer.getText(ast), { id, order }))
}
const entries = []
for (const material of properties.get('materials').elements) {
  const attrs = new Map(material.properties.filter(ts.isPropertyAssignment).map(p => [p.name.getText(ast), p.initializer]))
  const model = material.properties.find(ts.isSpreadAssignment).expression.getText(ast)
  const name = model.slice(0, -5)
  const pkg = imports.get(model).replace('/material-model', '')
  const dir = path.join('packages/materials', pkg.replace('@easyink/material-', '').replace(/^chart-/, 'chart/').replace(/^svg-/, 'svg/').replace(/^table-/, 'table/'))
  const group = attrs.get('category').text
  const order = [...groups.values()].filter(x => x.id === group)
  const typeName = [...imports.entries()].find(([key, value]) => value === pkg && key.endsWith('_TYPE'))?.[0]
  const presetOrder = groups.get(typeName)?.order ?? order.length
  const icon = attrs.get('icon').getText(ast)
  const factory = attrs.get('factory').getText(ast)
  const props = attrs.get('propSchemas').getText(ast)
  const locale = attrs.get('localeMessages').getText(ast)
  const ai = attrs.get('aiDescriptor').getText(ast)
  const renderer = attrs.has('lazyFactory') ? `loadRenderer: async () => (await import('./designer')).createChartCustomExtension` : `renderer: ${factory}`
  let text = `import type { DesignerMaterial } from '@easyink/plugin-api/ui'\nimport { ${icon} } from '@easyink/icons'\nimport { paletteGroups } from '@easyink/shared'\nimport { ${model} } from './material-model'\nimport { ${props} } from './prop-schemas'\nimport { ${locale} } from './locale'\nimport { ${ai} } from './ai'\n`
  if (!attrs.has('lazyFactory')) text += `import { ${factory} } from './designer'\n`
  if (group === 'data' && name.startsWith('table')) text += `import { tableKernelLocaleMessages } from '@easyink/material-table-kernel/locale'\n`
  text += `\nexport const ${name}: DesignerMaterial = {\n  model: ${model},\n  ${renderer},\n  properties: ${props},\n  ai: ${ai},\n  locale: ${group === 'data' && name.startsWith('table') ? `{ messages: { ...tableKernelLocaleMessages.messages, ...${locale}.messages, materials: { ...tableKernelLocaleMessages.messages.materials, ...${locale}.messages.materials } }, locales: Object.fromEntries(Object.entries(${locale}.locales).map(([code, tree]) => [code, { materials: { ...(tableKernelLocaleMessages.locales as Record<string, typeof tableKernelLocaleMessages.messages>)[code]?.materials, ...tree.materials } }])) }` : locale},\n  ui: { palette: [{ id: '${name}', label: ${attrs.get('name').getText(ast)}, icon: ${icon}, group: paletteGroups.${group}, order: ${presetOrder} }] },\n`
  if (attrs.has('sectionFilter')) text += "  sectionFilter: section => section !== 'binding',\n"
  text += '}\n'
  fs.writeFileSync(path.join(dir, 'src/designer-material.ts'), text)
  const indexFile = path.join(dir, 'src/index.ts')
  fs.appendFileSync(indexFile, `\nexport { ${name} } from './designer-material'\n`)
  const pkgFile = path.join(dir, 'package.json')
  const json = JSON.parse(fs.readFileSync(pkgFile, 'utf8'))
  json.dependencies['@easyink/icons'] = 'workspace:*'
  json.dependencies['@easyink/plugin-api'] = 'workspace:*'
  fs.writeFileSync(pkgFile, JSON.stringify(json, null, 2) + '\n')
  entries.push({ name, pkg, basic: group !== 'chart' && name !== 'signature' })
}
for (const set of ['all', 'basic']) {
  const selected = entries.filter(entry => set === 'all' || entry.basic)
  const text = `import type { DesignerMaterial } from '@easyink/plugin-api/ui'\n${selected.map(e => `import { ${e.name} } from '${e.pkg}'`).join('\n')}\n\nexport const materials: readonly DesignerMaterial[] = Object.freeze([\n${selected.map(e => `  ${e.name},`).join('\n')}\n])\n`
  fs.writeFileSync(`packages/builtin/src/${set}/designer.ts`, text)
}
function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]) }
for (const file of files('packages/materials').filter(file => file.endsWith('.ts') && !file.includes('node_modules') && !file.includes('dist'))) {
  let source = fs.readFileSync(file, 'utf8')
  if (!source.includes('MaterialExtensionContext')) continue
  source = source.replace(/\bMaterialExtensionContext,\s*/g, '').replace(/,\s*MaterialExtensionContext\b/g, '')
  source = source.replaceAll('MaterialExtensionContext', 'DesignerRendererContext')
  source = "import type { DesignerRendererContext } from '@easyink/plugin-api/designer'\n" + source
  fs.writeFileSync(file, source)
}
