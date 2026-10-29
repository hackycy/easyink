import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import ts from 'typescript'

function blocks(path) {
  return [...readFileSync(path, 'utf8').matchAll(/```(?:ts|typescript)\r?\n([\s\S]*?)```/g)].map(match => match[1])
}

function compile(name, source, extraFiles = []) {
  const file = resolve(`packages/builtin/src/test-fixtures/${name}.mts`).replaceAll('\\', '/')
  const entries = {
    '@easyink/plugin-api/material': ['packages/plugin-api', './material'],
    '@easyink/plugin-api/ui': ['packages/plugin-api', './ui'],
    '@easyink/plugin-api/designer': ['packages/plugin-api', './designer'],
    '@easyink/plugin-api/viewer': ['packages/plugin-api', './viewer'],
    '@easyink/designer': ['packages/designer', '.'],
    '@easyink/designer/locale': ['packages/designer', './locale'],
    '@easyink/viewer': ['packages/viewer', '.'],
    '@easyink/schema': ['packages/schema', '.'],
    '@easyink/icons': ['packages/icons', '.'],
    '@easyink/builtin/all/designer': ['packages/builtin', './all/designer'],
    '@easyink/builtin/all': ['packages/builtin', './all'],
    '@easyink/builtin/all/viewer': ['packages/builtin', './all/viewer'],
    '@easyink/print-integration-hiprint': ['packages/print/integration-hiprint', '.'],
    '@easyink/print-integration-lodop': ['packages/print/integration-lodop', '.'],
    '@easyink/print-integration-easyink-printer': ['packages/print/integration-easyink-printer', '.'],
  }
  const paths = Object.fromEntries(Object.entries(entries).map(([name, [dir, entry]]) => {
    const pkg = JSON.parse(readFileSync(`${dir}/package.json`, 'utf8'))
    const exported = pkg.exports[entry]
    assert.ok(exported, `${name} must be exported`)
    return [name, [resolve(dir, typeof exported === 'string' ? exported.replace(/\.mjs$/, '.d.mts') : exported.types)]]
  }))
  const options = { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, skipLibCheck: true, noEmit: true, types: [], paths }
  const host = ts.createCompilerHost(options)
  const getSource = host.getSourceFile.bind(host)
  const exists = host.fileExists.bind(host)
  host.fileExists = path => path.replaceAll('\\', '/') === file || exists(path)
  host.getSourceFile = (path, ...args) => path.replaceAll('\\', '/') === file ? ts.createSourceFile(path, source, options.target, true) : getSource(path, ...args)
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file, ...extraFiles], options, host))
  const messages = ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: path => path, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n' })
  assert.equal(diagnostics.length, 0, `${name}: ${messages}`)
}

const custom = blocks('docs/advanced/custom-materials.md')
compile('custom-doc', `${custom.filter(block => /export const priceTag(?:Model|Designer|Viewer)/.test(block)).map(block => block.replace(/^import \{ priceTagModel \} from '\.\/model'\r?\n/gm, '')).join('\n')}
import { DesignerStore } from '@easyink/designer'
import { createViewer } from '@easyink/viewer'
import { normalizeDocumentSchema } from '@easyink/schema'
const store = await DesignerStore.create({ materials: [priceTagDesigner] })
const viewer = await createViewer({ container: document.createElement('div'), materials: [priceTagViewer] })
await viewer.open({ schema: normalizeDocumentSchema({ elements: [priceTagModel.createDefaultNode()] }) })
await Promise.all([store.destroy(), viewer.destroy()])
`)

compile('extension-doc', blocks('docs/advanced/contributions.md')[0])
compile('migration-doc', blocks('docs/guide/migration-0.1.0.md')[0])
compile('architecture-extension', blocks('.github/architecture/23-contribution.md')[0])
for (const path of ['docs/printing/index.md', 'docs/hiprint/index.md', 'docs/lodop/index.md', 'docs/dotnet/index.md', 'docs/hiprint/getting-started.md', 'docs/lodop/getting-started.md', 'docs/dotnet/getting-started.md', 'docs/viewer/print-export.md']) {
  const example = blocks(path).find(block => block.includes('viewerOptions: { materials: viewerMaterials }'))
  assert.ok(example, path)
  compile(path.replaceAll('/', '-').replace('.md', ''), `
import { normalizeDocumentSchema } from '@easyink/schema'
const schema = normalizeDocumentSchema({})
const data = {}
${example}
`)
}

async function checkReadme() {
  const generator = readFileSync('scripts/sync-package-readmes.mjs', 'utf8')
    .replace('const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), \'..\')', 'const repoRoot = process.cwd()')
    .replace(/main\(\)\.catch\([\s\S]*$/, 'export { buildReadme }')
  const { buildReadme } = await import(`data:text/javascript;base64,${Buffer.from(generator).toString('base64')}`)
  const pkg = JSON.parse(readFileSync('packages/builtin/package.json', 'utf8'))
  const { id: docsSeries } = JSON.parse(readFileSync('docs/.vitepress/series.json', 'utf8'))
  const expected = buildReadme({ packageName: pkg.name, description: pkg.description, repositoryUrl: 'https://github.com/hackycy/easyink', docsSeries })
  assert.equal(readFileSync('packages/builtin/README.md', 'utf8').replaceAll('\r\n', '\n'), expected)
  process.stdout.write('Custom material, extension and 8 print examples consume emitted declarations; builtin README matches its generator.\n')
}

checkReadme().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
