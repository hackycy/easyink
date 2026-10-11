import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const mapDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(mapDirectory, '../..')
const mode = process.argv[2] ?? 'validate'
const errors = []
const read = file => readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
const field = (body, name) => body.match(new RegExp(`^${name}: (.+)$`, 'm'))?.[1]?.trim()
const relative = file => path.relative(repositoryRoot, file).split(path.sep).join('/')

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory())
      return markdownFiles(file)
    return entry.name.endsWith('.md') ? [file] : []
  })
}

function headingIds(body) {
  const ids = new Set()
  const counts = new Map()
  for (const match of body.matchAll(/^#{1,6} (.+)$/gm)) {
    const base = match[1].toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '').replace(/ /g, '-')
    const count = counts.get(base) ?? 0
    ids.add(count ? `${base}-${count}` : base)
    counts.set(base, count + 1)
  }
  return ids
}

function checkLinks(file) {
  const body = read(file).replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, '')
  for (const match of body.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
    const href = match[1].replace(/^<|>$/g, '')
    if (/^[a-z][a-z\d+.-]*:/i.test(href))
      continue
    const [pathname, anchor] = href.split('#')
    const target = pathname ? path.resolve(path.dirname(file), decodeURIComponent(pathname)) : file
    if (!existsSync(target)) {
      errors.push(`${relative(file)}: missing link ${href}`)
      continue
    }
    if (anchor && target.endsWith('.md') && !headingIds(read(target)).has(decodeURIComponent(anchor)))
      errors.push(`${relative(file)}: missing heading ${href}`)
  }
}

if (!['validate', 'frontier'].includes(mode)) {
  console.error('Usage: node .scratch/material-plugin-refactor/check-map.mjs [validate|frontier]')
  process.exit(1)
}

const issueDirectory = path.join(mapDirectory, 'issues')
const issues = readdirSync(issueDirectory).filter(file => /^\d{2}-.+\.md$/.test(file)).sort().map((file) => {
  const body = read(path.join(issueDirectory, file))
  const blocked = field(body, 'Blocked by')
  return {
    id: file.slice(0, 2),
    file,
    body,
    title: body.match(/^# (.+)$/m)?.[1],
    type: field(body, 'Type'),
    status: field(body, 'Status'),
    assignee: field(body, 'Assignee'),
    blocked,
    dependencies: blocked === 'none' ? [] : (blocked ?? '').split(',').map(item => item.trim()),
  }
})
const byId = new Map(issues.map(issue => [issue.id, issue]))
const mapBody = read(path.join(mapDirectory, 'map.md'))
const names = new Set()

if (byId.size !== issues.length)
  errors.push('Duplicate issue id')
if (field(mapBody, 'Labels') !== 'wayfinder:map')
  errors.push('Map label must be wayfinder:map')

for (const issue of issues) {
  const fail = message => errors.push(`${issue.file}: ${message}`)
  if (!issue.title || names.has(issue.title))
    fail('Missing or duplicate title')
  names.add(issue.title)
  if (!['research', 'grilling', 'prototype', 'task'].includes(issue.type))
    fail('Invalid type')
  if (field(issue.body, 'Labels') !== `wayfinder:${issue.type}`)
    fail('Label must match type')
  if (!['open', 'claimed', 'resolved'].includes(issue.status))
    fail('Invalid status')
  if (!issue.assignee || (issue.status === 'open' && issue.assignee !== 'none') || (issue.status === 'claimed' && issue.assignee === 'none'))
    fail('Invalid assignee for status')
  if (!field(issue.body, 'Parent')?.includes('(../map.md)'))
    fail('Missing parent map link')
  if (!/^## Question$/m.test(issue.body))
    fail('Missing question')
  if (!issue.blocked || new Set(issue.dependencies).size !== issue.dependencies.length)
    fail('Invalid dependency list')
  for (const dependency of issue.dependencies) {
    if (!byId.has(dependency) || dependency === issue.id)
      fail(`Invalid dependency ${dependency}`)
    if (issue.status === 'resolved' && byId.get(dependency)?.status !== 'resolved')
      fail(`Resolved ticket still blocked by ${dependency}`)
  }
  const indexed = mapBody.includes(`(./issues/${issue.file})`)
  if (issue.status === 'resolved') {
    if (!/^## Answer\n\n\S/m.test(issue.body))
      fail('Missing resolution answer')
    if (!indexed)
      fail('Resolved ticket missing from map index')
  }
  else if (indexed) {
    fail('Open tickets must be queried, not listed in the map index')
  }
}

const visited = new Set()
function visit(id, ancestors = []) {
  if (ancestors.includes(id)) {
    errors.push(`Dependency cycle: ${[...ancestors, id].join(' -> ')}`)
    return
  }
  if (visited.has(id))
    return
  for (const dependency of byId.get(id)?.dependencies ?? [])
    visit(dependency, [...ancestors, id])
  visited.add(id)
}
for (const issue of issues)
  visit(issue.id)

const documents = [
  ...markdownFiles(mapDirectory),
  path.join(repositoryRoot, 'GLOSSARY.md'),
  path.join(repositoryRoot, '.github/architecture/README.md'),
]
for (const document of documents)
  checkLinks(document)

if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
}
else {
  const frontier = issues.filter(issue => issue.status === 'open' && issue.assignee === 'none' && issue.dependencies.every(id => byId.get(id)?.status === 'resolved'))
  if (mode === 'frontier') {
    for (const issue of frontier)
      process.stdout.write(`[${issue.title}](${relative(path.join(issueDirectory, issue.file))})\n`)
    if (!frontier.length)
      process.stdout.write('No unclaimed, unblocked decision tickets.\n')
  }
  else {
    process.stdout.write(`${JSON.stringify({
      documents: documents.length,
      tickets: issues.length,
      resolved: issues.filter(issue => issue.status === 'resolved').length,
      open: issues.filter(issue => issue.status === 'open').length,
      claimed: issues.filter(issue => issue.status === 'claimed').length,
      frontier: frontier.map(issue => issue.title),
      errors: 0,
    }, null, 2)}\n`)
  }
}
