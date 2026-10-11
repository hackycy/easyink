import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'
const roots=['packages/designer/src','packages/assistant/designer-bridge/src']
const excluded=['designer-store.test.ts','image-source-editor.test.ts','selection-overlay.test.ts','store-operations.test.ts']
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?files(path.join(dir,x.name)):[path.join(dir,x.name)])}
for(const file of roots.flatMap(files).filter(x=>x.endsWith('.test.ts')&&!excluded.includes(path.basename(x)))){
 let source=fs.readFileSync(file,'utf8');const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);const edits=[];const asyncs=new Set()
 function visit(node){
  if(ts.isNewExpression(node)&&node.expression.getText(ast)==='DesignerStore'){
   const args=node.arguments??[];const keys=['schema','preferenceProvider','interactionProvider','runtimeConfig']; const options=args.map((a,i)=>a.getText(ast)==='undefined'?null:`${keys[i]}: ${a.getText(ast)}`).filter(Boolean).join(', ')
   edits.push([node.getStart(ast),node.end,`await DesignerStore.create({ ${options} })`])
   let parent=node.parent;while(parent&&!ts.isFunctionLike(parent))parent=parent.parent
   if(parent&&!parent.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword))asyncs.add(parent)
  }
  ts.forEachChild(node,visit)
 }
 visit(ast)
 for(const f of asyncs){const start=f.getStart(ast);edits.push([start,start,'async '])}
 for(const [start,end,text] of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+text+source.slice(end)
 if(edits.length)fs.writeFileSync(file,source)
}
