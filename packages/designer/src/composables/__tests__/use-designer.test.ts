import { SCHEMA_VERSION } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, render } from 'vue'
import { useDesigner } from '../use-designer'

describe('useDesigner', () => {
  it('initializes engine data from options', () => {
    const data = {
      companyName: 'ACME 科技有限公司',
      orderItems: [{ itemName: '耳机', itemQty: 2 }],
    }

    let designer: ReturnType<typeof useDesigner>
    const container = document.createElement('div')

    const Host = defineComponent({
      setup() {
        designer = useDesigner({
          data,
          schema: {
            materials: [],
            meta: { name: 'test' },
            page: {
              margins: { bottom: 10, left: 10, right: 10, top: 10 },
              orientation: 'portrait',
              paper: 'A4',
              unit: 'mm',
            },
            version: SCHEMA_VERSION,
          },
        })

        return () => h('div')
      },
    })

    render(h(Host), container)

    expect(designer!.engine.getData()).toEqual(data)

    render(null, container)
  })
})
