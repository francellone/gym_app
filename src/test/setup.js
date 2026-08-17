// ============================================================
// src/test/setup.js — corre una vez por proceso de test
// ------------------------------------------------------------
// 1) Registra los matchers de @testing-library/jest-dom (toBeInTheDocument, etc).
// 2) Stubea APIs del browser que jsdom no implementa.
// 3) Setea las variables de entorno mínimas que lib/supabase.js exige al import.
//    Sin esto, cualquier test que importe (directa o indirectamente) @/lib/supabase
//    tira "Faltan las variables de entorno VITE_SUPABASE_URL...".
// ============================================================
import { afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
// i18n (doc 46): inicializa la instancia global de i18next para que los
// componentes con useTranslation() rendericen en español en los tests.
// Desde que el idioma inicial se detecta con navigator.language (pre-login),
// jsdom reporta 'en-US' y la instancia arrancaría en inglés — lo forzamos
// a 'es' para que los tests sigan asertando los textos en español.
import i18n from '@/i18n'

await i18n.changeLanguage('es')

// ── Env stubs ──────────────────────────────────────────────
// import.meta.env en Vite es read-only en tiempo de build; en tests con vitest
// se puede mutar. Lo seteamos antes de que cualquier módulo lea estas vars.
if (typeof import.meta !== 'undefined' && import.meta.env) {
  import.meta.env.VITE_SUPABASE_URL ||= 'http://localhost:54321'
  import.meta.env.VITE_SUPABASE_ANON_KEY ||= 'test-anon-key'
}

// ── Browser API stubs ──────────────────────────────────────
// scrollTo / scrollIntoView: jsdom no los implementa y cualquier componente que
// navegue por pasos (FormRenderer, wizards) llena la salida de tests con
// "Error: Not implemented".
if (typeof window !== 'undefined') {
  window.scrollTo = vi.fn()
  if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn()
  }
}

// matchMedia: lo usan algunos componentes con media queries condicionales.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

// IntersectionObserver: jsdom no lo implementa. Algunas libs (recharts, virtual
// scrollers) lo consultan al montar. Stub mínimo que devuelve nada.
if (typeof window !== 'undefined' && !window.IntersectionObserver) {
  class IntersectionObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
  window.IntersectionObserver = IntersectionObserverStub
  global.IntersectionObserver = IntersectionObserverStub
}

// Notification API: useNotifications puede pedirla. Stub que no hace nada.
if (typeof window !== 'undefined' && !window.Notification) {
  window.Notification = class {
    static permission = 'default'
    static requestPermission = vi.fn().mockResolvedValue('default')
    constructor() {}
  }
}

// ── Cleanup automático entre tests ─────────────────────────
// RTL deja el DOM montado entre tests si no se hace cleanup → leaks de estado.
// vitest debería hacerlo si `globals: true` y el adapter de RTL lo registra,
// pero lo llamamos explícito para no depender del orden de imports.
afterEach(() => {
  cleanup()
})
