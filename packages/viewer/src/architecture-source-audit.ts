import ts from 'typescript'

export interface AuditedTypeScriptSource {
  readonly path: string
  readonly text: string
}

export interface TypeScriptSourceAuditRules {
  readonly forbiddenIdentifiers: readonly string[]
  readonly forbiddenProperties: readonly string[]
  readonly forbiddenImportSources: readonly string[]
}

export interface TypeScriptSourceViolation {
  readonly path: string
  readonly symbol: string
  readonly kind: 'identifier' | 'property-access' | 'element-access' | 'import-source'
  readonly line: number
  readonly column: number
}

export function auditTypeScriptSource(
  source: AuditedTypeScriptSource,
  rules: TypeScriptSourceAuditRules,
): TypeScriptSourceViolation[] {
  const sourceFile = ts.createSourceFile(
    source.path,
    source.text,
    ts.ScriptTarget.Latest,
    true,
    source.path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const forbiddenIdentifiers = new Set(rules.forbiddenIdentifiers)
  const forbiddenProperties = new Set(rules.forbiddenProperties)
  const violations: TypeScriptSourceViolation[] = []

  const add = (node: ts.Node, symbol: string, kind: TypeScriptSourceViolation['kind']) => {
    const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
    violations.push({
      path: source.path,
      symbol,
      kind,
      line: location.line + 1,
      column: location.character + 1,
    })
  }

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const importSource = node.moduleSpecifier.text
      if (rules.forbiddenImportSources.some(forbidden => importSource === forbidden || importSource.endsWith(forbidden)))
        add(node.moduleSpecifier, importSource, 'import-source')
    }
    if (ts.isIdentifier(node) && forbiddenIdentifiers.has(node.text))
      add(node, node.text, 'identifier')
    if (ts.isPropertyAccessExpression(node) && forbiddenProperties.has(node.name.text))
      add(node.name, node.name.text, 'property-access')
    if (ts.isElementAccessExpression(node)
      && ts.isStringLiteralLike(node.argumentExpression)
      && forbiddenProperties.has(node.argumentExpression.text)) {
      add(node.argumentExpression, node.argumentExpression.text, 'element-access')
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return violations
}
