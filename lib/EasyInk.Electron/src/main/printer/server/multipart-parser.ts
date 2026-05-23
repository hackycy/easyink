export interface MultipartPart {
  name: string
  filename?: string
  contentType?: string
  data: Buffer
}

export function parseMultipartBody(body: Buffer, contentType: string | undefined): MultipartPart[] {
  const boundary = readBoundary(contentType)
  if (!boundary) {
    throw new Error('缺少 multipart boundary')
  }

  const delimiter = Buffer.from(`--${boundary}`)
  const parts: MultipartPart[] = []
  let position = body.indexOf(delimiter)

  while (position >= 0) {
    position += delimiter.byteLength
    if (body.subarray(position, position + 2).toString('utf8') === '--') {
      break
    }
    if (body.subarray(position, position + 2).toString('utf8') === '\r\n') {
      position += 2
    }

    const headerEnd = body.indexOf('\r\n\r\n', position, 'utf8')
    if (headerEnd < 0) {
      break
    }

    const headers = parseHeaders(body.subarray(position, headerEnd).toString('utf8'))
    const dataStart = headerEnd + 4
    const nextDelimiter = body.indexOf(Buffer.from(`\r\n--${boundary}`), dataStart)
    if (nextDelimiter < 0) {
      break
    }

    const disposition = parseContentDisposition(headers.get('content-disposition'))
    if (disposition.name) {
      parts.push({
        name: disposition.name,
        filename: disposition.filename,
        contentType: headers.get('content-type'),
        data: Buffer.from(body.subarray(dataStart, nextDelimiter))
      })
    }

    position = nextDelimiter + 2
  }

  return parts
}

function readBoundary(contentType: string | undefined): string | undefined {
  const match = contentType?.match(/(?:^|;)\s*boundary=(?:"([^"]+)"|([^;]+))/i)
  return match?.[1] ?? match?.[2]?.trim()
}

function parseHeaders(raw: string): Map<string, string> {
  const headers = new Map<string, string>()
  for (const line of raw.split('\r\n')) {
    const separator = line.indexOf(':')
    if (separator <= 0) {
      continue
    }
    headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim())
  }
  return headers
}

function parseContentDisposition(value: string | undefined): {
  name?: string
  filename?: string
} {
  const result: { name?: string; filename?: string } = {}
  if (!value) {
    return result
  }

  const parameterPattern = /;\s*([^=]+)=(?:"([^"]*)"|([^;]*))/g
  let match: RegExpExecArray | null
  while ((match = parameterPattern.exec(value))) {
    const key = match[1].trim().toLowerCase()
    const parameterValue = match[2] ?? match[3]?.trim() ?? ''
    if (key === 'name') {
      result.name = parameterValue
    } else if (key === 'filename') {
      result.filename = parameterValue
    }
  }
  return result
}
