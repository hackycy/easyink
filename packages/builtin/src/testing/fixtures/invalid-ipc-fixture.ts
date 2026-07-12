import process from 'node:process'

process.send?.({ kind: 'invalid' })

export const invalidIpcFixture = Object.freeze({ invalid: true })
