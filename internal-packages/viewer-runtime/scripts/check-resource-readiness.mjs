import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

// Continuous resource and consumer regression checks in a real browser.
const root = fileURLToPath(new URL('../../../', import.meta.url))
const cutover = process.argv.includes('--cutover')
const entry = cutover ? 'playground/src/consumer-cutover.browser.ts' : 'internal-packages/viewer-runtime/src/resource-readiness.browser.ts'
const browserPath = process.env.EASYINK_RENDER_BROWSER_PATH ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find(path => existsSync(path))
assert(browserPath, 'Set EASYINK_RENDER_BROWSER_PATH to a Chromium executable')
const font = await readFile(join(root, 'playground/public/fonts/站酷快乐体.ttf'))
const image = await readFile(join(root, 'docs/public/logo.png'))
const hits = new Map()
const fixtureTimers = new Set()
const workDir = await mkdtemp(join(tmpdir(), 'easyink-readiness-'))
const profile = join(workDir, 'browser-profile')
let server
let browser
let socket
try {
  server = await createServer({
    configFile: cutover ? join(root, 'playground/vite.config.ts') : false,
    root,
    cacheDir: join(workDir, 'vite-cache'),
    optimizeDeps: { entries: [entry] },
    resolve: { alias: cutover ? {} : { '@easyink/viewer': join(root, 'packages/viewer/src/index.ts') } },
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'readiness-fixtures',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = new URL(req.url, 'http://localhost')
          if (url.pathname === '/readiness-check') {
            res.setHeader('Content-Type', 'text/html')
            res.end('<!doctype html><title>EasyInk resource readiness</title><body></body>')
            return
          }
          if (url.pathname === '/cutover-runtime') {
            void (async () => {
              const runtimeRoot = join(root, 'internal-packages/viewer-runtime/dist/runtime/easyink-viewer')
              let html = await readFile(join(runtimeRoot, 'index.html'), 'utf8')
              const css = await readFile(join(runtimeRoot, 'assets/viewer.css'), 'utf8')
              const js = (await readFile(join(runtimeRoot, 'assets/viewer.js'), 'utf8')).replaceAll('</script', '<\\/script')
              html = html.replace('<style data-easyink-runtime="viewer-css"></style>', () => `<style>${css}</style>`)
              html = html.replace('<script data-easyink-runtime="viewer-js"></script>', () => `<script>${js}</script>`)
              html = html.replace('application/json">{}</script>', `application/json">${JSON.stringify({ schema: { page: { width: 80, height: 40 }, elements: [{ id: 'cutover', type: 'text', x: 1, y: 1, width: 60, height: 15, props: { content: 'Embedded cutover' } }] } })}</script>`)
              res.setHeader('Content-Type', 'text/html; charset=utf-8')
              res.end(html)
            })().catch((error) => {
              res.statusCode = 500
              res.end(String(error))
            })
            return
          }
          if (!url.pathname.startsWith('/readiness-fixture/')) {
            next()
            return
          }
          const key = url.pathname.split('/').pop()
          hits.set(key, (hits.get(key) ?? 0) + 1)
          res.setHeader('Cache-Control', 'no-store')
          const respond = () => {
            if (url.searchParams.has('fail')) {
              res.statusCode = 404
              res.end('missing resource')
            }
            else {
              res.setHeader('Content-Type', key.endsWith('.ttf') ? 'font/ttf' : 'image/png')
              res.end(key.endsWith('.ttf') ? font : image)
            }
          }
          const delay = Number(url.searchParams.get('delay') ?? 0)
          if (delay) {
            const timer = setTimeout(() => {
              fixtureTimers.delete(timer)
              respond()
            }, delay)
            fixtureTimers.add(timer)
          }
          else {
            respond()
          }
        })
      },
    }],
  })
  let preparationTimer
  try {
    await Promise.race([
      (async () => {
        await server.listen()
        assert(await server.transformRequest(`/${entry}`), `Browser check entry not found: ${entry}`)
        await server.waitForRequestsIdle()
      })(),
      new Promise((_, reject) => {
        preparationTimer = setTimeout(() => reject(new Error(`Browser check preparation timed out: ${entry}`)), 60_000)
      }),
    ])
  }
  finally {
    clearTimeout(preparationTimer)
  }
  const origin = server.resolvedUrls.local[0]
  browser = spawn(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
  const debugOrigin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Browser debugging startup timed out')), 15_000)
    let output = ''
    browser.stderr.on('data', (chunk) => {
      output += chunk.toString()
      const endpoint = output.match(/DevTools listening on (ws:\/\/\S+)/)?.[1]
      if (endpoint) {
        clearTimeout(timer)
        resolve(endpoint.replace(/^ws:/, 'http:').split('/devtools/')[0])
      }
    })
    browser.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    browser.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`Browser exited early: ${code}`))
    })
  })
  const targets = await fetch(`${debugOrigin}/json/list`).then(res => res.json())
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let id = 0
  const pending = new Map()
  const errors = []
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    if (message.method === 'Runtime.exceptionThrown')
      errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text)
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error')
      errors.push(message.params.args.map(arg => arg.value ?? arg.description).join(' '))
    const operation = pending.get(message.id)
    if (!operation)
      return
    pending.delete(message.id)
    clearTimeout(operation.timer)
    message.error ? operation.reject(new Error(JSON.stringify(message.error))) : operation.resolve(message.result)
  })
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id
    const timer = setTimeout(() => {
      pending.delete(requestId)
      reject(new Error(`Browser operation timed out: ${method}`))
    }, 60_000)
    pending.set(requestId, { resolve, reject, timer })
    socket.send(JSON.stringify({ id: requestId, method, params }))
  })
  await call('Runtime.enable')
  await call('Page.navigate', { url: `${origin}readiness-check` })
  const result = await call('Runtime.evaluate', {
    expression: `import(${JSON.stringify(`${origin}${entry}`)}).then(module => module.${cutover ? 'runConsumerCutoverChecks' : 'runResourceReadinessChecks'}())`,
    awaitPromise: true,
    returnByValue: true,
  })
  assert(!result.exceptionDetails, JSON.stringify({ exception: result.exceptionDetails, errors }))
  assert.equal(result.result.value.failed, 0, JSON.stringify(result.result.value))
  if (!cutover) {
    for (const key of ['font-ok.ttf', 'font-failed.ttf', 'font-late.ttf', 'font-destroy.ttf', 'image-iframe.png', 'image-ok.png', 'image-failed.png', 'image-late.png', 'background-failed.png', 'destroy.png', 'superseded.png', 'font-output.ttf', 'font-output-target.ttf', 'image-output.png'])
      assert(hits.has(key), `Expected an actual browser request for ${key}`)
  }
  console.log(JSON.stringify({ browser: (await call('Browser.getVersion')).product, ...result.result.value, actualRequests: Object.fromEntries(hits) }, null, 2))
}
finally {
  try {
    socket?.close()
    if (browser?.pid && browser.exitCode === null && browser.signalCode === null) {
      const exited = new Promise(resolve => browser.once('exit', resolve))
      browser.kill()
      await exited
    }
  }
  finally {
    for (const timer of fixtureTimers)
      clearTimeout(timer)
    try {
      await server?.close()
    }
    finally {
      await rm(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    }
  }
}
