import type { MaterialConformanceIssue, MaterialConformanceReport } from '@easyink/core'
import { Buffer } from 'node:buffer'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { types as utilTypes } from 'node:util'

export interface IsolatedConformanceSession {
  requestId: string
  secret: string
}

const arrayIsArray = Array.isArray
const arrayPrototype = Array.prototype
const bufferFrom = Buffer.from.bind(Buffer)
const capturedCreateHmac = createHmac
const capturedRandomBytes = randomBytes
const capturedTimingSafeEqual = timingSafeEqual
const freeze = Object.freeze
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const getPrototypeOf = Object.getPrototypeOf
const hmacPrototype = getPrototypeOf(capturedCreateHmac('sha256', 'capture-only')) as {
  update: (value: string) => unknown
  digest: (encoding: 'hex') => string
}
const capturedHmacDigest = hmacPrototype.digest
const capturedHmacUpdate = hmacPrototype.update
const jsonStringify = JSON.stringify
const objectPrototype = Object.prototype
const ownKeys = Reflect.ownKeys
const reflectApply = Reflect.apply
const isProxy = utilTypes.isProxy.bind(utilTypes)

const MAX_REPORTS = 1_000
const MAX_ISSUES = 512
const MAX_MATERIAL_TYPE_LENGTH = 1_024
const MAX_CODE_LENGTH = 256
const MAX_PATH_LENGTH = 4_096
const MAX_MESSAGE_LENGTH = 1_024

export function createIsolatedConformanceSession(): IsolatedConformanceSession {
  return {
    requestId: capturedRandomBytes(16).toString('hex'),
    secret: capturedRandomBytes(32).toString('base64url'),
  }
}

export function createHandshakeMessage(session: IsolatedConformanceSession): unknown {
  return { kind: 'handshake', requestId: session.requestId, secret: session.secret }
}

export function parseHandshakeMessage(value: unknown): IsolatedConformanceSession | undefined {
  if (!hasExactDataProperties(value, ['kind', 'requestId', 'secret']))
    return undefined
  const kind = dataValue(value, 'kind')
  const requestId = dataValue(value, 'requestId')
  const secret = dataValue(value, 'secret')
  if (kind !== 'handshake'
    || typeof requestId !== 'string'
    || !/^[a-f\d]{32}$/.test(requestId)
    || typeof secret !== 'string'
    || !/^[\w-]{43}$/.test(secret)) {
    return undefined
  }
  return { requestId, secret }
}

export function createAuthenticatedResultMessage(
  session: IsolatedConformanceSession,
  reportsValue: unknown,
): unknown {
  const reports = cloneAndFreezeMaterialConformanceReports(reportsValue)
  return {
    kind: 'result',
    requestId: session.requestId,
    reports,
    auth: reportsAuth(session, reports),
  }
}

export function parseAuthenticatedResultMessage(
  value: unknown,
  session: IsolatedConformanceSession,
): readonly MaterialConformanceReport[] | undefined {
  if (!hasExactDataProperties(value, ['kind', 'requestId', 'reports', 'auth']))
    return undefined
  const kind = dataValue(value, 'kind')
  const requestId = dataValue(value, 'requestId')
  const auth = dataValue(value, 'auth')
  if (kind !== 'result' || requestId !== session.requestId || typeof auth !== 'string' || !/^[a-f\d]{64}$/.test(auth))
    return undefined
  let reports: readonly MaterialConformanceReport[]
  try {
    reports = cloneAndFreezeMaterialConformanceReports(dataValue(value, 'reports'))
  }
  catch {
    return undefined
  }
  const expected = reportsAuth(session, reports)
  const receivedBytes = bufferFrom(auth, 'hex')
  const expectedBytes = bufferFrom(expected, 'hex')
  if (receivedBytes.byteLength !== expectedBytes.byteLength || !capturedTimingSafeEqual(receivedBytes, expectedBytes))
    return undefined
  return reports
}

export function cloneAndFreezeMaterialConformanceReports(value: unknown): readonly MaterialConformanceReport[] {
  const reportValues = strictArray(value, MAX_REPORTS)
  let issueCount = 0
  const reports: MaterialConformanceReport[] = []
  for (let reportIndex = 0; reportIndex < reportValues.length; reportIndex++) {
    const reportValue = reportValues[reportIndex]
    if (!hasExactDataProperties(reportValue, ['materialType', 'valid', 'issues']))
      throw new Error('CONFORMANCE_ISOLATED_EXECUTION_REPORT_INVALID')
    const materialType = boundedString(dataValue(reportValue, 'materialType'), MAX_MATERIAL_TYPE_LENGTH)
    const valid = dataValue(reportValue, 'valid')
    if (typeof valid !== 'boolean')
      throw new Error('CONFORMANCE_ISOLATED_EXECUTION_REPORT_INVALID')
    const issueValues = strictArray(dataValue(reportValue, 'issues'), MAX_ISSUES - issueCount)
    issueCount += issueValues.length
    const issues: MaterialConformanceIssue[] = []
    for (let issueIndex = 0; issueIndex < issueValues.length; issueIndex++) {
      const issueValue = issueValues[issueIndex]
      if (!hasExactDataProperties(issueValue, ['code', 'path', 'message']))
        throw new Error('CONFORMANCE_ISOLATED_EXECUTION_REPORT_INVALID')
      const code = boundedString(dataValue(issueValue, 'code'), MAX_CODE_LENGTH)
      const path = boundedString(dataValue(issueValue, 'path'), MAX_PATH_LENGTH)
      const message = boundedString(dataValue(issueValue, 'message'), MAX_MESSAGE_LENGTH)
      if (path !== '' && path[0] !== '/')
        throw new Error('CONFORMANCE_ISOLATED_EXECUTION_REPORT_INVALID')
      issues[issues.length] = freeze({ code, path: path as `/${string}` | '', message })
    }
    reports[reports.length] = freeze({ materialType, valid, issues: freeze(issues) })
  }
  return freeze(reports)
}

function reportsAuth(session: IsolatedConformanceSession, reports: readonly MaterialConformanceReport[]): string {
  const hmac = capturedCreateHmac('sha256', session.secret)
  reflectApply(capturedHmacUpdate, hmac, [session.requestId])
  reflectApply(capturedHmacUpdate, hmac, ['\0'])
  reflectApply(capturedHmacUpdate, hmac, [canonicalReports(reports)])
  return reflectApply(capturedHmacDigest, hmac, ['hex'])
}

function canonicalReports(reports: readonly MaterialConformanceReport[]): string {
  let canonical = '['
  for (let reportIndex = 0; reportIndex < reports.length; reportIndex++) {
    if (reportIndex > 0)
      canonical += ','
    const report = reports[reportIndex]!
    canonical += `{${quote(report.materialType)},${report.valid ? '1' : '0'},[`
    for (let issueIndex = 0; issueIndex < report.issues.length; issueIndex++) {
      if (issueIndex > 0)
        canonical += ','
      const issue = report.issues[issueIndex]!
      canonical += `{${quote(issue.code)},${quote(issue.path)},${quote(issue.message)}}`
    }
    canonical += ']}'
  }
  return `${canonical}]`
}

function quote(value: string): string {
  return jsonStringify(value)
}

function strictArray(value: unknown, maxLength: number): readonly unknown[] {
  if (isProxy(value) || !arrayIsArray(value) || getPrototypeOf(value) !== arrayPrototype)
    throw new Error('CONFORMANCE_ISOLATED_EXECUTION_REPORT_INVALID')
  if (value.length > maxLength)
    throw new Error('CONFORMANCE_ISOLATED_EXECUTION_REPORT_BUDGET_EXCEEDED')
  const keys = ownKeys(value)
  if (keys.length !== value.length + 1 || keys[keys.length - 1] !== 'length')
    throw new Error('CONFORMANCE_ISOLATED_EXECUTION_REPORT_INVALID')
  const items: unknown[] = []
  for (let index = 0; index < value.length; index++) {
    const key = `${index}`
    if (keys[index] !== key)
      throw new Error('CONFORMANCE_ISOLATED_EXECUTION_REPORT_INVALID')
    const descriptor = getOwnPropertyDescriptor(value, key)
    if (!descriptor || !('value' in descriptor))
      throw new Error('CONFORMANCE_ISOLATED_EXECUTION_REPORT_INVALID')
    items[items.length] = descriptor.value
  }
  return items
}

function hasExactDataProperties(value: unknown, expectedKeys: readonly string[]): value is object {
  if (typeof value !== 'object' || value === null || isProxy(value) || getPrototypeOf(value) !== objectPrototype)
    return false
  const keys = ownKeys(value)
  if (keys.length !== expectedKeys.length)
    return false
  for (let expectedIndex = 0; expectedIndex < expectedKeys.length; expectedIndex++) {
    const key = expectedKeys[expectedIndex]!
    let found = false
    for (let actualIndex = 0; actualIndex < keys.length; actualIndex++) {
      const actualKey = keys[actualIndex]
      if (actualKey === key) {
        found = true
        break
      }
    }
    if (!found)
      return false
    const descriptor = getOwnPropertyDescriptor(value, key)
    if (!descriptor || !('value' in descriptor))
      return false
  }
  return true
}

function dataValue(value: object, key: string): unknown {
  const descriptor = getOwnPropertyDescriptor(value, key)
  if (!descriptor || !('value' in descriptor))
    throw new Error('CONFORMANCE_ISOLATED_EXECUTION_REPORT_INVALID')
  return descriptor.value
}

function boundedString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string')
    throw new Error('CONFORMANCE_ISOLATED_EXECUTION_REPORT_INVALID')
  if (value.length > maxLength)
    throw new Error('CONFORMANCE_ISOLATED_EXECUTION_REPORT_BUDGET_EXCEEDED')
  return value
}
