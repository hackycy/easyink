import type { RenderApiRequest } from './protocol'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveRenderBinary, toPrintPDFRequest, toRenderCliArgs } from './cli'
import { DEFAULT_CLI_TIMEOUT_MS, DEFAULT_MAX_BODY_BYTES, DEFAULT_RENDER_API_CORS_ORIGIN, DEFAULT_RENDER_API_HOST, DEFAULT_RENDER_API_PORT, loadRenderApiConfig, loadRenderApiEnv, RenderConfigError } from './config'

describe('render API env config', () => {
  it('loads defaults when env is empty', () => {
    expect(loadRenderApiConfig({})).toEqual({
      host: DEFAULT_RENDER_API_HOST,
      port: DEFAULT_RENDER_API_PORT,
      binary: undefined,
      workDir: undefined,
      keepWorkDir: false,
      cliTimeoutMs: DEFAULT_CLI_TIMEOUT_MS,
      maxBodyBytes: DEFAULT_MAX_BODY_BYTES,
      corsOrigin: DEFAULT_RENDER_API_CORS_ORIGIN,
      defaultRuntime: {},
    })
  })

  it('maps env values to process and default runtime config', () => {
    expect(loadRenderApiConfig({
      EASYINK_RENDER_API_HOST: '0.0.0.0',
      EASYINK_RENDER_API_PORT: '19000',
      EASYINK_RENDER_BIN: '/opt/easyink-render',
      EASYINK_RENDER_API_WORK_DIR: '/tmp/easyink',
      EASYINK_RENDER_API_KEEP_WORK_DIR: 'true',
      EASYINK_RENDER_API_CLI_TIMEOUT_MS: '30000',
      EASYINK_RENDER_API_CORS_ORIGIN: 'http://localhost:5173',
      EASYINK_RENDER_API_MAX_BODY_BYTES: '1048576',
      EASYINK_RENDER_NO_DAEMON: '1',
      EASYINK_RENDER_DISABLE_SANDBOX: 'false',
      EASYINK_RENDER_BROWSER_KIND: 'headless-shell',
      EASYINK_RENDER_REQUEST_TIMEOUT_MS: '5000',
    })).toEqual({
      host: '0.0.0.0',
      port: 19000,
      binary: '/opt/easyink-render',
      workDir: '/tmp/easyink',
      keepWorkDir: true,
      cliTimeoutMs: 30000,
      maxBodyBytes: 1048576,
      corsOrigin: 'http://localhost:5173',
      defaultRuntime: {
        noDaemon: true,
        disableSandbox: false,
        browserKind: 'headless-shell',
        requestTimeoutMs: 5000,
      },
    })
  })

  it('rejects invalid env values early', () => {
    expect(() => loadRenderApiConfig({ EASYINK_RENDER_API_PORT: 'nope' })).toThrow(RenderConfigError)
    expect(() => loadRenderApiConfig({ EASYINK_RENDER_API_KEEP_WORK_DIR: 'maybe' })).toThrow(RenderConfigError)
  })

  it('loads dotenv files with process env precedence', async () => {
    const envDir = await mkdtemp(join(tmpdir(), 'easyink-render-api-env-'))

    try {
      await writeFile(join(envDir, '.env'), [
        'EASYINK_RENDER_API_HOST=from-env',
        'EASYINK_RENDER_API_PORT=18082',
        'EASYINK_RENDER_BROWSER_KIND=chromium',
      ].join('\n'))
      await writeFile(join(envDir, '.env.local'), 'EASYINK_RENDER_API_PORT=18083\n')
      await writeFile(join(envDir, '.env.test'), 'EASYINK_RENDER_BROWSER_KIND=headless-shell\n')
      await writeFile(join(envDir, '.env.test.local'), 'EASYINK_RENDER_API_HOST=from-test-local\n')

      const env = loadRenderApiEnv({
        envDir,
        nodeEnv: 'test',
        baseEnv: {
          EASYINK_RENDER_API_PORT: '19000',
        },
      })

      expect(loadRenderApiConfig(env)).toMatchObject({
        host: 'from-test-local',
        port: 19000,
        defaultRuntime: {
          browserKind: 'headless-shell',
        },
      })
    }
    finally {
      await rm(envDir, { force: true, recursive: true })
    }
  })
})

describe('render CLI adapter', () => {
  it('strips API-only fields before writing the Render request', () => {
    const input: RenderApiRequest = {
      requestId: 'req-001',
      source: { type: 'html', html: '<html></html>' },
      response: { type: 'base64Json', includeDiagnostics: true },
      runtime: { noDaemon: true },
    }

    expect(toPrintPDFRequest(input)).toEqual({
      requestId: 'req-001',
      source: { type: 'html', html: '<html></html>' },
      pdf: undefined,
      wait: undefined,
      output: undefined,
      security: undefined,
      diagnostics: undefined,
    })
  })

  it('maps runtime options to supported easyink-render flags', () => {
    expect(toRenderCliArgs({
      requestPath: '/tmp/request.json',
      outputPath: '/tmp/out.pdf',
      diagnosticsPath: '/tmp/diagnostics.json',
    }, {
      noDaemon: true,
      forceRestartDaemon: true,
      disableSandbox: true,
      browserKind: 'headless-shell',
      browserPath: '/bin/headless-shell',
      maxConcurrency: 2,
      requestTimeoutMs: 5000,
    })).toEqual([
      'render',
      '--request',
      '/tmp/request.json',
      '--out',
      '/tmp/out.pdf',
      '--diagnostics-out',
      '/tmp/diagnostics.json',
      '--json',
      '--no-daemon',
      '--force-restart-daemon',
      '--disable-sandbox',
      '--browser-kind',
      'headless-shell',
      '--browser-path',
      '/bin/headless-shell',
      '--max-concurrency',
      '2',
      '--request-timeout-ms',
      '5000',
    ])
  })

  it('lets explicit binary configuration win over auto-discovery', () => {
    expect(resolveRenderBinary('/opt/easyink/easyink-render')).toBe('/opt/easyink/easyink-render')
  })
})
