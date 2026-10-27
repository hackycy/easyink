import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(packageRoot, '../..')
const renderRoot = resolve(repoRoot, 'lib/EasyInk.Render')
const runtimeRoot = resolve(packageRoot, 'dist/runtime/easyink-viewer')
const hostRuntimeRoot = resolve(renderRoot, 'host/internal/easyink/runtime/easyink-viewer')

await assertBuiltAsset('assets/viewer.js')
await assertBuiltAsset('assets/viewer.css')
await writeFile(
  resolve(runtimeRoot, 'index.html'),
  await readFile(resolve(packageRoot, 'src/index.html'), 'utf8'),
)

const files = {}
for (const file of ['index.html', 'assets/viewer.js', 'assets/viewer.css', 'assets/module-graph.json']) {
  const bytes = await readFile(resolve(runtimeRoot, file))
  files[file] = { size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}
const packages = {}
for (const name of ['viewer', 'builtin', 'plugin-api', 'plugin-runtime', 'core', 'schema'])
  packages[name] = JSON.parse(await readFile(resolve(repoRoot, `packages/${name}/package.json`), 'utf8')).version
const manifest = `${JSON.stringify({
  schemaVersion: 1,
  entry: 'easyink-viewer/index.html',
  packages,
  gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
  localDiffSha256: createHash('sha256').update(execFileSync('git', ['diff', 'HEAD', '--', 'packages', 'internal-packages', 'lib', 'scripts', 'pnpm-lock.yaml'], { cwd: repoRoot })).digest('hex'),
  files,
}, null, 2)}\n`

await writeFile(resolve(runtimeRoot, '../runtime-manifest.json'), manifest)
await writeFile(resolve(runtimeRoot, 'runtime-manifest.json'), manifest)
await rm(hostRuntimeRoot, { recursive: true, force: true })
await mkdir(dirname(hostRuntimeRoot), { recursive: true })
await cp(runtimeRoot, hostRuntimeRoot, { recursive: true })

console.warn(`[render-viewer-runtime] synced ${hostRuntimeRoot}`)

async function assertBuiltAsset(file) {
  try {
    await readFile(resolve(runtimeRoot, file))
  }
  catch (error) {
    throw new Error(`Missing built runtime asset: ${file}`, { cause: error })
  }
}
