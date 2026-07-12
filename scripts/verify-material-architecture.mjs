import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import process from 'node:process'

const root = resolve(import.meta.dirname, '..')
const failures = []

const forbiddenSourceRoots = [
  'packages/assistant/constraint-engine/src',
  'packages/assistant/schema-builder/src',
]
const forbiddenSourcePatterns = [
  { label: 'legacy material root access', pattern: /\b(?:node|draft|element|input)\.(?:props|binding|children|table)\b/g },
  { label: 'nested legacy table model', pattern: /\bmodel\.table\b|\.model\.table\b/g },
]

for (const sourceRoot of forbiddenSourceRoots) {
  for (const file of await filesBelow(resolve(root, sourceRoot))) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts'))
      continue
    const content = await readFile(file, 'utf8')
    for (const { label, pattern } of forbiddenSourcePatterns) {
      for (const match of content.matchAll(pattern))
        failures.push(`${slash(relative(root, file))}:${lineAt(content, match.index)}: ${label}: ${match[0]}`)
    }
  }
}

const frameworkOwners = [
  'packages/assistant',
  'packages/browser-dom',
  'packages/core',
  'packages/designer',
  'packages/schema',
  'packages/schema-tools',
  'packages/viewer',
]
for (const owner of frameworkOwners) {
  for (const file of await filesBelow(resolve(root, owner))) {
    if (!file.endsWith('package.json'))
      continue
    const manifest = JSON.parse(await readFile(file, 'utf8'))
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const dependency of Object.keys(manifest[section] ?? {})) {
        if (dependency.startsWith('@easyink/material-'))
          failures.push(`${slash(relative(root, file))}: framework package must not own concrete material dependency ${dependency}`)
      }
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exitCode = 1
}
else {
  console.log('Material architecture scans passed.')
}

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory())
      files.push(...await filesBelow(path))
    else if (entry.isFile())
      files.push(path)
  }
  return files
}

function lineAt(content, index = 0) {
  return content.slice(0, index).split('\n').length
}

function slash(path) {
  return path.replaceAll('\\', '/')
}
