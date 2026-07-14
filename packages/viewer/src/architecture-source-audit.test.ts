import { describe, expect, it } from 'vitest'
import { auditTypeScriptSource } from './architecture-source-audit'

describe('architecture TypeScript source audit', () => {
  it.each([
    ['spaced call', 'sample.ts', 'normalizeDocumentSchema (input)'],
    ['multiline call', 'sample.ts', 'renderPages\n  (pages)'],
    ['aliased import', 'sample.ts', "import { normalizeDocumentSchema as admit } from '@easyink/schema'\nadmit(input)"],
    ['TSX expression', 'sample.tsx', 'export const View = () => <div>{getRenderSize(node)}</div>'],
    ['property access', 'sample.ts', 'surface.innerHTML = markup'],
    ['element access', 'sample.ts', "surface['innerHTML'] = markup"],
  ])('detects %s structurally', (_label, path, source) => {
    expect(auditTypeScriptSource({ path, text: source }, {
      forbiddenIdentifiers: ['normalizeDocumentSchema', 'renderPages', 'getRenderSize'],
      forbiddenProperties: ['innerHTML'],
      forbiddenImportSources: ['./conditional-schema'],
    })).toEqual([expect.objectContaining({ path })])
  })

  it('detects forbidden conditional-schema imports and ignores comments, strings, and longer names', () => {
    const violations = auditTypeScriptSource({
      path: 'sample.ts',
      text: [
        "import { resolve } from './conditional-schema'",
        "const explanation = 'normalizeDocumentSchema (input)'",
        '// renderPages(pages)',
        'renderPagesToPdfBlob(pages)',
      ].join('\n'),
    }, {
      forbiddenIdentifiers: ['normalizeDocumentSchema', 'renderPages'],
      forbiddenProperties: ['innerHTML'],
      forbiddenImportSources: ['./conditional-schema'],
    })

    expect(violations).toEqual([
      expect.objectContaining({ symbol: './conditional-schema', kind: 'import-source' }),
    ])
  })
})
