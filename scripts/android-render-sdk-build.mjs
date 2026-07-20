import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { chmod, mkdir, rm } from 'node:fs/promises'
import { request } from 'node:https'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const androidRoot = resolve(repoRoot, 'lib/EasyInk.Android')
const gradleVersion = '9.4.1'
const distDir = resolve(androidRoot, '.gradle/android-render-sdk')
const gradleUserHome = resolve(androidRoot, '.gradle/user-home')
const zipPath = resolve(distDir, `gradle-${gradleVersion}-bin.zip`)
const gradleHome = resolve(distDir, `gradle-${gradleVersion}`)
const gradleBin = resolve(gradleHome, 'bin/gradle')

await ensureGradle()
await run(gradleBin, [
  '--no-daemon',
  '-p',
  androidRoot,
  'clean',
  'assembleRelease',
  'verifyAarRuntimeAssets',
  'publishReleasePublicationToFlutterSampleRepository',
  ':sample-minimal:assembleDebug',
])

async function ensureGradle() {
  try {
    await chmod(gradleBin, 0o755)
    return
  }
  catch {
  }

  await mkdir(distDir, { recursive: true })
  await download(
    `https://services.gradle.org/distributions/gradle-${gradleVersion}-bin.zip`,
    zipPath,
  )

  await rm(gradleHome, { recursive: true, force: true })
  await run('unzip', ['-q', '-o', zipPath, '-d', distDir])
  await chmod(gradleBin, 0o755)
}

async function download(url, output) {
  await new Promise((resolvePromise, rejectPromise) => {
    request(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        download(response.headers.location, output).then(resolvePromise, rejectPromise)
        return
      }
      if (response.statusCode !== 200) {
        rejectPromise(new Error(`Download failed ${response.statusCode}: ${url}`))
        return
      }
      pipeline(response, createWriteStream(output)).then(resolvePromise, rejectPromise)
    }).on('error', rejectPromise).end()
  })
}

async function run(command, args) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: androidRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        GRADLE_USER_HOME: gradleUserHome,
        JAVA_HOME: process.env.JAVA_HOME,
      },
    })
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      rejectPromise(new Error(`${command} ${args.join(' ')} exited with ${code}`))
    })
    child.on('error', rejectPromise)
  })
}
