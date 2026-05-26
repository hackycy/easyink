<p align="center">
	<img src=".github/logo/logo.png" width="160" alt="EasyInk logo" />
</p>

<h1 align="center">EasyInk</h1>

<p align="center">
	Print is Easy.
</p>

<p align="center">
	Build print templates, preview output, and integrate printing workflows with a modern toolkit.
</p>

<p align="center">
	<a href="https://hackycy.github.io/easyink/docs/"><strong>Documentation</strong></a>
	·
	<a href="https://hackycy.github.io/easyink"><strong>Preview</strong></a>
	·
	<a href="#development"><strong>Development</strong></a>
</p>

<p align="center">
	<a href="https://github.com/hackycy/easyink/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/hackycy/easyink.svg?style=flat&colorA=080f12&colorB=1fa669" /></a>
	<a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-Ready-3178C6?style=flat&logo=typescript&logoColor=white" /></a>
	<a href="https://vuejs.org/"><img alt="Vue 3" src="https://img.shields.io/badge/Vue-3-42B883?style=flat&logo=vuedotjs&logoColor=white" /></a>
	<a href="https://pnpm.io/"><img alt="pnpm workspace" src="https://img.shields.io/badge/pnpm-workspace-F69220?style=flat&logo=pnpm&logoColor=white" /></a>
	<a href="https://turbo.build/repo"><img alt="Turborepo" src="https://img.shields.io/badge/Turborepo-Monorepo-EF4444?style=flat&logo=turborepo&logoColor=white" /></a>
</p>

<p align="center">
	<img width="1920" height="1080" alt="EasyInk playground" src="https://github.com/user-attachments/assets/0884ea3c-3b13-4630-801b-4b0b8a26babe" />
</p>

## Overview

EasyInk provides a package-based print design ecosystem for building templates, rendering documents, previewing output, and connecting to runtime or printer integrations.

## Packages

| Package | Purpose | Version | Downloads |
| --- | --- | --- | --- |
| [@easyink/designer](packages/designer) | Template designer and editing experience | [![npm][designer-npm-version-src]][designer-npm-version-href] | [![npm downloads][designer-npm-downloads-src]][designer-npm-version-href] |
| [@easyink/viewer](packages/viewer) | Viewer and print preview runtime | [![npm][viewer-npm-version-src]][viewer-npm-version-href] | [![npm downloads][viewer-npm-downloads-src]][viewer-npm-version-href] |
| [@easyink/mcp-server](packages/mcp-server) | MCP server for AI-assisted print workflows | [![npm][mcp-server-npm-version-src]][mcp-server-npm-version-href] | [![npm downloads][mcp-server-npm-downloads-src]][mcp-server-npm-version-href] |

## Documentation

- [Documentation site](https://hackycy.github.io/easyink/docs/)
- [Online preview](https://hackycy.github.io/easyink)
- [Package guide](docs/guide/packages.md)

## Development

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm build

# playground
pnpm play
```

## License

[MIT](./LICENSE)

[designer-npm-version-src]: https://img.shields.io/npm/v/@easyink/designer?style=flat&colorA=080f12&colorB=1fa669
[designer-npm-downloads-src]: https://img.shields.io/npm/dm/@easyink/designer?style=flat&colorA=080f12&colorB=1fa669
[designer-npm-version-href]: https://npmjs.com/package/@easyink/designer
[mcp-server-npm-version-src]: https://img.shields.io/npm/v/@easyink/mcp-server?style=flat&colorA=080f12&colorB=1fa669
[mcp-server-npm-downloads-src]: https://img.shields.io/npm/dm/@easyink/mcp-server?style=flat&colorA=080f12&colorB=1fa669
[mcp-server-npm-version-href]: https://npmjs.com/package/@easyink/mcp-server
[viewer-npm-version-src]: https://img.shields.io/npm/v/@easyink/viewer?style=flat&colorA=080f12&colorB=1fa669
[viewer-npm-downloads-src]: https://img.shields.io/npm/dm/@easyink/viewer?style=flat&colorA=080f12&colorB=1fa669
[viewer-npm-version-href]: https://npmjs.com/package/@easyink/viewer
