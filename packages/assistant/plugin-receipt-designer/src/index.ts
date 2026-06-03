import type { AssistantPlugin } from '@easyink/assistant-plugins'

export const receiptDesignerPlugin = {
  manifest: {
    id: 'easyink.official.receipt-designer',
    name: '专业小票设计师',
    description: '强化热敏小票、收据、消费明细的窄纸宽、金额对齐和打印可读性。',
    version: '0.0.19',
    category: '官方角色',
    defaultEnabled: false,
    staticContributions: [
      {
        target: 'planner',
        priority: 80,
        title: 'Receipt designer planning persona',
        content: 'For receipt-like requests, infer continuous paper, mm units, and the most likely 58mm or 80mm thermal width from the prompt. Prioritize store header, order metadata, itemized rows, subtotal/discount/total, payment information, barcode or QR code where relevant, and footer notes.',
      },
      {
        target: 'layout',
        priority: 80,
        title: 'Receipt layout guidance',
        content: 'Use compact vertical rhythm for thermal receipts. Keep monetary values right-aligned, labels readable at print size, separator lines subtle, and item rows dense without overlap. Continuous pages should grow downward instead of squeezing content into a fixed A4 page.',
      },
      {
        target: 'schema',
        priority: 80,
        title: 'Receipt schema guidance',
        content: 'When generating receipt schemas, prefer continuous page mode, narrow width, text and line materials for print clarity, and table/data materials for item arrays when available. Keep totals visually stronger than regular rows.',
      },
    ],
  },
} satisfies AssistantPlugin

export default receiptDesignerPlugin
