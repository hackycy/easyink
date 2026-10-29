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
  const eagerModules = []
  const output = await build({
    configFile: false,
    logLevel: 'error',
    plugins: [{
      name: 'designer-public-consumption',
      generateBundle(_options, bundle) {
        modules = [...this.getModuleIds()].filter(id => !id.startsWith('\0')).map(normalize)
        const visited = new Set()
        const visit = (chunk) => {
          if (visited.has(chunk.fileName))
            return
          visited.add(chunk.fileName)
          eagerModules.push(...Object.entries(chunk.modules).filter(([, info]) => info.renderedLength > 0).map(([id]) => normalize(id)))
          for (const dependency of chunk.imports) {
            if (bundle[dependency]?.type === 'chunk')
              visit(bundle[dependency])
          }
        }
        for (const chunk of Object.values(bundle)) {
          if (chunk.type === 'chunk' && chunk.isEntry)
            visit(chunk)
        }
      },
    }],
    build: { write: false, minify: false, lib: { entry, formats: ['es'], cssFileName: 'designer-consumption' } },
  })
  const forbidden = [...modules, ...declarations].filter(path => /(?:^|\/)(?:packages|@easyink)\/viewer(?:\/|$)/.test(path))
  const eagerChart = eagerModules.filter(path => /materials\/chart\/(?:custom\/dist\/designer\.mjs$|kernel\/dist\/full)|echarts\/index\.js$/.test(path))
  if (process.argv.includes('--check-lazy') && eagerChart.length)
    throw new Error(`Designer collection eagerly loads chart-custom code: ${eagerChart.join(', ')}`)
  if (forbidden.length)
    throw new Error(`Designer imports another host: ${forbidden.join(', ')}`)
  if (!declarations.some(path => path.startsWith('packages/designer/dist/')) || !declarations.some(path => /(?:^|\/)vue\//.test(path)))
    throw new Error('Fixture must consume emitted Designer and actual Vue declarations')
  const pkg = JSON.parse(await readFile(resolve(root, 'packages/designer/package.json'), 'utf8'))
  if (pkg.dependencies['@easyink/builtin'])
    throw new Error('Designer Host cannot depend on the application material collection')
  const code = (Array.isArray(output) ? output : [output]).flatMap(result => result.output).filter(chunk => chunk.type === 'chunk').map(chunk => chunk.code).join('\n')
  process.stdout.write(`${JSON.stringify({
    javascriptSha256: createHash('sha256').update(code).digest('hex'),
    moduleCount: modules.length,
    eagerModuleCount: eagerModules.length,
    eagerChart,
    declarationCount: declarations.length,
    workspaceDeclarations: declarations.filter(path => path.startsWith('packages/')),
    forbidden,
  }, null, 2)}\n`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
