import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)])
}
for (const file of files('packages/designer/src').filter(file => file.endsWith('.test.ts'))) {
  let source = fs.readFileSync(file, 'utf8')
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const names = new Set()
  function collect(node) {
    if (ts.isFunctionDeclaration(node) && node.name && node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword))
      names.add(node.name.text)
    ts.forEachChild(node, collect)
  }
  collect(ast)
  if (!names.size) continue
  const edits = []
  const asyncs = new Set()
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && names.has(node.expression.text) && !ts.isAwaitExpression(node.parent)) {
      edits.push([node.getStart(ast), node.getStart(ast), 'await '])
      let parent = node.parent
      while (parent && !ts.isFunctionLike(parent)) parent = parent.parent
      if (parent && !parent.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)) asyncs.add(parent)
    }
    if (ts.isFunctionDeclaration(node) && node.type?.getText(ast) === 'DesignerStore' && node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword))
      edits.push([node.type.getStart(ast), node.type.end, 'Promise<DesignerStore>'])
    ts.forEachChild(node, visit)
  }
  visit(ast)
  for (const fn of asyncs) edits.push([fn.getStart(ast), fn.getStart(ast), 'async '])
  for (const [start, end, text] of edits.sort((a, b) => b[0] - a[0])) source = source.slice(0, start) + text + source.slice(end)
  if (edits.length) fs.writeFileSync(file, source)
}
