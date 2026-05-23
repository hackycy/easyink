import { copyFile, mkdir, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const syncTasks = [
  {
    name: 'brand-assets',
    sourceDir: '.github/logo',
    files: [
      {
        source: 'logo.png',
        targets: [
          { dir: 'docs/public' },
        ],
      },
      {
        source: 'logo.ico',
        targets: [
          { dir: 'docs/public' },
          { dir: 'lib/EasyInk.Net/EasyInk.Printer/src', name: 'app.ico' },
          { dir: 'playground/public', name: 'favicon.ico' },
        ],
      },
    ],
  },
]

async function syncFile(task, file) {
  const sourceDir = resolve(rootDir, task.sourceDir)
  const sourcePath = resolve(sourceDir, file.source)
  const sourceStats = await stat(sourcePath)

  if (!sourceStats.isFile())
    throw new Error(`Logo source is not a file: ${task.sourceDir}/${file.source}`)

  for (const target of file.targets) {
    const targetDir = resolve(rootDir, target.dir)
    await mkdir(targetDir, { recursive: true })
    const targetName = target.name ?? file.source
    const targetPath = resolve(targetDir, targetName)

    await copyFile(sourcePath, targetPath)
    console.log(`[sync-logos] ${task.sourceDir}/${file.source} -> ${target.dir}/${targetName}`)
  }
}

for (const task of syncTasks) {
  for (const file of task.files)
    await syncFile(task, file)
}
