import process from 'node:process'
import { defineConfig } from 'vitepress'

const base = process.env.EASYINK_DOCS_BASE ?? '/'

export default defineConfig({
  base,
  title: 'EasyInk',
  description: 'EasyInk - Print is Easy',
  head: [
    ['link', { rel: 'icon', href: `${base}logo.ico` }],
  ],
  vite: {
    server: {
      port: 8533,
    },
  },

  themeConfig: {
    nav: [
      { text: '指南', link: '/guide/getting-started' },
      { text: 'Designer', link: '/designer/' },
      { text: 'Viewer', link: '/viewer/' },
      { text: 'Printing', link: '/printing/' },
      { text: '进阶', link: '/advanced/print-drivers' },
      { text: 'API', link: '/api/' },
      { text: '在线演示', link: 'https://hackycy.github.io/easyink' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: '指南',
          items: [
            { text: '快速上手', link: '/guide/getting-started' },
            { text: '核心概念', link: '/guide/concepts' },
            { text: '包概览', link: '/guide/packages' },
          ],
        },
      ],
      '/designer/': [
        {
          text: 'Designer',
          items: [
            { text: '概述', link: '/designer/' },
            { text: '键盘快捷键', link: '/designer/keyboard-shortcuts' },
            { text: '数据绑定', link: '/designer/data-binding' },
            { text: '自动保存', link: '/designer/auto-save' },
            { text: '字体管理', link: '/designer/fonts' },
            { text: '样式自定义', link: '/designer/styling' },
          ],
        },
      ],
      '/viewer/': [
        {
          text: 'Viewer',
          items: [
            { text: '概述', link: '/viewer/' },
            { text: 'Host 模式', link: '/viewer/viewer-hosts' },
            { text: '字体加载', link: '/viewer/fonts' },
            { text: '打印与导出', link: '/viewer/print-export' },
            { text: '诊断', link: '/viewer/diagnostics' },
          ],
        },
      ],
      '/printing/': [
        {
          text: 'Printing',
          items: [
            { text: '概述', link: '/printing/' },
          ],
        },
        {
          text: 'Electron HiPrint',
          items: [
            { text: '概述', link: '/hiprint/' },
            { text: '快速上手', link: '/hiprint/getting-started' },
          ],
        },
        {
          text: 'EasyInk Electron',
          items: [
            { text: '架构设计', link: '/electron/' },
          ],
        },
        {
          text: 'EasyInk Printer (.NET)',
          items: [
            { text: '概述', link: '/dotnet/' },
            { text: '快速上手', link: '/dotnet/getting-started' },
            { text: 'Engine DLL', link: '/dotnet/engine' },
            { text: 'Printer 应用', link: '/dotnet/printer' },
            { text: 'API 参考', link: '/dotnet/api-reference' },
          ],
        },
      ],
      '/hiprint/': [
        {
          text: 'Printing',
          items: [
            { text: '概述', link: '/printing/' },
          ],
        },
        {
          text: 'Electron HiPrint',
          items: [
            { text: '概述', link: '/hiprint/' },
            { text: '快速上手', link: '/hiprint/getting-started' },
          ],
        },
        {
          text: 'EasyInk Electron',
          items: [
            { text: '架构设计', link: '/electron/' },
          ],
        },
        {
          text: 'EasyInk Printer (.NET)',
          items: [
            { text: '概述', link: '/dotnet/' },
            { text: '快速上手', link: '/dotnet/getting-started' },
            { text: 'Engine DLL', link: '/dotnet/engine' },
            { text: 'Printer 应用', link: '/dotnet/printer' },
            { text: 'API 参考', link: '/dotnet/api-reference' },
          ],
        },
      ],
      '/dotnet/': [
        {
          text: 'Printing',
          items: [
            { text: '概述', link: '/printing/' },
          ],
        },
        {
          text: 'Electron HiPrint',
          items: [
            { text: '概述', link: '/hiprint/' },
            { text: '快速上手', link: '/hiprint/getting-started' },
          ],
        },
        {
          text: 'EasyInk Electron',
          items: [
            { text: '架构设计', link: '/electron/' },
          ],
        },
        {
          text: 'EasyInk Printer (.NET)',
          items: [
            { text: '概述', link: '/dotnet/' },
            { text: '快速上手', link: '/dotnet/getting-started' },
            { text: 'Engine DLL', link: '/dotnet/engine' },
            { text: 'Printer 应用', link: '/dotnet/printer' },
            { text: 'API 参考', link: '/dotnet/api-reference' },
          ],
        },
      ],
      '/electron/': [
        {
          text: 'Printing',
          items: [
            { text: '概述', link: '/printing/' },
          ],
        },
        {
          text: 'Electron HiPrint',
          items: [
            { text: '概述', link: '/hiprint/' },
            { text: '快速上手', link: '/hiprint/getting-started' },
          ],
        },
        {
          text: 'EasyInk Electron',
          items: [
            { text: '架构设计', link: '/electron/' },
          ],
        },
        {
          text: 'EasyInk Printer (.NET)',
          items: [
            { text: '概述', link: '/dotnet/' },
            { text: '快速上手', link: '/dotnet/getting-started' },
            { text: 'Engine DLL', link: '/dotnet/engine' },
            { text: 'Printer 应用', link: '/dotnet/printer' },
            { text: 'API 参考', link: '/dotnet/api-reference' },
          ],
        },
      ],
      '/advanced/': [
        {
          text: '进阶',
          items: [
            { text: '自定义物料开发', link: '/advanced/custom-materials' },
            { text: '贡献扩展开发', link: '/advanced/contributions' },
            { text: '自定义打印驱动', link: '/advanced/print-drivers' },
            { text: '自定义导出插件', link: '/advanced/exporters' },
            { text: 'MCP Server', link: '/advanced/mcp-server' },
            { text: 'Schema 参考', link: '/advanced/schema' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API',
          items: [
            { text: '索引', link: '/api/' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/hackycy/easyink' },
    ],
  },
})
