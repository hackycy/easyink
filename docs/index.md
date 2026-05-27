---
layout: home
description: EasyInk - 面向开发者的模板设计与渲染框架，Schema 驱动，支持可视化设计、预览、打印与导出

hero:
  name: EasyInk
  text: Print is Easy
  tagline: 面向开发者的模板设计与渲染框架。Schema 驱动，Designer 与 Viewer 分离，打印、导出和扩展能力围绕同一份文档模型组织。
  image:
    src: /logo.png
    alt: EasyInk Logo
  actions:
    - theme: brand
      text: 快速上手
      link: /guide/getting-started
    - theme: alt
      text: 在线演示
      link: https://hackycy.github.io/easyink
    - theme: alt
      text: Designer
      link: /designer/
    - theme: alt
      text: Viewer
      link: /viewer/

features:
  - icon: D
    title: 设计器可直接嵌入
    details: 画布编辑、物料拖放、数据绑定、撤销重做和自动保存都以 Vue 组件形态提供。
  - icon: V
    title: 预览器独立运行
    details: Viewer 只依赖 Schema 和数据输入，可以单独承担渲染、分页、打印和导出。
  - icon: M
    title: 物料体系可扩展
    details: 自定义物料同时覆盖 Schema、Designer 和 Viewer 三层，而不是只改其中一层。
  - icon: C
    title: Contribution 扩展
    details: 宿主可以向 Designer 注入面板、工具栏动作、命令和诊断订阅，而不必修改设计器源码。
  - icon: S
    title: Schema 驱动
    details: 模板、预览、打印和导出围绕同一份文档模型工作，归一化和校验能力独立提供。
  - icon: P
    title: 打印与导出分层
    details: 打印驱动、导出插件和运行时解耦，可以按不同接入场景组合。
---

<HomeShowcase />

<div class="ei-stats-row">
  <div class="ei-stats-wrap">
    <div class="ei-stat">
      <span class="ei-stat-number">Designer</span>
      <span class="ei-stat-label">设计工作台</span>
    </div>
    <div class="ei-stat-divider"></div>
    <div class="ei-stat">
      <span class="ei-stat-number">Viewer</span>
      <span class="ei-stat-label">独立运行时</span>
    </div>
    <div class="ei-stat-divider"></div>
    <div class="ei-stat">
      <span class="ei-stat-number">Schema</span>
      <span class="ei-stat-label">统一文档模型</span>
    </div>
    <div class="ei-stat-divider"></div>
    <div class="ei-stat">
      <span class="ei-stat-number">Print</span>
      <span class="ei-stat-label">打印与导出链路</span>
    </div>
  </div>
</div>

<div class="ei-section">
  <h2 class="ei-section-title">核心分层</h2>
  <p class="ei-section-desc">从宿主应用到基础模型，能力按职责拆分，而不是堆在一个大组件里。</p>

  <div class="ei-arch-layers">
    <div class="ei-arch-layer ei-arch-layer--l0">
      <span class="ei-arch-layer-name">宿主应用</span>
      <div class="ei-arch-layer-pkgs">
        <code>host-app</code>
      </div>
    </div>
    <div class="ei-arch-arrow">▼</div>
    <div class="ei-arch-layer ei-arch-layer--l1">
      <span class="ei-arch-layer-name">设计器 / 预览器</span>
      <div class="ei-arch-layer-pkgs">
        <code>@easyink/designer</code>
        <code>@easyink/viewer</code>
        <code>@easyink/builtin</code>
      </div>
    </div>
    <div class="ei-arch-arrow">▼</div>
    <div class="ei-arch-layer ei-arch-layer--l2">
      <span class="ei-arch-layer-name">核心能力</span>
      <div class="ei-arch-layer-pkgs">
        <code>@easyink/core</code>
        <code>@easyink/datasource</code>
        <code>@easyink/export-runtime</code>
        <code>@easyink/ui</code>
      </div>
    </div>
    <div class="ei-arch-arrow">▼</div>
    <div class="ei-arch-layer ei-arch-layer--l3">
      <span class="ei-arch-layer-name">基础模型</span>
      <div class="ei-arch-layer-pkgs">
        <code>@easyink/schema</code>
        <code>@easyink/material-*</code>
        <code>@easyink/shared</code>
        <code>@easyink/icons</code>
      </div>
    </div>
  </div>
</div>

<div class="ei-section ei-section--from-right">
  <h2 class="ei-section-title">工程基础</h2>
  <p class="ei-section-desc">当前仓库围绕 Vue、TypeScript 和 pnpm workspace 组织，文档、运行时和扩展层可以独立演进。</p>

  <div class="ei-marquee" aria-label="技术栈">
    <div class="ei-marquee-track">
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>Vue 3 Composition API</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>TypeScript Strict</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>pnpm Monorepo</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>tsdown Build</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>Vitest Unit Tests</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>Playwright E2E</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>CSS Variables Theme</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>ESLint Linting</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>Vue 3 Composition API</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>TypeScript Strict</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>pnpm Monorepo</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>tsdown Build</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>Vitest Unit Tests</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>Playwright E2E</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>CSS Variables Theme</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>ESLint Linting</span>
    </div>
  </div>
</div>

<div class="ei-section ei-section--from-left">
  <h2 class="ei-section-title">主要包</h2>
  <p class="ei-section-desc">如果你第一次接入，通常先区分自己需要的是 Designer、Viewer 还是打印集成。</p>

  <div class="ei-eco-grid">
    <div class="ei-eco-card">
      <div class="ei-eco-card-name">@easyink/designer</div>
      <div class="ei-eco-card-desc">完整的设计工作台组件，负责模板编辑、数据绑定和工作台交互。</div>
    </div>
    <div class="ei-eco-card">
      <div class="ei-eco-card-name">@easyink/viewer</div>
      <div class="ei-eco-card-desc">独立的渲染运行时，负责预览、分页、打印入口和导出入口。</div>
    </div>
    <div class="ei-eco-card">
      <div class="ei-eco-card-name">@easyink/ai</div>
      <div class="ei-eco-card-desc">浏览器侧 AI 能力入口，围绕模板生成和交互扩展组织。</div>
    </div>
    <div class="ei-eco-card">
      <div class="ei-eco-card-name">@easyink/mcp-server</div>
      <div class="ei-eco-card-desc">独立 MCP 服务，用于生成 Schema 和数据源描述，不是 Designer 运行时依赖。</div>
    </div>
    <div class="ei-eco-card">
      <div class="ei-eco-card-name">@easyink/schema</div>
      <div class="ei-eco-card-desc">文档模型、默认值、校验和编解码能力所在的基础包。</div>
    </div>
    <div class="ei-eco-card">
      <div class="ei-eco-card-name">@easyink/schema-tools</div>
      <div class="ei-eco-card-desc">Schema 构建和数据源对齐工具，更适合自动生成或批处理链路。</div>
    </div>
    <div class="ei-eco-card">
      <div class="ei-eco-card-name">@easyink/core</div>
      <div class="ei-eco-card-desc">Designer 和 Viewer 共用的核心契约与底层能力。</div>
    </div>
    <div class="ei-eco-card">
      <div class="ei-eco-card-name">@easyink/datasource</div>
      <div class="ei-eco-card-desc">数据源描述、字段树和绑定相关能力所在的基础包。</div>
    </div>
  </div>
</div>

<div class="ei-section ei-section--last">
  <h2 class="ei-section-title">三类状态</h2>
  <p class="ei-section-desc">模板、工作台和运行时状态分开管理，是 EasyInk 设计里非常重要的一条边界。</p>

  <div class="ei-eco-grid ei-state-grid">
    <div class="ei-eco-card">
      <div class="ei-eco-card-name ei-state-name--template">模板状态</div>
      <div class="ei-eco-card-desc">存储在 Schema 中，支持撤销重做，可持久化、可导入导出。页面、元素、绑定、分页配置均属此类。</div>
    </div>
    <div class="ei-eco-card">
      <div class="ei-eco-card-name ei-state-name--workbench">工作台状态</div>
      <div class="ei-eco-card-desc">窗口布局、缩放参数、面板开关。用户偏好，静默持久化，不进入 Schema，不影响撤销重做。</div>
    </div>
    <div class="ei-eco-card">
      <div class="ei-eco-card-name ei-state-name--runtime">运行时状态</div>
      <div class="ei-eco-card-desc">Viewer 当前页、缩略图缓存、字体加载、打印任务。生命周期短，不持久化，随 Viewer 实例销毁。</div>
    </div>
  </div>
</div>
