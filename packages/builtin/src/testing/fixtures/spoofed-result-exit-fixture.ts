import process from 'node:process'

process.send?.({
  kind: 'result',
  requestId: 'wrong-request',
  auth: '00'.repeat(32),
  reports: [{ materialType: 'fixture-spoofed-exit', valid: true, issues: [] }],
})
process.exit(23)

export const unreachable = Object.freeze({})
