import { readFileSync, writeFileSync } from 'node:fs'
import { defineConfig } from 'tsdown'

const { generateCollectionEntry } = await import(new URL('./src/collection-source.ts', import.meta.url).href)

for (const set of ['all', 'basic'] as const) {
  for (const host of ['designer', 'viewer'] as const) {
    const path = new URL(`./src/${set}/${host}.ts`, import.meta.url)
    const source = generateCollectionEntry(set, host)
    if (readFileSync(path, 'utf8') !== source)
      writeFileSync(path, source)
  }
}

export default defineConfig({
  entry: {
    'all/viewer': 'src/all/viewer.ts',
    'basic/viewer': 'src/basic/viewer.ts',
    'all/designer': 'src/all/designer.ts',
    'basic/designer': 'src/basic/designer.ts',
    'index': 'src/designer-entry.ts',
    'all': 'src/all-entry.ts',
    'basic': 'src/basic-entry.ts',
    'none': 'src/none.ts',
  },
  format: ['esm'],
  clean: true,
  dts: true,
  external: [
    /^@easyink\//,
  ],
})
