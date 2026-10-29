import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import ts from 'typescript'
import { build } from 'vite'

async function checkEntry(name) {
  const root = process.cwd()
  const entry = resolve(root, `packages/viewer/src/test-fixtures/${name}.ts`)
  const normalize = path => path.replaceAll('\\', '/').replace(`${root.replaceAll('\\', '/')}/`, '')
  const forbidden = path => !path.includes('plugin-api/') && /(?:^|\/)(?:vue|@vue|designer)(?:[/.@]|$)/.test(path)
  let moduleIds = []
  const output = await build({
    configFile: false,
    logLevel: 'error',
    plugins: [{
      name: 'viewer-consumption-graph',
      generateBundle() {
        moduleIds = [...this.getModuleIds()].filter(id => !id.startsWith('\0')).map(normalize).sort()
      },
    }],
    build: { write: false, minify: false, lib: { entry, formats: ['es'] } },
  })
  const program = ts.createProgram([entry], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  })
  const diagnostics = ts.getPreEmitDiagnostics(program)
  if (diagnostics.length) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: path => path,
      getCurrentDirectory: () => root,
      getNewLine: () => '\n',
    }))
  }
  const declarations = program.getSourceFiles().filter(file => !program.isSourceFileDefaultLibrary(file)).map(file => normalize(file.fileName)).sort()
  const declarationImports = []
  for (const file of program.getSourceFiles().filter(file => !program.isSourceFileDefaultLibrary(file))) {
    const visit = (node) => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
        declarationImports.push(node.moduleSpecifier.text)
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal))
        declarationImports.push(node.argument.literal.text)
      ts.forEachChild(node, visit)
    }
    visit(file)
  }
  const violations = [...moduleIds, ...declarations, ...declarationImports].filter(forbidden)
  if (violations.length)
    throw new Error(`Minimal Viewer imports UI: ${violations.join(', ')}`)
  if (name === 'empty-viewer' && [...moduleIds, ...declarations].some(path => path.startsWith('packages/materials/')))
    throw new Error('The none collection must not import concrete materials')
  const code = (Array.isArray(output) ? output : [output]).flatMap(result => result.output).filter(chunk => chunk.type === 'chunk').map(chunk => chunk.code).join('\n')
  const packageNames = ['viewer', 'core', 'schema', 'shared']
  const packages = await Promise.all(packageNames.map(async (name) => {
    const pkg = JSON.parse(await readFile(resolve(root, `packages/${name}/package.json`), 'utf8'))
    return { name: pkg.name, version: pkg.version, runtimeDependencies: Object.keys(pkg.dependencies ?? {}) }
  }))
  if (packages[0].runtimeDependencies.includes('@easyink/builtin'))
    throw new Error('The Viewer host must consume the selected collection without depending on builtin')
  return {
    javascript: {
      sha256: createHash('sha256').update(code).digest('hex'),
      moduleCount: moduleIds.length,
      workspaceModules: moduleIds.filter(path => path.startsWith('packages/')),
    },
    declarations,
    packages,
    forbidden: violations,
  }
}

async function main() {
  const selected = await checkEntry('minimal-viewer')
  const empty = await checkEntry('empty-viewer')
  const textImage = await checkEntry('text-image-viewer')
  if ([...textImage.javascript.workspaceModules, ...textImage.declarations].some(path => /packages\/(?:builtin|materials\/(?!text\/|image\/))/.test(path)))
    throw new Error('Text/image Viewer must consume only the selected material packages')
  process.stdout.write(`${JSON.stringify({ ...selected, empty, textImage }, null, 2)}\n`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
