import { defineStore } from 'pinia'
import type {
  PrintAuditLog,
  PrintJob,
  PrintRequestParams,
  PrinterInfo,
  PrinterResult,
  RuntimeStatus,
  HostConfig,
  LogQuery
} from '../types/easyink'

interface State {
  loading: boolean
  status?: RuntimeStatus
  config?: HostConfig
  printers: PrinterInfo[]
  jobs: PrintJob[]
  logs: PrintAuditLog[]
  lastResult?: PrinterResult
  error?: string
}

export const useEasyInkStore = defineStore('easyink', {
  state: (): State => ({
    loading: false,
    printers: [],
    jobs: [],
    logs: []
  }),
  getters: {
    defaultPrinter: (state) => state.printers.find((printer) => printer.isDefault)
  },
  actions: {
    async refreshAll() {
      this.loading = true
      this.error = undefined
      try {
        const [status, printers, jobs, logs] = await Promise.all([
          window.api.getStatus(),
          window.api.getPrinters(),
          window.api.getAllJobs(),
          window.api.getLogs(defaultLogQuery())
        ])
        this.status = unwrap<RuntimeStatus>(status, status as RuntimeStatus)
        this.config = this.status.config
        this.printers = unwrap<PrinterInfo[]>(printers, [])
        this.jobs = unwrap<PrintJob[]>(jobs, [])
        this.logs = unwrapLogs(logs)
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err)
      } finally {
        this.loading = false
      }
    },
    async print(params: PrintRequestParams, asyncMode: boolean) {
      this.loading = true
      this.error = undefined
      try {
        const result = (
          asyncMode ? await window.api.printAsync(params) : await window.api.print(params)
        ) as PrinterResult
        this.lastResult = result
        await Promise.all([this.refreshJobs(), this.refreshLogs()])
        return result
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err)
        throw err
      } finally {
        this.loading = false
      }
    },
    async refreshJobs() {
      this.jobs = unwrap<PrintJob[]>(await window.api.getAllJobs(), [])
    },
    async refreshStatus() {
      const status = await window.api.getStatus()
      this.status = unwrap<RuntimeStatus>(status, status as RuntimeStatus)
      this.config = this.status.config
    },
    async refreshConfig() {
      const result = await window.api.getConfig()
      this.config = unwrap<HostConfig>(result, this.config ?? ({} as HostConfig))
    },
    async saveConfig(config: HostConfig) {
      const result = await window.api.saveConfig(config)
      const payload = unwrap<{ config: HostConfig; restartRequired: boolean }>(result, {
        config,
        restartRequired: true
      })
      this.config = payload.config
      if (this.status) {
        this.status.config = payload.config
      }
      return payload
    },
    async refreshLogs(query: LogQuery = defaultLogQuery()) {
      this.logs = unwrapLogs(await window.api.getLogs(query))
    },
    async exportLogsCsv(query: LogQuery = defaultLogQuery()) {
      return unwrap<{ csv: string; count: number }>(await window.api.exportLogsCsv(query), {
        csv: '',
        count: 0
      })
    }
  }
})

export function defaultLogQuery(): LogQuery {
  const endTime = new Date()
  const startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000)
  return {
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    limit: 100
  }
}

function unwrap<T>(result: unknown, fallback: T): T {
  const response = result as PrinterResult<T>
  return response.success && response.data ? response.data : fallback
}

function unwrapLogs(result: unknown): PrintAuditLog[] {
  if (Array.isArray(result)) {
    return result as PrintAuditLog[]
  }

  const response = result as PrinterResult<PrintAuditLog[] | { logs: PrintAuditLog[] }>
  if (!response.success || !response.data) {
    return []
  }
  return Array.isArray(response.data) ? response.data : (response.data.logs ?? [])
}
