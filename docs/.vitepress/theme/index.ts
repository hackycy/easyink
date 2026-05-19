import type { App } from 'vue'
import DefaultTheme from 'vitepress/theme'
import HomeShowcase from './components/HomeShowcase.vue'
import JsonToDatasource from './components/JsonToDatasource.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }: { app: App }) {
    app.component('HomeShowcase', HomeShowcase)
    app.component('JsonToDatasource', JsonToDatasource)
  },
}
