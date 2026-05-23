import { defineStore } from 'pinia'
import type {
  PrintAuditLog,
  PrintJob,
  PrintRequestParams,
  PrinterInfo,
  PrinterResult,
  RuntimeStatus
} from '../types/easyink'

interface State {
  loading: boolean
  status?: RuntimeStatus
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
          window.api.getLogs(100)
        ])
        this.status = status as RuntimeStatus
        this.printers = unwrap<PrinterInfo[]>(printers, [])
        this.jobs = unwrap<PrintJob[]>(jobs, [])
        this.logs = logs as PrintAuditLog[]
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
    async refreshLogs() {
      this.logs = (await window.api.getLogs(100)) as PrintAuditLog[]
    }
  }
})

function unwrap<T>(result: unknown, fallback: T): T {
  const response = result as PrinterResult<T>
  return response.success && response.data ? response.data : fallback
}
