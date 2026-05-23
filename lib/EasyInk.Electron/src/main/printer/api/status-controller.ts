import { ok } from '../../engine/models'
import type { PrinterResult } from '../../engine/models'
import type { HostConfig } from '../config/host-config'

export interface RuntimeStatusOptions {
  httpPort?: number
  webSocket: boolean
  connections: number
  queue?: unknown
  config?: HostConfig
}

export class StatusController {
  getStatus(options: RuntimeStatusOptions): PrinterResult {
    return ok('status', {
      name: 'EasyInk Printer',
      httpPort: options.httpPort,
      chromiumPrint: true,
      htmlPrint: true,
      viewerPrint: true,
      webSocket: options.webSocket,
      connections: options.connections,
      queue: options.queue,
      uptimeSeconds: Math.round(process.uptime()),
      ...(options.config ? { config: options.config } : {})
    })
  }

  getConnections(connections: number): PrinterResult {
    return ok('connections', { count: connections })
  }
}
