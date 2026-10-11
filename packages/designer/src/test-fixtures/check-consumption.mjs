import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import ts from 'typescript'
import { build } from 'vite'

async function main() {
  const root = process.cwd()
  const entry = resolve(root, 'packages/designer/src/test-fixtures/public-designer.ts')
  const normalize = path => path.replaceAll('\\', '/').replace(`${root.replaceAll('\\', '/')}/`, '')
  const program = ts.createProgram([entry], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
  })
  const diagnostics = ts.getPreEmitDiagnostics(program)
  if (diagnostics.length) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: path => path,
      getCurrentDirectory: () => root,
      getNewLine: () => '\n',
    }))
  }
  const declarations = program.getSourceFiles().filter(file => !program.isSourceFileDefaultLibrary(file)).map(file => normalize(file.fileName))
  let modules = []
  const output = await build({
    configFile: false,
    logLevel: 'error',
    plugins: [{
      name: 'designer-public-consumption',
      generateBundle() {
        modules = [...this.getModuleIds()].filter(id => !id.startsWith('\0')).map(normalize)
      },
    }],
    build: { write: false, minify: false, lib: { entry, formats: ['es'], cssFileName: 'designer-consumption' } },
  })
  const forbidden = [...modules, ...declarations].filter(path => /(?:^|\/)(?:packages|@easyink)\/(?:viewer|assistant(?:-[^/]*)?)(?:\/|$)/.test(path))
  if (forbidden.length)
    throw new Error(`Designer imports another host or Assistant: ${forbidden.join(', ')}`)
  if (!declarations.some(path => path.startsWith('packages/designer/dist/')) || !declarations.some(path => /(?:^|\/)vue\//.test(path)))
    throw new Error('Fixture must consume emitted Designer and actual Vue declarations')
  const pkg = JSON.parse(await readFile(resolve(root, 'packages/designer/package.json'), 'utf8'))
  if (pkg.dependencies['@easyink/builtin'])
    throw new Error('Designer Host cannot depend on the application material collection')
  const code = (Array.isArray(output) ? output : [output]).flatMap(result => result.output).filter(chunk => chunk.type === 'chunk').map(chunk => chunk.code).join('\n')
  process.stdout.write(`${JSON.stringify({
    javascriptSha256: createHash('sha256').update(code).digest('hex'),
    moduleCount: modules.length,
    declarationCount: declarations.length,
    workspaceDeclarations: declarations.filter(path => path.startsWith('packages/')),
    forbidden,
  }, null, 2)}\n`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
