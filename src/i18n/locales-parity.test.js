// ============================================================
// Guardia: español e inglés tienen EXACTAMENTE las mismas claves.
// Cubre el diccionario principal y cada área del panel de la coach
// (locales/coach/<área>.{es,en}.json). Una clave que falta en inglés
// caería al español por fallbackLng y nadie se daría cuenta.
// ============================================================
import { describe, expect, it } from 'vitest'
import es from './locales/es.json'
import en from './locales/en.json'

const coach = import.meta.glob('./locales/coach/*.json', { eager: true })

function keys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v) ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  )
}

function emptyValues(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object'
      ? emptyValues(v, `${prefix}${k}.`)
      : typeof v === 'string' && v.trim() === ''
        ? [`${prefix}${k}`]
        : []
  )
}

describe('paridad de locales', () => {
  it('diccionario principal: mismas claves en es y en', () => {
    expect(keys(en).sort()).toEqual(keys(es).sort())
  })

  const areas = new Set(
    Object.keys(coach)
      .map((f) => f.match(/\/([\w-]+)\.(es|en)\.json$/)?.[1])
      .filter(Boolean)
  )

  for (const area of areas) {
    it(`coach.${area}: existe en los dos idiomas con las mismas claves y sin vacíos`, () => {
      const e = coach[`./locales/coach/${area}.es.json`]?.default
      const n = coach[`./locales/coach/${area}.en.json`]?.default
      expect(e, `falta ${area}.es.json`).toBeTruthy()
      expect(n, `falta ${area}.en.json`).toBeTruthy()
      expect(keys(n).sort()).toEqual(keys(e).sort())
      expect(emptyValues(e)).toEqual([])
      expect(emptyValues(n)).toEqual([])
    })
  }
})
