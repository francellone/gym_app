import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './i18n' // i18n vista alumno (doc 46) — debe cargar antes que App

// Registrar Service Worker para push notifications
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => console.log('SW registrado:', reg.scope))
      .catch((err) => console.warn('SW no registrado:', err))
  })

  // Escuchar mensajes del SW para navegación en click de notificación push
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'NAVIGATE' && event.data.url) {
      window.location.href = event.data.url
    }
  })

  // Cuando un SW nuevo toma control (deploy nuevo), recargar UNA vez para
  // aplicar la última versión sin quedar pegado en JS viejo. Guard anti-loop.
  let swRefreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (swRefreshing) return
    swRefreshing = true
    window.location.reload()
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
