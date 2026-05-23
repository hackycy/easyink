import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { deflateSync, inflateSync } from 'node:zlib'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const run = promisify(execFile)
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

const syncTasks = [
  {
    name: 'brand-assets',
    sourceDir: '.github/logo',
    files: [
      {
        source: 'logo.png',
        targets: [{ dir: 'docs/public' }],
      },
      {
        source: 'logo.ico',
        targets: [
          { dir: 'docs/public' },
          { dir: 'lib/EasyInk.Net/EasyInk.Printer/src', name: 'app.ico' },
          { dir: 'lib/EasyInk.Electron/build', name: 'icon.ico' },
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

async function generateElectronIcons() {
  const sourcePath = resolve(rootDir, '.github/logo/logo.png')
  const source = decodePng(await readFile(sourcePath))
  const square = cropCenterSquare(source)
  const appIcon = resizePng(square, 512)
  const trayIcon = resizePng(makeLightBackgroundTransparent(square), 18)

  await writePng('lib/EasyInk.Electron/resources/icon.png', appIcon)
  await writePng('lib/EasyInk.Electron/build/icon.png', appIcon)
  await writePng('lib/EasyInk.Electron/resources/tray-icon.png', trayIcon)

  if (process.platform === 'darwin') {
    await generateElectronIcns(square)
  }
  else {
    console.log('[sync-logos] skipped Electron icon.icns generation: requires macOS iconutil')
  }
}

async function writePng(relativePath, image) {
  const outputPath = resolve(rootDir, relativePath)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, encodePng(image))
  console.log(`[sync-logos] .github/logo/logo.png -> ${relativePath}`)
}

async function generateElectronIcns(square) {
  const workDir = await mkdtemp(resolve(tmpdir(), 'easyink-icon-'))
  const iconsetDir = resolve(workDir, 'icon.iconset')
  const outputPath = resolve(rootDir, 'lib/EasyInk.Electron/build/icon.icns')

  try {
    await mkdir(iconsetDir, { recursive: true })
    for (const [pixels, name] of [
      [16, 'icon_16x16.png'],
      [32, 'icon_16x16@2x.png'],
      [32, 'icon_32x32.png'],
      [64, 'icon_32x32@2x.png'],
      [128, 'icon_128x128.png'],
      [256, 'icon_128x128@2x.png'],
      [256, 'icon_256x256.png'],
      [512, 'icon_256x256@2x.png'],
      [512, 'icon_512x512.png'],
      [1024, 'icon_512x512@2x.png'],
    ]) {
      await writeFile(resolve(iconsetDir, name), encodePng(resizePng(square, pixels)))
    }

    await run('iconutil', ['-c', 'icns', iconsetDir, '-o', outputPath])
    console.log('[sync-logos] .github/logo/logo.png -> lib/EasyInk.Electron/build/icon.icns')
  }
  finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(pngSignature)) {
    throw new Error('Unsupported PNG: invalid signature')
  }

  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idat = []

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii')
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    offset += 12 + length

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      if (data[12] !== 0) {
        throw new Error('Unsupported PNG: interlaced images are not supported')
      }
    }
    else if (type === 'IDAT') {
      idat.push(data)
    }
    else if (type === 'IEND') {
      break
    }
  }

  if (bitDepth !== 8) {
    throw new Error(`Unsupported PNG bit depth: ${bitDepth}`)
  }

  const channels = getChannelCount(colorType)
  const bytesPerPixel = channels
  const stride = width * channels
  const inflated = inflateSync(Buffer.concat(idat))
  const raw = Buffer.alloc(width * height * channels)
  let sourceOffset = 0
  let targetOffset = 0
  let previous = Buffer.alloc(stride)

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset]
    sourceOffset += 1
    const row = Buffer.from(inflated.subarray(sourceOffset, sourceOffset + stride))
    sourceOffset += stride
    unfilter(row, previous, filter, bytesPerPixel)
    row.copy(raw, targetOffset)
    targetOffset += stride
    previous = row
  }

  return {
    width,
    height,
    data: toRgba(raw, colorType),
  }
}

function encodePng(image) {
  const chunks = []
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(image.width, 0)
  ihdr.writeUInt32BE(image.height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  chunks.push(createPngChunk('IHDR', ihdr))

  const stride = image.width * 4
  const raw = Buffer.alloc((stride + 1) * image.height)
  for (let y = 0; y < image.height; y += 1) {
    const sourceStart = y * stride
    const targetStart = y * (stride + 1)
    raw[targetStart] = 0
    image.data.copy(raw, targetStart + 1, sourceStart, sourceStart + stride)
  }
  chunks.push(createPngChunk('IDAT', deflateSync(raw)))
  chunks.push(createPngChunk('IEND', Buffer.alloc(0)))
  return Buffer.concat([pngSignature, ...chunks])
}

function createPngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const chunk = Buffer.alloc(12 + data.length)
  chunk.writeUInt32BE(data.length, 0)
  typeBuffer.copy(chunk, 4)
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length)
  return chunk
}

function getChannelCount(colorType) {
  if (colorType === 0)
    return 1
  if (colorType === 2)
    return 3
  if (colorType === 4)
    return 2
  if (colorType === 6)
    return 4
  throw new Error(`Unsupported PNG color type: ${colorType}`)
}

function toRgba(raw, colorType) {
  const channels = getChannelCount(colorType)
  const pixels = raw.length / channels
  const rgba = Buffer.alloc(pixels * 4)
  for (let index = 0; index < pixels; index += 1) {
    const source = index * channels
    const target = index * 4
    if (colorType === 0) {
      const value = raw[source]
      rgba[target] = value
      rgba[target + 1] = value
      rgba[target + 2] = value
      rgba[target + 3] = 255
    }
    else if (colorType === 2) {
      rgba[target] = raw[source]
      rgba[target + 1] = raw[source + 1]
      rgba[target + 2] = raw[source + 2]
      rgba[target + 3] = 255
    }
    else if (colorType === 4) {
      const value = raw[source]
      rgba[target] = value
      rgba[target + 1] = value
      rgba[target + 2] = value
      rgba[target + 3] = raw[source + 1]
    }
    else {
      rgba[target] = raw[source]
      rgba[target + 1] = raw[source + 1]
      rgba[target + 2] = raw[source + 2]
      rgba[target + 3] = raw[source + 3]
    }
  }
  return rgba
}

function unfilter(row, previous, filter, bytesPerPixel) {
  for (let index = 0; index < row.length; index += 1) {
    const left = index >= bytesPerPixel ? row[index - bytesPerPixel] : 0
    const up = previous[index] ?? 0
    const upperLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0
    if (filter === 1) {
      row[index] = (row[index] + left) & 0xFF
    }
    else if (filter === 2) {
      row[index] = (row[index] + up) & 0xFF
    }
    else if (filter === 3) {
      row[index] = (row[index] + Math.floor((left + up) / 2)) & 0xFF
    }
    else if (filter === 4) {
      row[index] = (row[index] + paeth(left, up, upperLeft)) & 0xFF
    }
    else if (filter !== 0) {
      throw new Error(`Unsupported PNG filter: ${filter}`)
    }
  }
}

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft
  const leftDistance = Math.abs(estimate - left)
  const upDistance = Math.abs(estimate - up)
  const upperLeftDistance = Math.abs(estimate - upperLeft)
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance)
    return left
  if (upDistance <= upperLeftDistance)
    return up
  return upperLeft
}

function cropCenterSquare(image) {
  const size = Math.min(image.width, image.height)
  const startX = Math.floor((image.width - size) / 2)
  const startY = Math.floor((image.height - size) / 2)
  const data = Buffer.alloc(size * size * 4)

  for (let y = 0; y < size; y += 1) {
    const sourceStart = ((startY + y) * image.width + startX) * 4
    const targetStart = y * size * 4
    image.data.copy(data, targetStart, sourceStart, sourceStart + size * 4)
  }
  return { width: size, height: size, data }
}

function resizePng(image, size) {
  const data = Buffer.alloc(size * size * 4)
  const xRatio = image.width / size
  const yRatio = image.height / size

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sourceX = Math.min(image.width - 1, Math.floor((x + 0.5) * xRatio))
      const sourceY = Math.min(image.height - 1, Math.floor((y + 0.5) * yRatio))
      const source = (sourceY * image.width + sourceX) * 4
      const target = (y * size + x) * 4
      data[target] = image.data[source]
      data[target + 1] = image.data[source + 1]
      data[target + 2] = image.data[source + 2]
      data[target + 3] = image.data[source + 3]
    }
  }
  return { width: size, height: size, data }
}

function makeLightBackgroundTransparent(image) {
  const data = Buffer.from(image.data)
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index]
    const green = data[index + 1]
    const blue = data[index + 2]
    const alpha = data[index + 3]
    const max = Math.max(red, green, blue)
    const min = Math.min(red, green, blue)
    if (alpha > 0 && min > 218 && max - min < 32) {
      data[index + 3] = 0
    }
  }
  return { width: image.width, height: image.height, data }
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

function crc32(buffer) {
  let crc = 0xFFFFFFFF
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xFF] ^ (crc >>> 8)
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

for (const task of syncTasks) {
  for (const file of task.files) await syncFile(task, file)
}

await generateElectronIcons()
