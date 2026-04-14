import type { DataAdapter } from '@easyink/datasource'
import { invoiceDemoData } from './index'

export function createDemoDataAdapter(): DataAdapter {
  return {
    id: 'demo',
    match: source => source.id === 'invoice',
    load: async () => invoiceDemoData,
  }
}
