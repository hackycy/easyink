<script setup lang="ts">
import { useRoute } from 'vitepress'
import { onBeforeUnmount, onMounted } from 'vue'

const route = useRoute()

let bgEl: HTMLDivElement | null = null
let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let rafId = 0
let ro: ResizeObserver | null = null
let W = 0
let H = 0

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  r: number
}

const particles: Particle[] = []

function resize(): void {
  if (!canvas || !bgEl || !ctx)
    return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  W = bgEl.offsetWidth
  H = bgEl.offsetHeight
  canvas.width = W * dpr
  canvas.height = H * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  initParticles()
}

function initParticles(): void {
  particles.length = 0
  const count = Math.min(58, Math.floor((W * H) / 14000))
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.32,
      vy: (Math.random() - 0.5) * 0.32,
      r: 1.2 + Math.random() * 1.4,
    })
  }
}

function tick(): void {
  if (!ctx)
    return
  ctx.clearRect(0, 0, W, H)

  for (const p of particles) {
    p.x += p.vx
    p.y += p.vy
    if (p.x < -16)
      p.x = W + 16
    else if (p.x > W + 16)
      p.x = -16
    if (p.y < -16)
      p.y = H + 16
    else if (p.y > H + 16)
      p.y = -16
  }

  const MAX = 120
  const MAX2 = MAX * MAX
  const dark = document.documentElement.classList.contains('dark')
  const pColor = dark ? 'rgba(123,163,247,0.26)' : 'rgba(91,138,245,0.30)'
  const lBase = dark ? 'rgba(123,163,247,' : 'rgba(91,138,245,'

  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x
      const dy = particles[i].y - particles[j].y
      const d2 = dx * dx + dy * dy
      if (d2 < MAX2) {
        const alpha = (1 - Math.sqrt(d2) / MAX) * 0.14
        ctx.beginPath()
        ctx.moveTo(particles[i].x, particles[i].y)
        ctx.lineTo(particles[j].x, particles[j].y)
        ctx.strokeStyle = `${lBase}${alpha})`
        ctx.lineWidth = 0.6
        ctx.stroke()
      }
    }
  }

  for (const p of particles) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
    ctx.fillStyle = pColor
    ctx.fill()
  }

  rafId = requestAnimationFrame(tick)
}

onMounted(() => {
  if (route.path !== '/')
    return

  const hero = document.querySelector<HTMLElement>('.VPHero')
  if (!hero)
    return

  bgEl = document.createElement('div')
  bgEl.className = 'ei-hero-bg'
  bgEl.setAttribute('aria-hidden', 'true')

  const orb1 = document.createElement('div')
  orb1.className = 'ei-orb ei-orb--1'
  const orb2 = document.createElement('div')
  orb2.className = 'ei-orb ei-orb--2'
  const orb3 = document.createElement('div')
  orb3.className = 'ei-orb ei-orb--3'

  canvas = document.createElement('canvas')
  canvas.className = 'ei-particle-canvas'
  ctx = canvas.getContext('2d')

  bgEl.appendChild(orb1)
  bgEl.appendChild(orb2)
  bgEl.appendChild(orb3)
  bgEl.appendChild(canvas)
  hero.insertBefore(bgEl, hero.firstChild)

  ro = new ResizeObserver(resize)
  ro.observe(bgEl)

  resize()
  tick()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  ro?.disconnect()
  bgEl?.remove()
})
</script>
