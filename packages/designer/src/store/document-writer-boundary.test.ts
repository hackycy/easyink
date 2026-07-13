// @ts-expect-error The Designer package runtime test intentionally uses Node filesystem APIs.
import { readdirSync, readFileSync } from 'node:fs'
// @ts-expect-error The Designer package runtime test intentionally uses Node path APIs.
import { dirname, extname, relative, resolve } from 'node:path'
// @ts-expect-error The Designer package runtime test intentionally uses Node URL APIs.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const DESIGNER_SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = resolve(DESIGNER_SRC, '../../..')
const ASSISTANT_APPLY = resolve(REPO_ROOT, 'packages/assistant/designer-bridge/src/apply.ts')
const CORE_SRC = resolve(REPO_ROOT, 'packages/core/src')

const FORBIDDEN_WRITER_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['legacy store.commands', /\bstore\.commands\b|\b(?:ctx\.)?store\.commands\b/],
  ['legacy CommandManager', /\bCommandManager\b/],
  ['legacy command construction', /\bnew\s+[A-Z][A-Za-z0-9]*Command\b/],
  ['direct command execution', /\bcommand\.execute\s*\(/],
  ['command-like execution', /\b[A-Za-z_$][\w$]*\.execute\s*\(/],
  ['internal document writer symbol', /\bDOCUMENT_STORE_WRITER\b/],
  ['direct schema assignment', /\b(?:ctx\.)?store\.schema(?:\??\.[A-Za-z_$][\w$]*|\[[^\]]+\])*\s*=(?!=)/],
  ['direct schema array mutation', /\b(?:ctx\.)?store\.schema(?:\??\.[A-Za-z_$][\w$]*|\[[^\]]+\])*\.(?:push|splice|pop|shift|unshift|sort|reverse)\s*\(/],
  ['Object.assign schema mutation', /\bObject\.assign\s*\(\s*(?:ctx\.)?store\.schema\b/],
  ['setByPath schema mutation', /\bsetByPath\s*\(\s*(?:ctx\.)?store\.schema\b/],
]

describe('document writer boundary', () => {
  it('keeps Designer and assistant production document writes behind transactions', () => {
    const files = [...productionSources(DESIGNER_SRC), ASSISTANT_APPLY]
    const violations = files.flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      const patterns = file === ASSISTANT_APPLY
        ? [...FORBIDDEN_WRITER_PATTERNS, ['assistant lifecycle schema reset', /\bstore\.setSchema\s*\(/] as const]
        : FORBIDDEN_WRITER_PATTERNS
      return patterns
        .filter(([, pattern]) => pattern.test(source))
        .map(([name]) => `${relative(REPO_ROOT, file)}: ${name}`)
    })

    expect(violations).toEqual([])
  })

  it('limits the core internal writer symbol to the store and transaction engine', () => {
    const importers = productionSources(CORE_SRC)
      .filter(file => readFileSync(file, 'utf8').includes('from \'./document-store-internal\''))
      .map(file => relative(CORE_SRC, file).replaceAll('\\', '/'))
      .sort()

    expect(importers).toEqual(['document-store.ts', 'document-transaction-engine.ts'])
  })
})

function productionSources(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry: any) => {
    const path = resolve(root, entry.name)
    if (entry.isDirectory())
      return productionSources(path)
    if (!['.ts', '.vue'].includes(extname(entry.name)) || entry.name.endsWith('.test.ts') || entry.name.endsWith('.spec.ts'))
      return []
    return [path]
  })
}
