// Cuentas del recorte circular, separadas para poder testearlas.
// Coordenadas: el visor es un cuadrado de lado V; la imagen se dibuja
// centrada, escalada por `scale` y corrida por (x, y) desde el centro.

/** Escala mínima para que la imagen cubra todo el visor. */
export function coverScale(iw, ih, V) {
  return Math.max(V / iw, V / ih)
}

/** Limita el corrimiento para que nunca quede un hueco dentro del visor. */
export function clampOffset({ x, y }, iw, ih, scale, V) {
  const maxX = Math.max(0, (iw * scale - V) / 2)
  const maxY = Math.max(0, (ih * scale - V) / 2)
  const c = (v, m) => Math.min(m, Math.max(-m, v)) + 0 // +0 normaliza -0
  return { x: c(x, maxX), y: c(y, maxY) }
}

/** Rectángulo de dibujo en un canvas de lado OUT equivalente a lo que se ve. */
export function drawRect(iw, ih, scale, { x, y }, V, OUT) {
  const k = OUT / V
  const w = iw * scale
  const h = ih * scale
  return { dx: (V / 2 + x - w / 2) * k, dy: (V / 2 + y - h / 2) * k, dw: w * k, dh: h * k }
}
