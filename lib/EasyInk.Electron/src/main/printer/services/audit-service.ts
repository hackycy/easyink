import { randomUUID } from 'crypto'
import type {
  PrintAuditLog,
  PrintRequestParams,
  PrinterResult,
  PrintSourceType
} from '../../engine/models'

export class AuditService {
  private readonly logs: PrintAuditLog[] = []

  constructor(private readonly retentionDays = 90) {}

  record(command: string, request: PrintRequestParams | undefined, result: PrinterResult): void {
    this.logs.unshift({
      id: randomUUID(),
      command,
      printerName: request?.printerName,
      success: result.success,
      createdAt: new Date().toISOString(),
      sourceType: request ? detectSourceType(request) : undefined,
      userData: request?.userData,
      errorMessage: result.errorInfo?.message
    })
    this.purge()
  }

  query(limit = 100): PrintAuditLog[] {
    return this.logs.slice(0, Math.min(Math.max(limit, 1), 500))
  }

  private purge(): void {
    const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000
    for (let index = this.logs.length - 1; index >= 0; index -= 1) {
      if (new Date(this.logs[index].createdAt).getTime() < cutoff) {
        this.logs.splice(index, 1)
      }
    }
  }
}

export function detectSourceType(request: PrintRequestParams): PrintSourceType | undefined {
  if (request.html != null) return 'html'
  if (request.htmlBase64) return 'htmlBase64'
  if (request.htmlUrl) return 'htmlUrl'
  if (request.pdfBytes) return 'pdfBytes'
  if (request.pdfBase64) return 'pdfBase64'
  if (request.pdfUrl) return 'pdfUrl'
  return undefined
}
