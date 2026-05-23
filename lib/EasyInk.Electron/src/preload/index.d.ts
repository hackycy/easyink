import { ElectronAPI } from '@electron-toolkit/preload'

export interface EasyInkApi {
  getStatus: () => Promise<unknown>
  getPrinters: () => Promise<unknown>
  getPrinterStatus: (printerName: string) => Promise<unknown>
  print: (params: unknown) => Promise<unknown>
  printAsync: (params: unknown) => Promise<unknown>
  getAllJobs: () => Promise<unknown>
  getJobStatus: (jobId: string) => Promise<unknown>
  getLogs: (limit?: number) => Promise<unknown>
  handleCommand: (command: unknown) => Promise<unknown>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: EasyInkApi
  }
}
