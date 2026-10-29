import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import { router } from './router'
import { useAppConfigStore } from './stores/appConfig'

const app = createApp(App)
app.use(createPinia())
// Must run before the router's first guard: it decides mock vs live API for the session restore
useAppConfigStore()
app.use(router)
app.mount('#app')
