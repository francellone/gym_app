// Detección de plataforma para la PWA. Lo usan el cartel de instalación en
// iOS y los avisos al celular (en iPhone el push solo existe con la app
// instalada en la pantalla de inicio).

export function isIos() {
  const ua = window.navigator.userAgent
  const isIpadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return /iPhone|iPad|iPod/.test(ua) || isIpadOs
}

export function isInstalled() {
  return (
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true // legacy Safari
  )
}
