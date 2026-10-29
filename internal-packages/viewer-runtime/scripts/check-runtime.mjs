import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const runtimeRoot = resolve(repoRoot, 'internal-packages/viewer-runtime/dist/runtime')
const manifest = JSON.parse(await readFile(resolve(runtimeRoot, 'runtime-manifest.json'), 'utf8'))
assert.equal(manifest.entry, 'easyink-viewer/index.html')
assert.match(manifest.gitHead, /^[a-f0-9]{40}$/)
assert.match(manifest.localDiffSha256, /^[a-f0-9]{64}$/)
for (const [name, version] of Object.entries(manifest.packages)) {
  const pkg = JSON.parse(await readFile(resolve(repoRoot, `packages/${name}/package.json`), 'utf8'))
  assert.equal(version, pkg.version, `${name}: built SDK version mismatch`)
}
for (const [file, expected] of Object.entries(manifest.files)) {
  for (const root of [resolve(runtimeRoot, 'easyink-viewer'), resolve(repoRoot, 'lib/EasyInk.Render/host/internal/easyink/runtime/easyink-viewer')]) {
    const bytes = await readFile(resolve(root, file))
    assert.equal(bytes.length, expected.size, `${file}: size mismatch`)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256, `${file}: content mismatch`)
  }
}
const modules = JSON.parse(await readFile(resolve(runtimeRoot, 'easyink-viewer/assets/module-graph.json'), 'utf8'))
const forbidden = path => !path.includes('plugin-api/') && /(?:^|\/)(?:vue|@vue|designer)(?:[/.@]|$)/.test(path)
assert.deepEqual(modules.filter(forbidden), [], 'Embedded JavaScript must remain free of Designer/Vue')
assert(modules.some(path => path.endsWith('/packages/viewer/dist/index.mjs')), 'Must consume the actual emitted Viewer')
const entry = resolve(repoRoot, 'internal-packages/viewer-runtime/src/main.ts')
const program = ts.createProgram([entry], {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  types: ['vite/client'],
})
const diagnostics = ts.getPreEmitDiagnostics(program)
assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCanonicalFileName: path => path,
  getCurrentDirectory: () => repoRoot,
  getNewLine: () => '\n',
}))
const declarations = program.getSourceFiles().filter(file => !program.isSourceFileDefaultLibrary(file)).map(file => file.fileName.replaceAll('\\', '/'))
assert.deepEqual(declarations.filter(forbidden), [], 'Embedded declarations must remain free of UI')
assert(declarations.some(path => path.endsWith('/packages/viewer/dist/index.d.mts')), 'Must inspect emitted Viewer declarations')
console.log(JSON.stringify({ manifest: 'internal-packages/viewer-runtime/dist/runtime/runtime-manifest.json', files: manifest.files, packages: manifest.packages, gitHead: manifest.gitHead, javascriptModules: modules.length, declarations: declarations.length, forbidden: [] }, null, 2))
