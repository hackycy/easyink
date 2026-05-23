import { randomUUID } from 'crypto'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { pathToFileURL } from 'url'
import type { PrintRequestParams, PrintSourceType } from '../../models'
import { offsetToCss } from '../unit-converter'

export interface ResolvedPrintSource {
  type: PrintSourceType
  url: string
  cleanup: () => Promise<void>
}

export async function resolvePrintSource(
  request: PrintRequestParams
): Promise<ResolvedPrintSource> {
  if (request.viewer) {
    return writeHtmlSource(buildViewerHtmlSource(request), request, 'viewer')
  }

  if (request.html != null) {
    return writeHtmlSource(request.html, request)
  }

  if (request.htmlBase64) {
    return writeHtmlSource(
      Buffer.from(request.htmlBase64, 'base64').toString('utf8'),
      request,
      'htmlBase64'
    )
  }

  if (request.htmlUrl) {
    assertHttpUrl(request.htmlUrl, 'htmlUrl')
    return {
      type: 'htmlUrl',
      url: request.htmlUrl,
      cleanup: async () => {}
    }
  }

  if (request.pdfBytes) {
    const bytes = Buffer.isBuffer(request.pdfBytes)
      ? request.pdfBytes
      : Buffer.from(request.pdfBytes)
    return writeBinarySource(bytes, 'pdfBytes')
  }

  if (request.pdfBase64) {
    return writeBinarySource(
      Buffer.from(stripDataUrlPrefix(request.pdfBase64), 'base64'),
      'pdfBase64'
    )
  }

  if (request.pdfUrl) {
    assertHttpUrl(request.pdfUrl, 'pdfUrl')
    return {
      type: 'pdfUrl',
      url: request.pdfUrl,
      cleanup: async () => {}
    }
  }

  throw new Error('必须提供 pdfBase64、pdfUrl、pdfBytes、html、htmlBase64、htmlUrl 或 viewer 之一')
}

function stripDataUrlPrefix(value: string): string {
  const marker = ';base64,'
  const index = value.indexOf(marker)
  return index >= 0 ? value.slice(index + marker.length) : value
}

async function writeBinarySource(
  bytes: Buffer,
  type: PrintSourceType
): Promise<ResolvedPrintSource> {
  const dir = await mkdtemp(join(tmpdir(), 'easyink-electron-'))
  const file = join(dir, `${randomUUID()}.pdf`)
  await writeFile(file, bytes)
  return {
    type,
    url: pathToFileURL(file).toString(),
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true })
    }
  }
}

async function writeHtmlSource(
  html: string,
  request: PrintRequestParams,
  type: PrintSourceType = 'html'
): Promise<ResolvedPrintSource> {
  const dir = await mkdtemp(join(tmpdir(), 'easyink-electron-'))
  const file = join(dir, `${randomUUID()}.html`)
  await writeFile(file, normalizeHtml(html, request), 'utf8')
  return {
    type,
    url: pathToFileURL(file).toString(),
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true })
    }
  }
}

function normalizeHtml(html: string, request: PrintRequestParams): string {
  const baseTag = request.baseUrl ? `<base href="${escapeAttribute(request.baseUrl)}">` : ''
  const offsetCss = offsetToCss(request.offset)
  const printCss = `
    <style>
      @media print {
        ${offsetCss}
      }
    </style>
  `

  const hasHtmlTag = /<html[\s>]/i.test(html)
  if (!hasHtmlTag) {
    return `<!doctype html><html class="easyink-print-offset"><head>${baseTag}${printCss}</head><body>${html}</body></html>`
  }

  const withClass = html.replace(/<html([^>]*)>/i, (match, attrs: string) => {
    if (/class\s*=/.test(attrs)) {
      return match.replace(
        /class\s*=\s*(['"])(.*?)\1/i,
        (_classMatch, quote: string, value: string) => {
          return `class=${quote}${value} easyink-print-offset${quote}`
        }
      )
    }
    return `<html${attrs} class="easyink-print-offset">`
  })

  if (/<head[\s>]/i.test(withClass)) {
    return withClass.replace(/<head([^>]*)>/i, `<head$1>${baseTag}${printCss}`)
  }

  return withClass.replace(/<html([^>]*)>/i, `<html$1><head>${baseTag}${printCss}</head>`)
}

function buildViewerHtmlSource(request: PrintRequestParams): string {
  const viewer = request.viewer
  if (!viewer || !Array.isArray(viewer.pages) || viewer.pages.length === 0) {
    throw new Error('viewer 打印必须提供至少一个 pages 项')
  }

  const title = escapeHtmlText(viewer.title ?? request.userData?.title ?? 'EasyInk Viewer Print')
  const head = viewer.head ?? ''
  const styles = viewer.styles ?? ''
  const pages = viewer.pages
    .map((page) => `<section class="ei-viewer-print-page">${page}</section>`)
    .join('\n')

  return `<!doctype html>
<html class="easyink-viewer-print">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  ${head}
  <style>
    html,
    body {
      margin: 0;
      padding: 0;
      background: #fff;
    }

    .ei-viewer-print-page {
      break-after: page;
      page-break-after: always;
    }

    .ei-viewer-print-page:last-child {
      break-after: auto;
      page-break-after: auto;
    }

    @media print {
      .ei-viewer-print-page {
        box-shadow: none !important;
      }
    }
  </style>
  ${styles ? `<style>${styles}</style>` : ''}
</head>
<body>
${pages}
</body>
</html>`
}

function escapeHtmlText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
}

function assertHttpUrl(value: string, fieldName: string): void {
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${fieldName} 仅支持 http/https URL`)
  }
}
