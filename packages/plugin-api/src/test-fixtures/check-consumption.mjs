import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import ts from 'typescript'
import { build } from 'vite'

const root = process.cwd()
const normalize = path => path.replaceAll('\\', '/').replace(`${root.replaceAll('\\', '/')}/`, '')
const forbidden = path => /(?:^|\/)(?:vue|@vue|designer|viewer)(?:[/.@]|$)/.test(path)
// /plugin-api/designer and /plugin-api/viewer are contracts, not host implementations.
const forbiddenDependency = path => !path.includes('plugin-api/') && forbidden(path)

async function checkEntry(name, allowVue, packageName = 'plugin-api', label = name) {
  const entry = resolve(root, `packages/${packageName}/src/test-fixtures/${name}.ts`)
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
      name: 'plugin-api-consumption',
      generateBundle() {
        modules = [...this.getModuleIds()].filter(id => !id.startsWith('\0')).map(normalize)
      },
    }],
    build: { write: false, minify: false, lib: { entry, formats: ['es'] } },
  })
  const violations = [...modules, ...declarations].filter(path => forbiddenDependency(path) && (!allowVue || !/(?:^|\/)(?:vue|@vue)(?:[/.@]|$)/.test(path)))
  if (violations.length)
    throw new Error(`${name} imports a host/UI dependency: ${violations.join(', ')}`)
  if (allowVue && !declarations.some(path => /(?:^|\/)vue\//.test(path)))
    throw new Error('The UI fixture did not consume actual Vue declarations')
  const chunks = (Array.isArray(output) ? output : [output]).flatMap(result => result.output).filter(chunk => chunk.type === 'chunk')
  const code = chunks.map(chunk => chunk.code).join('\n')
  return {
    entry: label,
    javascriptSha256: createHash('sha256').update(code).digest('hex'),
    moduleCount: modules.length,
    declarationCount: declarations.length,
    workspaceDeclarations: declarations.filter(path => path.startsWith('packages/')),
    forbidden: violations,
  }
}

async function main() {
  const api = JSON.parse(await readFile(resolve(root, 'packages/plugin-api/package.json'), 'utf8'))
  const lowerPackages = ['core', 'schema', 'shared', 'datasource']
  for (const name of lowerPackages) {
    const pkg = JSON.parse(await readFile(resolve(root, `packages/${name}/package.json`), 'utf8'))
    if (Object.keys(pkg.dependencies ?? {}).some(dependency => dependency.startsWith('@easyink/plugin-')))
      throw new Error(`${pkg.name} reverses the plugin dependency direction`)
  }
  if (Object.keys(api.dependencies).some(forbiddenDependency))
    throw new Error('plugin-api depends on a host implementation or UI runtime')
  const runtime = JSON.parse(await readFile(resolve(root, 'packages/plugin-runtime/package.json'), 'utf8'))
  if (Object.keys(runtime.dependencies).some(forbiddenDependency) || api.dependencies['@easyink/plugin-runtime'])
    throw new Error('plugin-runtime imports a host/UI dependency or forms a cycle with plugin-api')
  const results = []
  for (const [entry, allowVue] of [['root', false], ['model', false], ['designer', false], ['viewer', false], ['ui', true]])
    results.push(await checkEntry(entry, allowVue))
  results.push(await checkEntry('kernel', false, 'plugin-runtime', 'runtime'))
  results.push(await checkEntry('consumer', true, 'plugin-runtime', 'runtime-consumer'))
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
