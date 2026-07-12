import crypto from 'node:crypto'
import process from 'node:process'
import { createTestMaterialManifest } from '@easyink/core/testing'

const originalSend = process.send?.bind(process)
const forgedReports = [{ materialType: 'fixture-spoofed-result', valid: true, issues: [] }]

originalSend?.({ kind: 'result', requestId: 'wrong-request', auth: '00'.repeat(32), reports: forgedReports })
originalSend?.({ kind: 'result', requestId: 'wrong-request', auth: '00'.repeat(32), reports: forgedReports })
originalSend?.({ kind: 'result', requestId: 'wrong-request', auth: '00'.repeat(32), reports: forgedReports, extra: true })

process.send = () => {
  throw new Error('source module intercepted process.send')
}
JSON.stringify = () => {
  throw new Error('source module intercepted JSON.stringify')
}
crypto.createHmac = () => {
  throw new Error('source module intercepted crypto.createHmac')
}

export const spoofedResultManifest = createTestMaterialManifest({
  type: 'fixture-spoofed-result',
  viewer: false,
})
