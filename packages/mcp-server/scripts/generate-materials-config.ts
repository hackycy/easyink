import type { AIMaterialDescriptor } from '@easyink/shared'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { barcodeAIMaterialDescriptor } from '../../materials/barcode/src/ai'
import { chartAIMaterialDescriptor } from '../../materials/chart/src/ai'
import { containerAIMaterialDescriptor } from '../../materials/container/src/ai'
import { ellipseAIMaterialDescriptor } from '../../materials/ellipse/src/ai'
import { imageAIMaterialDescriptor } from '../../materials/image/src/ai'
import { lineAIMaterialDescriptor } from '../../materials/line/src/ai'
import { pageNumberAIMaterialDescriptor } from '../../materials/page-number/src/ai'
import { qrcodeAIMaterialDescriptor } from '../../materials/qrcode/src/ai'
import { rectAIMaterialDescriptor } from '../../materials/rect/src/ai'
import { svgAIMaterialDescriptor } from '../../materials/svg/src/ai'
import { tableDataAIMaterialDescriptor } from '../../materials/table-data/src/ai'
import { tableStaticAIMaterialDescriptor } from '../../materials/table-static/src/ai'
import { textAIMaterialDescriptor } from '../../materials/text/src/ai'

const descriptors: AIMaterialDescriptor[] = [
  textAIMaterialDescriptor,
  lineAIMaterialDescriptor,
  tableDataAIMaterialDescriptor,
  tableStaticAIMaterialDescriptor,
  imageAIMaterialDescriptor,
  qrcodeAIMaterialDescriptor,
  barcodeAIMaterialDescriptor,
  rectAIMaterialDescriptor,
  ellipseAIMaterialDescriptor,
  containerAIMaterialDescriptor,
  pageNumberAIMaterialDescriptor,
  svgAIMaterialDescriptor,
  chartAIMaterialDescriptor,
]

const config = {
  version: '1.0.0',
  schemaVersion: '1.0.0',
  generatedFrom: 'packages/materials/*/src/ai.ts',
  pageDefaults: {
    mode: 'fixed',
    width: 210,
    height: 297,
    unit: 'mm',
  },
  materialAliases: {
    'table': 'table-data',
    'richText': 'text',
    'rich-text': 'text',
    'tableData': 'table-data',
    'tableStatic': 'table-static',
    'pageNumber': 'page-number',
    'qr': 'qrcode',
    'qrCode': 'qrcode',
    'qr-code': 'qrcode',
  },
  generationRules: {
    fieldNaming: 'Use English camelCase field paths and Chinese fieldLabel/title for Chinese prompts.',
    sampleData: 'expectedDataSource.sampleData is required and must match the generated fields.',
    pageInference: 'Use deterministic domain profiles supplied by the client/server plan; do not default receipts or labels to A4.',
    tableData: 'Array/detail-list fields must use table-data with table.topology rows/cells, not legacy props.columns or repeatTemplate.',
  },
  materialTypes: Object.fromEntries(
    descriptors.map(descriptor => [descriptor.type, {
      description: descriptor.description,
      properties: descriptor.properties,
      requiredProps: descriptor.requiredProps ?? [],
      binding: descriptor.binding ?? 'none',
      usage: descriptor.usage ?? [],
      schemaRules: descriptor.schemaRules ?? [],
      examples: descriptor.examples ?? [],
    }]),
  ),
  bindingRules: {
    fieldPathFormat: 'Slash-separated path from data source root, for example items/name or store/address.',
    sourceIdFormat: 'References a DataSourceDescriptor id. Use one stable generated sourceId consistently in schema bindings.',
    bindingTypes: [
      { type: 'binding', description: 'Standard element or table-data repeat-template cell binding.', fields: ['sourceId', 'sourceName', 'sourceTag', 'fieldPath', 'fieldLabel'] },
      { type: 'staticBinding', description: 'table-static cell binding for fixed independent scalar values.', fields: ['sourceId', 'sourceName', 'fieldPath', 'fieldLabel'] },
    ],
    tableRules: {
      repeatTemplateBinding: 'table-data repeat-template cells use binding. Header cells use content.text. All repeat-template cell paths should share the same array prefix, such as items/*.',
      staticBindingUsage: 'table-static cells use staticBinding only when a fixed cell needs data. Do not put staticBinding on normal text elements.',
    },
  },
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const configPath = resolve(scriptDir, '../config/materials.json')
const next = `${JSON.stringify(config, null, 2)}\n`

if (process.argv.includes('--check')) {
  const current = readFileSync(configPath, 'utf-8')
  if (current !== next) {
    console.error('materials.json is out of date. Run pnpm -F @easyink/mcp-server build:materials.')
    process.exitCode = 1
  }
}
else {
  writeFileSync(configPath, next)
  console.log(`Generated ${configPath}`)
}
