import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { cancel, confirm, intro, isCancel, outro } from '@clack/prompts'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const gitBinary = 'git'
const pnpmBinary = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const validationScripts = ['lint', 'build', 'typecheck']
const commitMessage = 'chore: bump version'
const releaseBranch = 'main'
const releaseRemote = 'origin'

async function main() {
  ensureInteractiveTerminal()
  intro('easyink changeset release')

  await runPreflightChecks()

  await confirmStep({
    title: '步骤 1/4: 运行 changeset',
    details: [
      '命令: pnpm changeset',
      '说明: 终端控制权会直接交给 changeset，退出后脚本继续。',
    ],
  })

  const changesetResult = await runInteractiveCommand(pnpmBinary, ['changeset'])
  if (changesetResult.cancelled) {
    stopGracefully('changeset 已取消，流程已退出。')
  }

  const changedAfterChangeset = await listChangedFiles()
  if (changedAfterChangeset.length === 0) {
    stopGracefully('未检测到 changeset 产生的改动，流程已退出。')
  }

  await confirmStep({
    title: '步骤 2/4: 运行 changeset:version',
    details: [
      '命令: pnpm changeset:version',
      '说明: 版本号、变更日志和相关文件会在这一步更新。',
    ],
  })

  const versionResult = await runInteractiveCommand(pnpmBinary, ['changeset:version'])
  if (versionResult.cancelled) {
    stopGracefully('changeset:version 已取消，流程已退出。')
  }

  const changedAfterVersion = await listChangedFiles()
  if (changedAfterVersion.length === 0) {
    fail('changeset:version 执行后没有任何改动，流程已中止。')
  }

  const versionBumpFiles = await collectVersionBumpFiles(changedAfterVersion)
  if (versionBumpFiles.length === 0) {
    fail([
      '检测到改动，但没有发现任何 package version 变化。',
      '这通常意味着 changeset:version 没有按预期完成发布版本推进。',
      '流程已中止，请先检查当前改动。',
    ].join('\n'))
  }

  await runValidationSuite('版本变更后校验', validationScripts)

  const tagName = formatTag(new Date())
  await confirmStep({
    title: '步骤 3/4: 提交、打 tag 并推送',
    details: [
      `commit: ${commitMessage}`,
      `tag: ${tagName}`,
      `branch: ${releaseRemote}/${releaseBranch}`,
      `version files: ${versionBumpFiles.join(', ')}`,
    ],
  })

  await ensureTagDoesNotExist(tagName)
  await runCommandOrFail(gitBinary, ['add', '.'], 'git add .')
  await runCommandOrFail(gitBinary, ['commit', '-m', commitMessage], `git commit -m "${commitMessage}"`)
  await runCommandOrFail(gitBinary, ['tag', '-a', tagName, '-m', tagName], `git tag -a ${tagName} -m ${tagName}`)

  try {
    await runCommandOrFail(
      gitBinary,
      ['push', releaseRemote, '-u', releaseBranch],
      `git push ${releaseRemote} -u ${releaseBranch}`,
    )
    await runCommandOrFail(
      gitBinary,
      ['push', releaseRemote, `refs/tags/${tagName}`],
      `git push ${releaseRemote} refs/tags/${tagName}`,
    )
  }
  catch (error) {
    fail([
      '推送失败，脚本已停止。',
      `当前 commit 已创建，本地 tag ${tagName} 也已经存在。`,
      `如果分支已推送成功但 tag 推送失败，请先检查远端状态再决定是否单独补推 refs/tags/${tagName}。`,
      '请先人工检查本地仓库状态，再决定是否重新推送或回滚。',
      error instanceof Error ? error.message : String(error),
    ].join('\n'))
  }

  const finish = await confirm({
    message: '步骤 4/4: 发布已完成，确认结束脚本？',
    active: '结束',
    inactive: '直接退出',
    initialValue: true,
  })

  if (isCancel(finish) || !finish) {
    process.exit(0)
  }

  console.log('')
  console.log(`[release] tag: ${tagName}`)
  console.log(`[release] branch: ${releaseRemote}/${releaseBranch}`)
  console.log(`[release] commit: ${commitMessage}`)
  outro('发布流程执行完成。')
}

function ensureInteractiveTerminal() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    fail('该脚本只支持交互式终端执行。')
  }
}

async function runPreflightChecks() {
  console.log('')
  console.log('[release] 发布前校验开始')

  const statusOutput = await runCapturedCommandOrFail(gitBinary, ['status', '--porcelain=v1', '--untracked-files=all'], 'git status')
  if (statusOutput.trim().length > 0) {
    fail(['检测到未提交改动，发布脚本要求从干净工作区开始。', statusOutput.trim()].join('\n'))
  }

  const branchName = await runCapturedCommandOrFail(gitBinary, ['rev-parse', '--abbrev-ref', 'HEAD'], 'git rev-parse --abbrev-ref HEAD')
  if (branchName !== releaseBranch) {
    fail(`当前分支为 ${branchName}，只允许在 ${releaseBranch} 分支执行。`)
  }

  const upstream = await runCapturedCommand(gitBinary, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
  if (upstream.code !== 0 || upstream.stdout.trim() !== `${releaseRemote}/${releaseBranch}`) {
    fail(`当前分支必须跟踪 ${releaseRemote}/${releaseBranch}。`)
  }

  await runCommandOrFail(gitBinary, ['fetch', releaseRemote], `git fetch ${releaseRemote}`)

  const divergence = await runCapturedCommandOrFail(
    gitBinary,
    ['rev-list', '--left-right', '--count', `${releaseRemote}/${releaseBranch}...HEAD`],
    `git rev-list --left-right --count ${releaseRemote}/${releaseBranch}...HEAD`,
  )

  const [behindCount, aheadCount] = divergence.split(/\s+/).map(value => Number.parseInt(value, 10))
  if (behindCount !== 0 || aheadCount !== 0) {
    fail([
      `本地分支和 ${releaseRemote}/${releaseBranch} 不一致。`,
      `behind: ${behindCount}, ahead: ${aheadCount}`,
      '请先把本地 main 与远端 main 对齐，再重新执行发布脚本。',
    ].join('\n'))
  }

  await runValidationSuite('发布前校验', validationScripts)
}

async function runValidationSuite(title, scripts) {
  console.log('')
  console.log(`[release] ${title}`)

  for (const scriptName of scripts) {
    await runCommandOrFail(pnpmBinary, [scriptName], `pnpm ${scriptName}`)
  }
}

async function confirmStep({ title, details }) {
  console.log('')
  console.log(`[release] ${title}`)
  for (const detail of details)
    console.log(`[release]   ${detail}`)

  const answer = await confirm({
    message: `${title}，是否继续？`,
    active: '继续',
    inactive: '退出',
    initialValue: false,
  })

  if (isCancel(answer) || !answer) {
    stopGracefully(`${title} 已取消，流程已退出。`)
  }
}

async function ensureTagDoesNotExist(tagName) {
  const localTag = await runCapturedCommand(gitBinary, ['rev-parse', '-q', '--verify', `refs/tags/${tagName}`])
  if (localTag.code === 0) {
    fail(`本地已存在同名 tag: ${tagName}`)
  }

  const remoteTag = await runCapturedCommandOrFail(gitBinary, ['ls-remote', '--tags', releaseRemote, `refs/tags/${tagName}`], `git ls-remote --tags ${releaseRemote} refs/tags/${tagName}`)
  if (remoteTag.trim().length > 0) {
    fail(`远端已存在同名 tag: ${tagName}`)
  }
}

async function listChangedFiles() {
  const output = await runCapturedCommandOrFail(gitBinary, ['status', '--porcelain=v1', '--untracked-files=all'], 'git status')
  return output
    .split('\n')
    .map(line => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const renamedIndex = line.indexOf(' -> ')
      const pathText = renamedIndex >= 0 ? line.slice(renamedIndex + 4) : line.slice(3)
      return pathText.trim()
    })
}

async function collectVersionBumpFiles(changedFiles) {
  const packageJsonFiles = changedFiles.filter(filePath => filePath === 'package.json' || filePath.endsWith('/package.json'))
  const versionBumpFiles = []

  for (const filePath of packageJsonFiles) {
    const diff = await runCapturedCommandOrFail(gitBinary, ['diff', '--unified=0', '--', filePath], `git diff --unified=0 -- ${filePath}`)
    const hasRemovedVersion = /^-\s*"version"\s*:\s*".+"/m.test(diff)
    const hasAddedVersion = /^\+\s*"version"\s*:\s*".+"/m.test(diff)

    if (hasRemovedVersion && hasAddedVersion) {
      versionBumpFiles.push(filePath)
    }
  }

  return versionBumpFiles
}

function formatTag(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `v${year}.${month}.${day}.${hour}${minute}`
}

async function runInteractiveCommand(command, args) {
  const result = await runSpawn(command, args, { interactive: true })
  if (result.signal === 'SIGINT' || result.code === 130) {
    return { cancelled: true }
  }

  if (result.code !== 0) {
    throw new Error(`${formatCommand(command, args)} 退出码为 ${result.code}`)
  }

  return { cancelled: false }
}

async function runCommandOrFail(command, args, label) {
  console.log('')
  console.log(`[release] > ${label}`)
  const result = await runSpawn(command, args, { interactive: true })

  if (result.code !== 0) {
    throw new Error(`${formatCommand(command, args)} 退出码为 ${result.code}`)
  }
}

async function runCapturedCommandOrFail(command, args, label) {
  const result = await runCapturedCommand(command, args)
  if (result.code !== 0) {
    const stderr = result.stderr.trim()
    throw new Error(`${label} 执行失败${stderr ? `\n${stderr}` : ''}`)
  }

  return result.stdout.trim()
}

async function runCapturedCommand(command, args) {
  return runSpawn(command, args, { interactive: false })
}

function runSpawn(command, args, options) {
  return new Promise((resolve, reject) => {
    const stdio = options.interactive ? 'inherit' : ['ignore', 'pipe', 'pipe']
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio,
      env: process.env,
    })

    let stdout = ''
    let stderr = ''

    if (!options.interactive) {
      child.stdout?.on('data', chunk => stdout += chunk)
      child.stderr?.on('data', chunk => stderr += chunk)
    }

    const forwardSigint = () => child.kill('SIGINT')
    if (options.interactive) {
      process.once('SIGINT', forwardSigint)
    }

    child.once('error', (error) => {
      if (options.interactive) {
        process.removeListener('SIGINT', forwardSigint)
      }
      reject(error)
    })

    child.once('close', (code, signal) => {
      if (options.interactive) {
        process.removeListener('SIGINT', forwardSigint)
      }

      resolve({
        code,
        signal,
        stdout,
        stderr,
      })
    })
  })
}

function formatCommand(command, args) {
  return [command, ...args].join(' ')
}

function stopGracefully(message) {
  cancel(message)
  process.exit(0)
}

function fail(message) {
  cancel(message)
  process.exit(1)
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error))
})
