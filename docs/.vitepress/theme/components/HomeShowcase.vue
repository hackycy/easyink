<script setup lang="ts">
import { withBase } from 'vitepress'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const stages = [
  {
    id: 'designer',
    index: '01',
    title: 'Designer',
    label: '设计态',
    detail: '你在这里拖入物料、调整样式，并把字段绑定到模板元素上。',
  },
  {
    id: 'schema',
    index: '02',
    title: 'Schema',
    label: '文档模型',
    detail: '我们把模板保存成可校验的数据，这样预览和打印可以复用同一份结构。',
  },
  {
    id: 'viewer',
    index: '03',
    title: 'Viewer',
    label: '运行态',
    detail: '你把 Schema 和业务数据交给 Viewer，就能做预览、分页、导出和打印。',
  },
  {
    id: 'printer',
    index: '04',
    title: 'Printer',
    label: '输出层',
    detail: '如果你需要本地打印，可以继续接入 LODOP、HiPrint 或 .NET Printer。',
  },
]

const packageGroups = [
  {
    title: '让用户编辑模板',
    packages: ['@easyink/designer', '@easyink/builtin', '@easyink/ui'],
    text: '从 Designer 开始。你会接到画布、物料、属性面板、扩展入口和自动保存。',
  },
  {
    title: '渲染已有模板',
    packages: ['@easyink/viewer', '@easyink/core', '@easyink/export-runtime'],
    text: '从 Viewer 开始。你传入 Schema 和业务数据，它负责预览、分页、字体、导出和打印入口。',
  },
  {
    title: '处理 Schema 和数据',
    packages: ['@easyink/schema', '@easyink/schema-tools', '@easyink/datasource'],
    text: '如果你要生成、校验或批量处理模板，先看这些包。它们提供模型、数据源和字段树工具。',
  },
]

const paths = [
  { title: '把设计器放进你的页面', href: '/designer/', meta: '装组件、接扩展、保存模板' },
  { title: '用 Schema 渲染预览', href: '/viewer/', meta: '传 Schema 和 data，拿预览或导出' },
  { title: '选择一种打印方式', href: '/printing/', meta: '浏览器、EasyInk Printer、HiPrint、LODOP' },
  { title: '做一个自己的物料', href: '/advanced/custom-materials', meta: '定义节点，同时接 Designer 和 Viewer' },
]

const states = [
  {
    title: '模板状态',
    tone: 'blue',
    body: '页面、元素、样式、绑定和分页设置都会进入 Schema。你可以保存它，也可以把它放进撤销重做。',
  },
  {
    title: '工作台状态',
    tone: 'teal',
    body: '布局、缩放、面板开关和用户偏好只属于 Designer。我们不把这些内容写进模板。',
  },
  {
    title: '运行时状态',
    tone: 'amber',
    body: '当前页、字体加载、缩略图和打印任务只在 Viewer 运行时存在。实例销毁后，这些状态也会释放。',
  },
]

const activeStage = ref(0)
const activeStageData = computed(() => stages[activeStage.value])

let timer: number | undefined
let gsapContext: { revert: () => void } | undefined
let stagePulse: { kill: () => void } | undefined
let mouseMoveHandler: ((event: MouseEvent) => void) | undefined
let reduceMotion = false

async function setupGsapMotion(): Promise<void> {
  if (typeof window === 'undefined')
    return

  reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduceMotion)
    return

  const root = document.querySelector<HTMLElement>('.ei-home-shell')
  if (!root)
    return

  const [{ gsap }, { ScrollTrigger }] = await Promise.all([
    import('gsap'),
    import('gsap/ScrollTrigger'),
  ])

  gsap.registerPlugin(ScrollTrigger)
  root.classList.add('ei-gsap-ready')

  gsapContext = gsap.context(() => {
    const heroTimeline = gsap.timeline({ defaults: { ease: 'power3.out' } })
    heroTimeline
      .fromTo('.ei-brand-line', { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.45 })
      .fromTo('.ei-hero-copy h1 span', {
        autoAlpha: 0,
        x: -34,
        skewX: -5,
      }, {
        autoAlpha: 1,
        x: 0,
        skewX: 0,
        duration: 0.68,
        stagger: 0.09,
      }, '-=0.16')
      .fromTo('.ei-hero-copy p', { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.48 }, '-=0.22')
      .fromTo('.ei-action', { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.38, stagger: 0.06 }, '-=0.16')
      .fromTo('.ei-hero-notes span', { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.36, stagger: 0.05 }, '-=0.18')
      .fromTo('.ei-workbench', {
        autoAlpha: 0,
        x: 72,
        rotateY: -12,
        rotateX: 5,
        scale: 0.96,
      }, {
        autoAlpha: 1,
        x: 0,
        rotateY: -4,
        rotateX: 2,
        scale: 1,
        duration: 0.85,
      }, '-=0.74')
      .fromTo('.ei-page', { autoAlpha: 0, y: 42, rotate: -2 }, { autoAlpha: 1, y: 0, rotate: 0, duration: 0.64 }, '-=0.42')
      .fromTo('.ei-binding-chip', { autoAlpha: 0, scale: 0.72 }, { autoAlpha: 1, scale: 1, duration: 0.36, stagger: 0.08 }, '-=0.24')

    gsap.to('.ei-workbench', {
      y: -10,
      duration: 3.2,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    })

    gsap.to('.ei-page', {
      '--ei-page-scan': '92%',
      'duration': 2.8,
      'repeat': -1,
      'yoyo': true,
      'ease': 'sine.inOut',
    })

    gsap.to('.ei-hero-field', {
      backgroundPosition: '80px 44px',
      duration: 18,
      repeat: -1,
      ease: 'none',
    })

    gsap.utils.toArray<HTMLElement>('.ei-section').forEach((section) => {
      gsap.from(section.querySelectorAll('.ei-section-kicker, .ei-section-title, .ei-section-desc'), {
        y: 24,
        duration: 0.55,
        stagger: 0.08,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: section,
          start: 'top 76%',
        },
      })
    })

    gsap.from('.ei-flow-step', {
      y: 42,
      rotateX: -18,
      transformOrigin: '50% 100%',
      duration: 0.62,
      stagger: 0.08,
      ease: 'back.out(1.25)',
      scrollTrigger: {
        trigger: '.ei-flow-rail',
        start: 'top 78%',
      },
    })

    gsap.from('.ei-arch-band', {
      x: 64,
      duration: 0.56,
      stagger: 0.09,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: '.ei-architecture-map',
        start: 'top 78%',
      },
    })

    const revealGroups = [
      ['.ei-package-grid', '.ei-package-card'],
      ['.ei-path-list', '.ei-path-item'],
      ['.ei-state-grid', '.ei-state-card'],
    ]

    revealGroups.forEach(([trigger, items]) => {
      gsap.from(items, {
        y: 36,
        duration: 0.56,
        stagger: 0.07,
        ease: 'power3.out',
        scrollTrigger: {
          trigger,
          start: 'top 78%',
        },
      })
    })

    gsap.to(root, {
      '--ei-scroll-shift': '220px',
      'ease': 'none',
      'scrollTrigger': {
        trigger: root,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.45,
      },
    })
  }, root)

  mouseMoveHandler = (event: MouseEvent) => {
    const rect = root.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width - 0.5
    const y = (event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5
    gsap.to(root, {
      '--ei-pointer-x': (x * 26).toFixed(2),
      '--ei-pointer-y': (y * 18).toFixed(2),
      'duration': 0.55,
      'ease': 'power3.out',
    })
  }

  root.addEventListener('mousemove', mouseMoveHandler)
}

async function pulseActiveStage(): Promise<void> {
  if (reduceMotion)
    return

  const root = document.querySelector<HTMLElement>('.ei-home-shell')
  if (!root)
    return

  const { gsap } = await import('gsap')
  stagePulse?.kill()
  stagePulse = gsap.timeline()
    .fromTo(root.querySelector('.ei-stage-card'), { y: 10, autoAlpha: 0.72 }, { y: 0, autoAlpha: 1, duration: 0.28, ease: 'power2.out' })
    .fromTo(root.querySelector('.ei-inspector-head strong'), { scale: 1.32 }, { scale: 1, duration: 0.34, ease: 'back.out(1.8)' }, 0)
}

onMounted(() => {
  timer = window.setInterval(() => {
    activeStage.value = (activeStage.value + 1) % stages.length
  }, 3200)

  nextTick(() => {
    void setupGsapMotion()
  })
})

onBeforeUnmount(() => {
  if (timer)
    window.clearInterval(timer)
  stagePulse?.kill()
  const root = document.querySelector<HTMLElement>('.ei-home-shell')
  if (root && mouseMoveHandler)
    root.removeEventListener('mousemove', mouseMoveHandler)
  root?.classList.remove('ei-gsap-ready')
  gsapContext?.revert()
})

watch(activeStage, () => {
  nextTick(() => {
    void pulseActiveStage()
  })
})
</script>

<template>
  <div class="ei-home-shell">
    <section class="ei-home-hero" aria-labelledby="home-title">
      <div class="ei-hero-field" aria-hidden="true">
        <span class="ei-ruler ei-ruler--top" />
        <span class="ei-ruler ei-ruler--left" />
        <span class="ei-registration-mark ei-registration-mark--a" />
        <span class="ei-registration-mark ei-registration-mark--b" />
        <span class="ei-feed-strip ei-feed-strip--one" />
        <span class="ei-feed-strip ei-feed-strip--two" />
      </div>

      <div class="ei-hero-copy">
        <div class="ei-brand-line">
          <img :src="withBase('/logo.png')" alt="" class="ei-brand-mark">
          <span>EasyInk</span>
        </div>
        <h1 id="home-title">
          <span>把模板设计、渲染</span>
          <span>和打印整理成一条</span>
          <span>清晰的工程链路</span>
        </h1>
        <p>
          EasyInk 用 Schema 连接 Designer 与 Viewer，让可视化设计、数据绑定、分页预览、打印和导出围绕同一份文档模型工作。
        </p>

        <div class="ei-hero-actions">
          <a class="ei-action ei-action--primary" :href="withBase('/guide/getting-started')">快速上手</a>
          <a class="ei-action" href="https://hackycy.github.io/easyink">在线演示</a>
          <a class="ei-action" :href="withBase('/api/')">API</a>
        </div>

        <div class="ei-hero-notes" aria-label="核心边界">
          <span>嵌入 Designer</span>
          <span>单独运行 Viewer</span>
          <span>复用一份 Schema</span>
        </div>
      </div>

      <div class="ei-workbench" aria-label="EasyInk 工作流示意">
        <div class="ei-workbench-toolbar">
          <span class="ei-toolbar-title">invoice.easyink</span>
          <span class="ei-toolbar-chip">A4</span>
          <span class="ei-toolbar-chip">96%</span>
          <span class="ei-toolbar-status">saved</span>
        </div>

        <div class="ei-workbench-body">
          <div class="ei-tool-dock" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>

          <div class="ei-page-stack">
            <div class="ei-page-shadow" />
            <div class="ei-page">
              <span class="ei-crop ei-crop--tl" />
              <span class="ei-crop ei-crop--tr" />
              <span class="ei-crop ei-crop--bl" />
              <span class="ei-crop ei-crop--br" />
              <div class="ei-page-header">
                <div class="ei-logo-block" />
                <div>
                  <span class="ei-page-line ei-page-line--wide" />
                  <span class="ei-page-line" />
                </div>
              </div>
              <div class="ei-binding-zone">
                <span class="ei-binding-line ei-binding-line--name" />
                <span class="ei-binding-line ei-binding-line--total" />
                <span class="ei-binding-chip ei-binding-chip--name">customer.name</span>
                <span class="ei-binding-chip ei-binding-chip--total">order.total</span>
              </div>
              <div class="ei-table-preview">
                <span v-for="cell in 16" :key="cell" />
              </div>
              <div class="ei-total-row">
                <span />
                <strong>¥ 12,480.00</strong>
              </div>
            </div>
          </div>

          <aside class="ei-inspector">
            <div class="ei-inspector-head">
              <span>Schema</span>
              <strong>{{ activeStageData.index }}</strong>
            </div>
            <div class="ei-json-lines" aria-hidden="true">
              <span class="ei-json-line ei-json-line--short" />
              <span />
              <span class="ei-json-line ei-json-line--mid" />
              <span />
              <span class="ei-json-line ei-json-line--short" />
            </div>
            <div class="ei-stage-card">
              <span>{{ activeStageData.label }}</span>
              <strong>{{ activeStageData.title }}</strong>
              <p>{{ activeStageData.detail }}</p>
            </div>
          </aside>
        </div>
      </div>
    </section>

    <section class="ei-section ei-section--compact" aria-labelledby="flow-title">
      <div class="ei-section-kicker">
        从任务开始
      </div>
      <h2 id="flow-title" class="ei-section-title">
        先判断你要停在哪一步
      </h2>
      <div class="ei-flow-rail">
        <button
          v-for="(stage, idx) in stages"
          :key="stage.id"
          class="ei-flow-step"
          :class="{ 'ei-flow-step--active': idx === activeStage }"
          type="button"
          @mouseenter="activeStage = idx"
          @focus="activeStage = idx"
        >
          <span>{{ stage.index }}</span>
          <strong>{{ stage.title }}</strong>
          <em>{{ stage.label }}</em>
        </button>
      </div>
    </section>

    <section class="ei-section ei-architecture-section" aria-labelledby="architecture-title">
      <div>
        <div class="ei-section-kicker">
          接入分层
        </div>
        <h2 id="architecture-title" class="ei-section-title">
          按层接入 EasyInk
        </h2>
        <p class="ei-section-desc">
          我们把编辑、渲染、模型和打印拆开。你可以先接一个 Viewer，也可以把 Designer 和打印驱动一起接上。
        </p>
      </div>

      <div class="ei-architecture-map">
        <div class="ei-arch-band ei-arch-band--host">
          <span>你的业务系统</span>
          <strong>业务系统、权限、数据接口、模板存储</strong>
        </div>
        <div class="ei-arch-band ei-arch-band--surface">
          <span>页面层</span>
          <strong>@easyink/designer</strong>
          <strong>@easyink/viewer</strong>
          <strong>@easyink/builtin</strong>
        </div>
        <div class="ei-arch-band ei-arch-band--runtime">
          <span>运行时</span>
          <strong>@easyink/core</strong>
          <strong>@easyink/datasource</strong>
          <strong>@easyink/export-runtime</strong>
        </div>
        <div class="ei-arch-band ei-arch-band--model">
          <span>文档模型</span>
          <strong>@easyink/schema</strong>
          <strong>@easyink/schema-tools</strong>
          <strong>@easyink/material-*</strong>
        </div>
      </div>
    </section>

    <section class="ei-section ei-package-section" aria-labelledby="packages-title">
      <div class="ei-section-heading-row">
        <div>
          <div class="ei-section-kicker">
            包怎么选
          </div>
          <h2 id="packages-title" class="ei-section-title">
            按你的接入目标找包
          </h2>
        </div>
        <a class="ei-section-link" :href="withBase('/guide/packages')">查看包概览</a>
      </div>

      <div class="ei-package-grid">
        <article v-for="group in packageGroups" :key="group.title" class="ei-package-card">
          <h3>{{ group.title }}</h3>
          <p>{{ group.text }}</p>
          <div class="ei-package-list">
            <code v-for="pkg in group.packages" :key="pkg">{{ pkg }}</code>
          </div>
        </article>
      </div>
    </section>

    <section class="ei-section ei-path-section" aria-labelledby="paths-title">
      <div>
        <div class="ei-section-kicker">
          下一步入口
        </div>
        <h2 id="paths-title" class="ei-section-title">
          你现在要做哪一步？
        </h2>
      </div>

      <div class="ei-path-list">
        <a v-for="path in paths" :key="path.href" class="ei-path-item" :href="withBase(path.href)">
          <span>{{ path.title }}</span>
          <strong>{{ path.meta }}</strong>
        </a>
      </div>
    </section>

    <section class="ei-section ei-state-section" aria-labelledby="states-title">
      <div class="ei-state-copy">
        <div class="ei-section-kicker">
          状态归属
        </div>
        <h2 id="states-title" class="ei-section-title">
          先分清这三类状态
        </h2>
      </div>

      <div class="ei-state-grid">
        <article
          v-for="state in states"
          :key="state.title"
          class="ei-state-card"
          :class="`ei-state-card--${state.tone}`"
        >
          <h3>{{ state.title }}</h3>
          <p>{{ state.body }}</p>
        </article>
      </div>
    </section>
  </div>
</template>
