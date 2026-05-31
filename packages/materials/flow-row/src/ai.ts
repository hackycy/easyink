import type { AIMaterialDescriptor } from '@easyink/shared'
import { FLOW_ROW_TYPE } from './schema'

export const flowRowAIMaterialDescriptor = {
  type: FLOW_ROW_TYPE,
  description: 'Receipt/detail row with mixed block and inline columns. Block columns take a full line; inline columns share a line by ratio, horizontal/vertical padding, and per-column alignment.',
  properties: ['columns', 'gap', 'paddingX', 'paddingY', 'typography', 'backgroundColor', 'binding'],
  requiredProps: ['columns', 'gap', 'typography'],
  binding: 'multi',
  usage: [
    'Use flow-row for receipt item details where a long name should occupy its own line and numeric columns should continue on the next inline row.',
    'Use node.binding for an optional collection path, and put field bindings on props.columns[].binding.',
    'Use wrapMode = block for a full-width column and wrapMode = inline for ratio-based columns.',
  ],
  schemaRules: [
    'Element type must be flow-row.',
    'props.columns must be a non-empty array of { ratio, textAlign, verticalAlign?, wrapMode, content?, binding? }.',
    'Use props.paddingX and props.paddingY for horizontal and vertical cell content inset; legacy props.padding is read as both values.',
    'Column bindings may be absolute collection paths such as items/name; node.binding may point to items.',
    'Do not encode header/footer/table topology in flow-row; use table-data for table semantics.',
  ],
  knowledge: {
    category: 'data',
    composability: {
      canBeChildOf: ['*'],
      canContain: [],
      exclusiveWith: [],
      preferredCompanions: ['line', 'text'],
    },
    bindingSpec: {
      mode: 'collection',
      accepts: { types: ['array'], isArray: true, minChildren: 1 },
      produces: { kind: 'collection-repeat', fieldCount: 'dynamic', pathPattern: '{collection}/{field}' },
      examples: [
        { scenario: 'receipt item', binding: { sourceId: 'receipt', fieldPath: 'items' }, fieldStructure: { items: [{ name: 'string', qty: 'number', amount: 'number' }] } },
      ],
    },
    sizing: { minWidth: 20, minHeight: 8, growAxis: 'y', defaultSize: { width: 72, height: 10 } },
    fitness: [
      { scenario: 'receipt-items', score: 0.95, reason: 'optimized for narrow receipt with mixed-width columns' },
      { scenario: 'invoice-items', score: 0.5, reason: 'works but table-data is better for wide documents' },
      { scenario: 'h5-landing', score: 0.6, reason: 'narrow list layout for mobile product cards' },
    ],
  },
} satisfies AIMaterialDescriptor
