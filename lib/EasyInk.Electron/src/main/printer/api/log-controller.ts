import { ok } from '../../engine/models'
import type { PrinterResult } from '../../engine/models'
import type { AuditService } from '../services/audit-service'

export class LogController {
  constructor(private readonly auditService: AuditService) {}

  queryLogs(query: URLSearchParams | Record<string, unknown>): PrinterResult {
    return ok('logs', {
      logs: this.auditService.query({
        startTime: getQueryValue(query, 'startTime'),
        endTime: getQueryValue(query, 'endTime'),
        printerName: getQueryValue(query, 'printerName'),
        userId: getQueryValue(query, 'userId'),
        status: getQueryValue(query, 'status'),
        limit: Number(getQueryValue(query, 'limit') ?? 100),
        offset: Number(getQueryValue(query, 'offset') ?? 0)
      })
    })
  }
}

function getQueryValue(
  query: URLSearchParams | Record<string, unknown>,
  key: string
): string | undefined {
  const value = query instanceof URLSearchParams ? query.get(key) : query[key]
  return value == null || value === '' ? undefined : String(value)
}
