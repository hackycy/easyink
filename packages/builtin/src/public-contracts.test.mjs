import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'
import { expect, it } from 'vitest'

it('consumes emitted complete collections and rejects legacy builtin assembly exports', () => {
  const script = resolve('packages/builtin/src/test-fixtures/check-consumption.mjs')
  const result = JSON.parse(execFileSync(process.execPath, [script], { encoding: 'utf8', timeout: 30000 }))
  expect(result).toEqual({ rejectedHostExports: 32, rejectedMaterialFactories: 26, entries: 8, materialEntries: 50, rejectedIncompleteMaterials: 2, rejectedLegacyImports: 296, rejectedSubpaths: 5 })
}, 35000)
