import type { RenderApiRequest } from './protocol'
import { describe, expect, it } from 'vitest'
import { resolveRenderBinary, toPrintPDFRequest, toRenderCliArgs } from './cli'

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
