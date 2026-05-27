import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(packageRoot, '../..')
const renderRoot = resolve(repoRoot, 'lib/EasyInk.Render')
const runtimeRoot = resolve(packageRoot, 'dist/runtime/easyink-viewer')
const hostRuntimeRoot = resolve(renderRoot, 'host/internal/easyink/runtime/easyink-viewer')
const materials = [
  ['text', 'builtin-text'],
  ['rect', 'builtin-rect'],
  ['line', 'builtin-line'],
  ['image', 'builtin-image'],
  ['qrcode', 'builtin-qrcode'],
  ['barcode', 'builtin-barcode'],
  ['ellipse', 'builtin-ellipse'],
  ['table-static', 'builtin-table'],
  ['table-data', 'builtin-table-data'],
  ['page-number', 'builtin-page-number'],
  ['container', 'builtin-container'],
  ['svg-star', 'builtin-svg-star'],
  ['svg-heart', 'builtin-svg-heart'],
  ['svg', 'builtin-svg-custom'],
  ['flow-row', 'builtin-flow-row'],
  ['chart', 'builtin-chart'],
]

await assertBuiltAsset('assets/viewer.js')
await assertBuiltAsset('assets/viewer.css')
await writeFile(
  resolve(runtimeRoot, 'index.html'),
  await readFile(resolve(packageRoot, 'src/index.html'), 'utf8'),
)
await mkdir(resolve(runtimeRoot, 'assets/materials'), { recursive: true })
await writeFile(
  resolve(runtimeRoot, 'assets/materials/manifest.json'),
  `${JSON.stringify({
    schemaVersion: 1,
    runtime: 'easyink-viewer',
    materials: materials.map(([type, viewer]) => ({ type, viewer })),
  }, null, 2)}\n`,
)

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
