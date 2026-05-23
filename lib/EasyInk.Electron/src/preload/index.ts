import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  getStatus: () => ipcRenderer.invoke('easyink:getStatus'),
  getConfig: () => ipcRenderer.invoke('easyink:getConfig'),
  saveConfig: (config: unknown) => ipcRenderer.invoke('easyink:saveConfig', config),
  getPrinters: () => ipcRenderer.invoke('easyink:getPrinters'),
  getPrinterStatus: (printerName: string) =>
    ipcRenderer.invoke('easyink:getPrinterStatus', printerName),
  print: (params: unknown) => ipcRenderer.invoke('easyink:print', params),
  printAsync: (params: unknown) => ipcRenderer.invoke('easyink:printAsync', params),
  getAllJobs: () => ipcRenderer.invoke('easyink:getAllJobs'),
  getJobStatus: (jobId: string) => ipcRenderer.invoke('easyink:getJobStatus', jobId),
  getLogs: (query?: unknown) => ipcRenderer.invoke('easyink:getLogs', query),
  exportLogsCsv: (query?: unknown) => ipcRenderer.invoke('easyink:exportLogsCsv', query),
  handleCommand: (command: unknown) => ipcRenderer.invoke('easyink:handleCommand', command)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
