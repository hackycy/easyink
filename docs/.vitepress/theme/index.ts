import type { App } from 'vue'
import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import HeroBackground from './components/HeroBackground.vue'
import HomeShowcase from './components/HomeShowcase.vue'
import JsonToDatasource from './components/JsonToDatasource.vue'
import ScrollReveal from './components/ScrollReveal.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'home-hero-before': () => [h(HeroBackground), h(ScrollReveal)],
    })
  },
  enhanceApp({ app }: { app: App }) {
    app.component('HomeShowcase', HomeShowcase)
    app.component('JsonToDatasource', JsonToDatasource)
  },
}
