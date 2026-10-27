import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../../../../../', import.meta.url))
const androidRoot = resolve(root, 'lib/EasyInk.Android')
const adb = process.env.ADB_PATH ?? 'adb'
const serial = process.env.ANDROID_SERIAL
assert(serial, 'Set ANDROID_SERIAL to a real adb device with WebView; missing devices cannot pass')

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: androidRoot,
    encoding: 'utf8',
    timeout: 600_000,
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  })
  assert.ifError(result.error)
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed`)
  return result.stdout
}

run('sh', ['gradlew', '--no-daemon', 'assembleRelease', 'verifyAarRuntimeAssets', ':sample-minimal:assembleDebug', ':sample-minimal:assembleDebugAndroidTest'])
const apk = resolve(androidRoot, 'samples/minimal/build/outputs/apk/debug/sample-minimal-debug.apk')
const testApk = resolve(androidRoot, 'samples/minimal/build/outputs/apk/androidTest/debug/sample-minimal-debug-androidTest.apk')
run(adb, ['-s', serial, 'install', '-r', apk])
run(adb, ['-s', serial, 'install', '-r', testApk])
const output = run(adb, ['-s', serial, 'shell', 'am', 'instrument', '-w', '-r', 'com.easyink.android.sample.test/com.easyink.android.sample.CutoverInstrumentation'], true)
process.stdout.write(output)
assert(output.includes('INSTRUMENTATION_CODE: -1'), 'Real Android instrumentation failed')
const report = JSON.parse(output.match(/EASYINK_CUTOVER (.+)/)?.[1] ?? 'null')
assert(report?.checks.length === 5 && report.runtimeWorkersAfterCleanup === 0, 'All four sample outputs and async cleanup must pass')
const artifacts = ['build/outputs/aar/easyink-android-render-release.aar', apk, testApk].map(path => ({
  path,
  sha256: createHash('sha256').update(readFileSync(resolve(androidRoot, path))).digest('hex'),
}))
process.stdout.write(`${JSON.stringify({ serial, ...report, artifacts }, null, 2)}\n`)
