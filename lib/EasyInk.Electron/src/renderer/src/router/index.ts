import { createRouter, createWebHashHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import PrintLabView from '../views/PrintLabView.vue'
import JobsView from '../views/JobsView.vue'
import LogsView from '../views/LogsView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardView },
    { path: '/print', name: 'print', component: PrintLabView },
    { path: '/jobs', name: 'jobs', component: JobsView },
    { path: '/logs', name: 'logs', component: LogsView }
  ]
})
