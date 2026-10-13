import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import ts from 'typescript'
import { builtinMembers } from '../collection-source.ts'

const entries = ['@easyink/builtin', '@easyink/builtin/all', '@easyink/builtin/basic', '@easyink/builtin/none', '@easyink/builtin/all/designer', '@easyink/builtin/basic/designer', '@easyink/builtin/all/viewer', '@easyink/builtin/basic/viewer']
const legacyValues = [
  'builtinDesignerMaterialBundle',
  'builtinDesignerMaterials',
  'builtinViewerMaterialBundle',
  'builtinViewerMaterials',
  'builtinAllDesignerMaterialBundle',
  'builtinAllDesignerMaterials',
  'builtinAllViewerMaterialBundle',
  'builtinAllViewerMaterials',
  'builtinBasicDesignerMaterialBundle',
  'builtinBasicDesignerMaterials',
  'builtinBasicViewerMaterialBundle',
  'builtinBasicViewerMaterials',
  'builtinNoneDesignerMaterialBundle',
  'builtinNoneDesignerMaterials',
  'builtinNoneViewerMaterialBundle',
  'builtinNoneViewerMaterials',
  'registerAllBuiltinViewerMaterials',
  'registerBasicBuiltinViewerMaterials',
  'registerNoneBuiltinViewerMaterials',
  'createBuiltinViewerMaterialBundle',
  'builtinViewerMaterialSets',
  'registerBuiltinViewerMaterialBundle',
  'registerBuiltinViewerMaterials',
  'createBuiltinDesignerMaterialBundle',
  'builtinDesignerMaterialSets',
  'builtinAIMaterialDescriptors',
]
const legacyTypes = [
  'BuiltinDesignerMaterialBundle',
  'BuiltinDesignerMaterialRegistration',
  'BuiltinDesignerCatalogRegistration',
  'BuiltinDesignerCatalogGroupRegistration',
  'BuiltinViewerMaterialBundle',
  'BuiltinViewerMaterialRegistration',
  'BuiltinViewerRegistrar',
  'BuiltinMaterialCapabilities',
  'BuiltinPanelSectionId',
  'BuiltinLocaleMessages',
  'BuiltinMaterialSet',
]

function compile(source) {
  // Resolve the real package exports and emitted declarations from a consumer.
  // Only this synthetic consumer file is virtual; package declarations are read from disk.
  const file = resolve('packages/builtin/src/test-fixtures/consumer.ts').replaceAll('\\', '/')
  const options = { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, skipLibCheck: true, noEmit: true, types: [] }
  const host = ts.createCompilerHost(options)
  const original = host.getSourceFile.bind(host)
  const originalFileExists = host.fileExists.bind(host)
  host.fileExists = path => path.replaceAll('\\', '/') === file || originalFileExists(path)
  host.getSourceFile = (path, ...args) => path.replaceAll('\\', '/') === file ? ts.createSourceFile(path, source, options.target, true) : original(path, ...args)
  return ts.getPreEmitDiagnostics(ts.createProgram([file], options, host))
}

const materialImports = builtinMembers.flatMap((member, i) => [
  `import { ${member.name} as d${i} } from '@easyink/material-${member.package}'`,
  `import { ${member.name} as v${i} } from '@easyink/material-${member.package}/viewer'`,
])
const positive = compile([
  'import type { DesignerMaterial } from \'@easyink/plugin-api/ui\'',
  'import type { ViewerMaterial } from \'@easyink/plugin-api/viewer\'',
  ...entries.map((entry, i) => `import { materials as m${i} } from '${entry}'`),
  'const designer: readonly (readonly DesignerMaterial[])[] = [m0, m1, m2, m3, m4, m5]',
  'const viewer: readonly (readonly ViewerMaterial[])[] = [m3, m6, m7]',
  ...materialImports,
  `const independentDesigner: readonly DesignerMaterial[] = [${builtinMembers.map((_member, i) => `d${i}`).join(', ')}]`,
  `const independentViewer: readonly ViewerMaterial[] = [${builtinMembers.map((_member, i) => `v${i}`).join(', ')}]`,
].join('\n'))
assert.deepEqual(positive, [], 'New complete collection declarations must compile')

const incomplete = compile([
  'import type { DesignerMaterial } from \'@easyink/plugin-api/ui\'',
  'import type { ViewerMaterial } from \'@easyink/plugin-api/viewer\'',
  'import { text } from \'@easyink/material-text\'',
  'const designer: DesignerMaterial = { model: text.model }',
  'const viewer: ViewerMaterial = { model: text.model }',
].join('\n'))
assert.equal(incomplete.length, 2, 'Both hosts must reject a material missing its renderer/loader')
assert.ok(incomplete.every(diagnostic => diagnostic.code === 2322))

const negativeImports = []
for (const entry of entries) {
  for (const name of [...legacyValues, ...legacyTypes])
    negativeImports.push(`import type { ${name} as legacy${negativeImports.length} } from '${entry}'`)
}
const negative = compile(negativeImports.join('\n'))
assert.equal(negative.length, negativeImports.length, 'Every legacy import must fail')
assert.ok(negative.every(diagnostic => diagnostic.code === 2305), 'Legacy imports must fail because the named export is absent')

async function runRuntimeChecks() {
  for (const entry of entries) {
    const module = await import(entry)
    assert.deepEqual(Object.keys(module), ['materials'], `${entry} must expose only the complete collection`)
  }
  const pkg = JSON.parse(readFileSync(resolve('packages/builtin/package.json'), 'utf8'))
  const exports = new Set(Object.keys(pkg.exports))
  for (const subpath of ['designer', 'viewer', 'ai', 'bindings', 'types']) {
    assert.equal(exports.has(`./${subpath}`), false)
    await assert.rejects(import(`@easyink/builtin/${subpath}`), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' })
  }
  return { entries: entries.length, materialEntries: materialImports.length, rejectedIncompleteMaterials: incomplete.length, rejectedLegacyImports: negative.length, rejectedSubpaths: 5 }
}

runRuntimeChecks().then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
