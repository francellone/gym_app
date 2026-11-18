// ============================================================
// Guardia: cómo muestra el service worker los avisos cuando son varios.
// ------------------------------------------------------------
// public/sw.js no es un módulo, así que se evalúa acá con un `self` de
// mentira. Regla (Franco, 2026-11-18): si del mismo tag hay más de uno sin
// abrir, el aviso dice la cantidad en vez de mostrar solo el último texto.
// ============================================================
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

function loadSw({ withGetNotifications = true } = {}) {
  const listeners = {}
  let shown = []
  const registration = {
    showNotification: async (title, options) => {
      // Mismo tag = reemplaza, como hace el sistema.
      if (options.tag) shown = shown.filter((n) => n.tag !== options.tag)
      shown.push({ title, ...options })
    },
  }
  if (withGetNotifications) {
    registration.getNotifications = async ({ tag } = {}) =>
      shown.filter((n) => !tag || n.tag === tag)
  }
  const self = {
    addEventListener: (type, fn) => (listeners[type] = fn),
    registration,
    clients: {},
    location: { origin: 'https://app.test' },
  }
  new Function('self', 'caches', source)(self, {})

  const push = (payload) => {
    let done
    listeners.push({
      data: { json: () => payload, text: () => JSON.stringify(payload) },
      waitUntil: (p) => (done = p),
    })
    return done
  }
  return { push, shown: () => shown, dismiss: () => (shown = []) }
}

const note = (body, tag = 'student_note:ana') => ({
  title: 'Ana',
  body,
  tag,
  countBody: '{{count}} mensajes nuevos',
})

describe('sw.js · avisos cuando son varios', () => {
  it('uno solo muestra su texto', async () => {
    const sw = loadSw()
    await sw.push(note('Hola'))
    expect(sw.shown()).toHaveLength(1)
    expect(sw.shown()[0].body).toBe('Hola')
  })

  it('varios del mismo tag: queda uno solo que dice la cantidad', async () => {
    const sw = loadSw()
    await sw.push(note('Hola'))
    await sw.push(note('¿Estás?'))
    await sw.push(note('Te dejé una duda'))
    expect(sw.shown()).toHaveLength(1)
    expect(sw.shown()[0].body).toBe('3 mensajes nuevos')
    expect(sw.shown()[0].title).toBe('Ana')
  })

  it('cuenta bien aunque lleguen todos juntos (tanda del servidor)', async () => {
    const sw = loadSw()
    await Promise.all([
      sw.push(note('1')),
      sw.push(note('2')),
      sw.push(note('3')),
      sw.push(note('4')),
    ])
    expect(sw.shown()).toHaveLength(1)
    expect(sw.shown()[0].body).toBe('4 mensajes nuevos')
  })

  it('tags distintos no se mezclan ni se cuentan entre sí', async () => {
    const sw = loadSw()
    await sw.push(note('Hola', 'student_note:ana'))
    await sw.push(note('Buenas', 'student_note:juli'))
    expect(sw.shown().map((n) => n.body)).toEqual(['Hola', 'Buenas'])
  })

  it('al descartar el aviso la cuenta vuelve a empezar', async () => {
    const sw = loadSw()
    await sw.push(note('1'))
    await sw.push(note('2'))
    sw.dismiss()
    await sw.push(note('Nuevo'))
    expect(sw.shown()[0].body).toBe('Nuevo')
  })

  it('sin countBody o sin getNotifications se comporta como antes', async () => {
    const a = loadSw()
    await a.push({ title: 'T', body: 'uno', tag: 'x' })
    await a.push({ title: 'T', body: 'dos', tag: 'x' })
    expect(a.shown()[0].body).toBe('dos')

    const b = loadSw({ withGetNotifications: false })
    await b.push(note('uno'))
    await b.push(note('dos'))
    expect(b.shown()[0].body).toBe('dos')
  })
})
