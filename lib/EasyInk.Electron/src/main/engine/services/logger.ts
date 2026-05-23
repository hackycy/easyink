export type LogLevel = 'info' | 'error'

export interface Logger {
  log: (level: LogLevel, message: string, jobId?: string) => void
}

export const nullLogger: Logger = {
  log: () => {}
}
