// ============================================================
// confetti.js — confeti liviano en canvas, sin dependencias
// ------------------------------------------------------------
// Un canvas fijo a pantalla completa, sin eventos de puntero. Se apaga
// solo con prefers-reduced-motion. Devuelve una función para cortarlo.
// ============================================================
const COLORS = ['#f97316', '#fb923c', '#fbbf24', '#16a34a', '#38bdf8', '#f472b6']

export function prefersReducedMotion() {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
  } catch {
    return false
  }
}

export function fireConfetti(count, { originY = 0.65 } = {}) {
  if (!count || typeof window === 'undefined' || prefersReducedMotion()) return () => {}
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '70',
  })
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    canvas.remove()
    return () => {}
  }
  const w = window.innerWidth
  const h = window.innerHeight
  const dpr = window.devicePixelRatio || 1
  canvas.width = w * dpr
  canvas.height = h * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  let parts = Array.from({ length: count }, (_, i) => ({
    x: w / 2 + (Math.random() - 0.5) * Math.min(w, 240),
    y: h * originY,
    vx: (Math.random() - 0.5) * 7,
    vy: -7 - Math.random() * 7,
    s: 5 + Math.random() * 4,
    c: COLORS[i % COLORS.length],
    a: Math.random() * 6,
    va: (Math.random() - 0.5) * 0.3,
    life: 0,
  }))
  let raf = null
  const tick = () => {
    ctx.clearRect(0, 0, w, h)
    parts = parts.filter((p) => p.life < 150 && p.y < h + 20)
    for (const p of parts) {
      p.vy += 0.2
      p.x += p.vx
      p.y += p.vy
      p.a += p.va
      p.life += 1
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.a)
      ctx.globalAlpha = Math.max(0, 1 - p.life / 150)
      ctx.fillStyle = p.c
      ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.66)
      ctx.restore()
    }
    if (parts.length) raf = requestAnimationFrame(tick)
    else canvas.remove()
  }
  raf = requestAnimationFrame(tick)
  return () => {
    if (raf) cancelAnimationFrame(raf)
    canvas.remove()
  }
}
