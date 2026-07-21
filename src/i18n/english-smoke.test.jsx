// ============================================================
// Smoke test i18n inglés — guardia de regresión pre-lanzamiento EN
// ------------------------------------------------------------
// Renderiza componentes clave de la vista del alumno con el idioma
// en 'en' y falla si aparece CUALQUIER texto en español. Detecta:
//  - caracteres exclusivos del español (á é í ó ú ñ ¿ ¡), y
//  - palabras españolas comunes de la UI que no llevan tilde.
// Si un label nuevo queda hardcodeado en español, este test lo caza.
//
// El setup global fuerza 'es' (src/test/setup.js); acá cambiamos a 'en'
// y restauramos al final. Vitest aísla por archivo, no hay leaks.
// ============================================================
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { render } from '@testing-library/react'
import i18n from '@/i18n'
import {
  WEIGHT_MODES,
  REPS_UNITS,
  PSE_OPTIONS,
  PSE_OPTION_KEY,
  AEROBIC_FORMATS,
  CIRCUIT_TYPES,
  INTENSITY_LEVELS,
} from '@/features/plans/helpers'

// LoginPage usa useAuth → mock directo (mismo patrón que LoginPage.test.jsx)
vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ signIn: vi.fn(), user: null, profile: null, loading: false }),
}))

const { default: LoginPage } = await import('@/features/auth/pages/LoginPage')
const { default: DailyPSEModal } = await import('@/features/workouts/components/DailyPSEModal')
const { default: RPEScale } = await import('@/features/workouts/components/RPEScale')
const { default: WellbeingModal } = await import('@/features/wellbeing/components/WellbeingModal')

// Caracteres que el inglés no usa + palabras frecuentes de la UI en español.
// Palabras cortas van con \b para no pegarle a substrings ingleses.
const SPANISH_CHARS = /[áéíóúñÁÉÍÓÚÑ¿¡]/
const SPANISH_WORDS =
  /\b(Guardar|Guardando|Cargando|Iniciando|Ingresar|Contraseña|Cerrar|Cancelar|Omitir|Esfuerzo|Duro|Suave|Fácil|Moderado|Máximo|Activación|Principal|observaciones|entrenamiento|alumno)\b/i

function expectEnglishOnly(container, label) {
  const text = container.textContent || ''
  const charHit = text.match(SPANISH_CHARS)
  const wordHit = text.match(SPANISH_WORDS)
  expect(
    charHit,
    `${label}: encontró carácter español "${charHit?.[0]}" en: ${text.slice(0, 300)}`
  ).toBeNull()
  expect(
    wordHit,
    `${label}: encontró palabra española "${wordHit?.[0]}" en: ${text.slice(0, 300)}`
  ).toBeNull()
  // Placeholders y titles no entran en textContent — revisarlos aparte
  for (const el of container.querySelectorAll('[placeholder], [title]')) {
    const attr = (el.getAttribute('placeholder') || '') + ' ' + (el.getAttribute('title') || '')
    expect(
      SPANISH_CHARS.test(attr) || SPANISH_WORDS.test(attr),
      `${label}: atributo en español: "${attr}"`
    ).toBe(false)
  }
}

describe('vista del alumno en inglés (smoke)', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en')
  })
  afterAll(async () => {
    await i18n.changeLanguage('es')
  })

  it('LoginPage no muestra español', () => {
    const { container } = render(<LoginPage />)
    expectEnglishOnly(container, 'LoginPage')
  })

  it('DailyPSEModal (escala PSE del día) no muestra español', () => {
    const { container } = render(
      <DailyPSEModal dayLabel="Day A" currentEffort={7} onSave={() => {}} onClose={() => {}} />
    )
    expectEnglishOnly(container, 'DailyPSEModal')
  })

  it('RPEScale cardio (tabla desplegada + valor seleccionado) no muestra español', () => {
    const { container } = render(
      <RPEScale value={5} onChange={() => {}} variant="cardio" helpOpen={true} />
    )
    expectEnglishOnly(container, 'RPEScale cardio')
  })

  it('RPEScale circuito (tabla desplegada + valor seleccionado) no muestra español', () => {
    const { container } = render(
      <RPEScale value={9} onChange={() => {}} variant="circuit" helpOpen={true} />
    )
    expectEnglishOnly(container, 'RPEScale circuit')
  })

  it('WellbeingModal (check-in de bienestar) no muestra español', () => {
    const { container } = render(
      <WellbeingModal userId="u1" date="2026-07-09" onSave={() => {}} onSkip={() => {}} />
    )
    expectEnglishOnly(container, 'WellbeingModal')
  })
})

// ============================================================
// Guardia de leaks de ENUMS de display (bug 2026-07-21):
// constantes cuyos `.label`/`.short`/valor canónico se muestran al
// alumno (tipo de peso, unidad de reps, PSE sugerida, formato aeróbico,
// tipo de circuito, intensidad). El valor guardado en DB es canónico
// español; el display DEBE pasar por t(). Este test verifica que cada
// key del enum tenga traducción EN y que no quede texto español.
// Si el coach agrega un modo/unidad nuevo sin su clave i18n, falla acá.
// ============================================================
describe('enums de display del alumno traducidos al inglés (guardia)', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en')
  })
  afterAll(async () => {
    await i18n.changeLanguage('es')
  })

  function expectTranslated(keyPath, label) {
    const val = i18n.t(keyPath)
    expect(val, `${label}: falta la clave i18n ${keyPath}`).not.toBe(keyPath)
    expect(
      SPANISH_CHARS.test(val) || SPANISH_WORDS.test(val),
      `${label}: valor en español "${val}" para ${keyPath}`
    ).toBe(false)
  }

  it('WEIGHT_MODES → workout.weightMode.<key>', () => {
    for (const m of WEIGHT_MODES) expectTranslated(`workout.weightMode.${m.key}`, 'weightMode')
  })

  it('REPS_UNITS → workout.repsUnitShort/Option.<key>', () => {
    for (const u of REPS_UNITS) expectTranslated(`workout.repsUnitShort.${u.key}`, 'repsUnitShort')
    for (const u of REPS_UNITS.filter((u) => u.key !== 'reps'))
      expectTranslated(`workout.repsUnitOption.${u.key}`, 'repsUnitOption')
  })

  it('suggested_pse (PSE_OPTIONS) → workout.suggestedPseValue.<key>', () => {
    for (const opt of PSE_OPTIONS) {
      const key = PSE_OPTION_KEY[opt]
      expect(key, `PSE_OPTION_KEY no cubre "${opt}"`).toBeTruthy()
      expectTranslated(`workout.suggestedPseValue.${key}`, 'suggestedPseValue')
    }
  })

  it('AEROBIC_FORMATS / CIRCUIT_TYPES / INTENSITY_LEVELS traducidos', () => {
    for (const f of AEROBIC_FORMATS)
      expectTranslated(`workout.aerobicFormats.${f.key}`, 'aerobicFormats')
    for (const c of CIRCUIT_TYPES) expectTranslated(`workout.circuitTypes.${c.key}`, 'circuitTypes')
    for (const lv of INTENSITY_LEVELS) expectTranslated(`workout.intensity.${lv.key}`, 'intensity')
  })
})
