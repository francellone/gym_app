// ============================================================
// Guardia: los textos del aviso al celular son los mismos que los de la campana.
// ------------------------------------------------------------
// La edge function `send-push` no puede importar los locales del front, así
// que lleva una copia mínima en supabase/functions/send-push/push-texts.json
// (solo los tipos que le suenan a quien entrena). Si alguien cambia el texto
// en es.json / en.json y no en la copia, la campana y el celular dirían cosas
// distintas. Este test lo impide.
// ============================================================
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import es from '@/i18n/locales/es.json'
import en from '@/i18n/locales/en.json'

const pushTexts = JSON.parse(
  readFileSync(resolve(process.cwd(), 'supabase/functions/send-push/push-texts.json'), 'utf8')
)
const locales = { es, en }

describe('push-texts.json', () => {
  it('tiene los dos idiomas con los mismos tipos', () => {
    expect(Object.keys(pushTexts).sort()).toEqual(['en', 'es'])
    expect(Object.keys(pushTexts.en).sort()).toEqual(Object.keys(pushTexts.es).sort())
  })

  for (const lng of ['es', 'en']) {
    for (const [type, texts] of Object.entries(pushTexts[lng])) {
      for (const [key, value] of Object.entries(texts)) {
        it(`${lng} · ${type}.${key} coincide con el locale del front`, () => {
          expect(value).toBe(locales[lng].notifications.types[type][key])
        })
      }
    }
  }
})
