// eslint-disable-next-line ts/ban-ts-comment -- Root and package typechecks have different Node type visibility.
// @ts-ignore The Designer package runtime test intentionally uses Node filesystem APIs.
import { readdirSync, readFileSync } from 'node:fs'
// eslint-disable-next-line ts/ban-ts-comment -- Root and package typechecks have different Node type visibility.
// @ts-ignore The Designer package runtime test intentionally uses Node path APIs.
import { dirname, extname, relative, resolve } from 'node:path'
// eslint-disable-next-line ts/ban-ts-comment -- Root and package typechecks have different Node type visibility.
// @ts-ignore The Designer package runtime test intentionally uses Node URL APIs.
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const DESIGNER_SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = resolve(DESIGNER_SRC, '../../..')
const ASSISTANT_APPLY = resolve(REPO_ROOT, 'packages/assistant/designer-bridge/src/apply.ts')
const CORE_SRC = resolve(REPO_ROOT, 'packages/core/src')
const FORBIDDEN_PUBLIC_WRITER_EXPORTS = new Set([
  'AddElementGroupCommand',
  'AddMaterialCommand',
  'AddPageSheetCommand',
  'applyJsonPatches',
  'BindFieldCommand',
  'ClearBindingCommand',
  'CommandManager',
  'CompositeCommand',
  'createBatchCommand',
  'createTransactionService',
  'DOCUMENT_STORE_WRITER',
  'DocumentStoreWrite',
  'DocumentStoreWriter',
  'DocumentWriter',
  'HistoryEntry',
  'MoveMaterialCommand',
  'PatchCommand',
  'PatchCommandOptions',
  'RemoveElementGroupCommand',
  'RemoveMaterialCommand',
  'RemovePageSheetCommand',
  'ResizeMaterialCommand',
  'RotateMaterialCommand',
  'UnionDropCommand',
  'UpdateBindingFormatCommand',
  'UpdateDocumentCommand',
  'UpdateGeometryCommand',
  'UpdateGuidesCommand',
  'UpdateMaterialBindingCommand',
  'UpdateMaterialEditorStateCommand',
  'UpdateMaterialModelCommand',
  'UpdateMaterialOutputCommand',
  'UpdatePageCommand',
  'UpdateRenderConditionCommand',
])

const FORBIDDEN_WRITER_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['legacy store.commands', /\bstore\.commands\b|\b(?:ctx\.)?store\.commands\b/],
  ['legacy CommandManager', /\bCommandManager\b/],
  ['legacy command construction', /\bnew\s+[A-Z][A-Za-z0-9]*Command\b/],
  ['direct command execution', /\bcommand\.execute\s*\(/],
  ['command-like execution', /\b[A-Za-z_$][\w$]*\.execute\s*\(/],
  ['internal document writer symbol', /\bDOCUMENT_STORE_WRITER\b/],
  ['legacy material extension command writer', /\bcommitCommand\b/],
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

  it('limits the core internal writer symbol to its definition, store, and transaction engine', () => {
    const users = productionSources(CORE_SRC)
      .filter(file => /\bDOCUMENT_STORE_WRITER\b/.test(readFileSync(file, 'utf8')))
      .map(file => relative(CORE_SRC, file).replaceAll('\\', '/'))
      .sort()

    expect(users).toEqual(['document-store-internal.ts', 'document-store.ts', 'document-transaction-engine.ts'])
  })

  it('does not expose a legacy document writer through public barrels', () => {
    const barrels = [
      resolve(CORE_SRC, 'index.ts'),
      resolve(DESIGNER_SRC, 'types.ts'),
      resolve(DESIGNER_SRC, 'index.ts'),
    ]
    const audits = barrels.map(auditPublicBarrel)

    expect(audits.flatMap(audit => audit.forbiddenModules)).toEqual([])
    expect(audits.flatMap(audit => audit.forbiddenNames)).toEqual([])
    expect(readFileSync(resolve(CORE_SRC, 'material-extension.ts'), 'utf8')).not.toMatch(/\bcommitCommand\b/)
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

function auditPublicBarrel(file: string): { forbiddenModules: string[], forbiddenNames: string[] } {
  const source = readFileSync(file, 'utf8')
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const forbiddenModules: string[] = []
  const forbiddenNames: string[] = []

  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement))
      continue

    if (statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      const moduleName = statement.moduleSpecifier.text.replace(/\.[cm]?[jt]s$/u, '')
      if (/^\.\/(?:command|commands|patch-command)$/u.test(moduleName))
        forbiddenModules.push(`${relative(REPO_ROOT, file)}: ${statement.moduleSpecifier.text}`)
    }

    if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        const names = [element.propertyName?.text, element.name.text].filter(name => name !== undefined)
        for (const name of names) {
          if (FORBIDDEN_PUBLIC_WRITER_EXPORTS.has(name))
            forbiddenNames.push(`${relative(REPO_ROOT, file)}: ${name}`)
        }
      }
    }
  }

  return { forbiddenModules, forbiddenNames }
}
