import { createRouter, createWebHashHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import PrintLabView from '../views/PrintLabView.vue'
import JobsView from '../views/JobsView.vue'
import LogsView from '../views/LogsView.vue'
import PrintersView from '../views/PrintersView.vue'
import SettingsView from '../views/SettingsView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardView },
    { path: '/printers', name: 'printers', component: PrintersView },
    { path: '/print', name: 'print', component: PrintLabView },
    { path: '/jobs', name: 'jobs', component: JobsView },
    { path: '/logs', name: 'logs', component: LogsView },
    { path: '/settings', name: 'settings', component: SettingsView }
  ]
})
