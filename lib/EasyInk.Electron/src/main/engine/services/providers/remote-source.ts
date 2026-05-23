import { lookup } from 'dns/promises'
import { isIP } from 'net'

const DEFAULT_TIMEOUT_MS = 30000
const DEFAULT_MAX_REDIRECTS = 5

export interface DownloadedRemoteSource {
  bytes: Buffer
  finalUrl: string
  contentType?: string
}

export async function downloadSafeRemoteSource(
  inputUrl: string,
  fieldName: string,
  maxBytes: number,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<DownloadedRemoteSource> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await downloadWithRedirects(inputUrl, fieldName, maxBytes, controller.signal)
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`${fieldName} 下载超时`)
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

async function downloadWithRedirects(
  inputUrl: string,
  fieldName: string,
  maxBytes: number,
  signal: AbortSignal,
  redirects = 0
): Promise<DownloadedRemoteSource> {
  if (redirects > DEFAULT_MAX_REDIRECTS) {
    throw new Error(`${fieldName} 重定向次数过多`)
  }

  const url = new URL(inputUrl)
  await assertSafeHttpUrl(url, fieldName)

  const response = await fetch(url, { redirect: 'manual', signal })
  if (isRedirect(response.status)) {
    const location = response.headers.get('location')
    if (!location) {
      throw new Error(`${fieldName} 重定向缺少 Location`)
    }
    return downloadWithRedirects(
      new URL(location, url).toString(),
      fieldName,
      maxBytes,
      signal,
      redirects + 1
    )
  }

  if (!response.ok) {
    throw new Error(`${fieldName} 下载失败: HTTP ${response.status}`)
  }

  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`${fieldName} 超过 ${Math.floor(maxBytes / 1024 / 1024)}MB 上限`)
  }

  const bytes = await readResponseBytes(response, maxBytes, fieldName)
  return {
    bytes,
    finalUrl: response.url || url.toString(),
    contentType: response.headers.get('content-type') ?? undefined
  }
}

export async function assertSafeHttpUrl(url: URL, fieldName: string): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${fieldName} 仅支持 http/https URL`)
  }

  const hostname = normalizeHostname(url.hostname)
  if (isBlockedHostname(hostname)) {
    throw new Error(`${fieldName} 不允许访问本机或内网地址`)
  }

  const ipVersion = isIP(hostname)
  if (ipVersion !== 0) {
    if (isBlockedIp(hostname)) {
      throw new Error(`${fieldName} 不允许访问本机或内网地址`)
    }
    return
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true })
  if (addresses.length === 0 || addresses.some((address) => isBlockedIp(address.address))) {
    throw new Error(`${fieldName} 不允许访问本机或内网地址`)
  }
}

async function readResponseBytes(
  response: Response,
  maxBytes: number,
  fieldName: string
): Promise<Buffer> {
  if (!response.body) {
    return Buffer.alloc(0)
  }

  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
    const buffer = Buffer.from(chunk)
    size += buffer.byteLength
    if (size > maxBytes) {
      throw new Error(`${fieldName} 超过 ${Math.floor(maxBytes / 1024 / 1024)}MB 上限`)
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400
}

function normalizeHostname(hostname: string): string {
  return hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase()
}

function isBlockedHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname.endsWith('.localhost')
}

function isBlockedIp(address: string): boolean {
  const normalized = normalizeHostname(address)
  const ipVersion = isIP(normalized)
  if (ipVersion === 4) {
    return isBlockedIpv4(normalized)
  }
  if (ipVersion === 6) {
    return isBlockedIpv6(normalized)
  }
  return true
}

function isBlockedIpv4(address: string): boolean {
  const parts = address.split('.').map((part) => Number(part))
  const [a, b] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  )
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase()
  if (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  ) {
    return true
  }

  const ipv4Mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  return ipv4Mapped ? isBlockedIpv4(ipv4Mapped[1]) : false
}
