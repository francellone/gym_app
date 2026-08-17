import {
  resolveFormForLanguage,
  resolveTemplateName,
  isQuestionHiddenFor,
  displayValueFor,
  countVisibleQuestions,
} from './resolve-form-language.js'
import { shouldShowQuestion } from '../components/shared/conditionalLogic.js'

// ── Fixtures ──────────────────────────────────────────────

const q = (over = {}) => ({
  id: 'objetivo_principal',
  type: 'select',
  label: '¿Cuál es tu objetivo principal?',
  options: ['Perder grasa', 'Ganar músculo'],
  required: true,
  ...over,
})

const baseConfig = (over = {}) => ({
  intro: { type: 'intro', content: '¡Bienvenido/a!' },
  modules: [
    {
      id: 'modulo_objetivos',
      title: 'Objetivos',
      enabled: true,
      order: 1,
      questions: [q()],
    },
  ],
  consent: {
    id: 'modulo_consentimiento',
    title: 'Consentimiento',
    order: 999,
    questions: [
      { id: 'consentimiento_datos', type: 'boolean', label: 'Declaro que...', required: true },
    ],
  },
  ...over,
})

const withTranslation = (questionOver = {}) =>
  baseConfig({
    modules: [
      {
        id: 'modulo_objetivos',
        title: 'Objetivos',
        enabled: true,
        order: 1,
        i18n: { en: { title: 'Goals' } },
        questions: [
          q({
            i18n: {
              en: { label: 'What is your main goal?', options: ['Lose fat', 'Gain muscle'] },
            },
            ...questionOver,
          }),
        ],
      },
    ],
  })

// ── Sin traducciones (comportamiento actual intacto) ──────

describe('resolveFormForLanguage — sin traducciones', () => {
  it('display* cae al canónico y no cambia la estructura', () => {
    const resolved = resolveFormForLanguage(baseConfig(), 'en')
    const question = resolved.modules[0].questions[0]
    expect(question.displayLabel).toBe('¿Cuál es tu objetivo principal?')
    expect(question.displayOptions).toEqual(['Perder grasa', 'Ganar músculo'])
    expect(resolved.modules).toHaveLength(1)
    expect(resolved.intro.displayContent).toBe('¡Bienvenido/a!')
  })

  it('no muta el config original', () => {
    const config = withTranslation()
    const frozen = JSON.stringify(config)
    resolveFormForLanguage(config, 'en')
    expect(JSON.stringify(config)).toBe(frozen)
  })

  it('config nulo o inválido se devuelve tal cual', () => {
    expect(resolveFormForLanguage(null, 'en')).toBeNull()
    expect(resolveFormForLanguage(undefined, 'en')).toBeUndefined()
  })
})

// ── Con traducciones ──────────────────────────────────────

describe('resolveFormForLanguage — con traducciones', () => {
  it('muestra EN pero conserva options canónicas como valores', () => {
    const resolved = resolveFormForLanguage(withTranslation(), 'en')
    const question = resolved.modules[0].questions[0]
    expect(question.displayLabel).toBe('What is your main goal?')
    expect(question.displayOptions).toEqual(['Lose fat', 'Gain muscle'])
    // Lo que se guarda sigue siendo lo canónico:
    expect(question.options).toEqual(['Perder grasa', 'Ganar músculo'])
    expect(resolved.modules[0].displayTitle).toBe('Goals')
  })

  it('para es muestra el canónico aunque exista traducción en', () => {
    const resolved = resolveFormForLanguage(withTranslation(), 'es')
    const question = resolved.modules[0].questions[0]
    expect(question.displayLabel).toBe('¿Cuál es tu objetivo principal?')
    expect(question.displayOptions).toEqual(['Perder grasa', 'Ganar músculo'])
  })

  it('traducción parcial: opción vacía cae a la canónica', () => {
    const config = withTranslation({
      i18n: { en: { label: 'What is your main goal?', options: ['Lose fat', ''] } },
    })
    const resolved = resolveFormForLanguage(config, 'en')
    expect(resolved.modules[0].questions[0].displayOptions).toEqual(['Lose fat', 'Ganar músculo'])
  })

  it('traducción stale: ignora options traducidas, conserva label', () => {
    const config = withTranslation({
      i18n: {
        en: { label: 'What is your main goal?', options: ['Lose fat', 'Gain muscle'], stale: true },
      },
    })
    const question = resolveFormForLanguage(config, 'en').modules[0].questions[0]
    expect(question.displayLabel).toBe('What is your main goal?')
    expect(question.displayOptions).toEqual(['Perder grasa', 'Ganar músculo'])
  })

  it('options traducidas con largo distinto: se ignoran (desalineación por índice)', () => {
    const config = withTranslation({
      i18n: { en: { options: ['Lose fat'] } },
    })
    const question = resolveFormForLanguage(config, 'en').modules[0].questions[0]
    expect(question.displayOptions).toEqual(['Perder grasa', 'Ganar músculo'])
  })

  it('intro y nombre de plantilla traducidos', () => {
    const config = baseConfig({
      name_i18n: { en: 'Monthly form' },
      intro: { type: 'intro', content: '¡Hola!', i18n: { en: { content: 'Hi there!' } } },
    })
    const resolved = resolveFormForLanguage(config, 'en')
    expect(resolved.displayName).toBe('Monthly form')
    expect(resolved.intro.displayContent).toBe('Hi there!')
    expect(resolveTemplateName('Formulario mensual💪🏼🔥', config, 'en')).toBe('Monthly form')
    expect(resolveTemplateName('Formulario mensual💪🏼🔥', config, 'es')).toBe(
      'Formulario mensual💪🏼🔥'
    )
  })
})

// ── hidden_for ────────────────────────────────────────────

describe('resolveFormForLanguage — hidden_for', () => {
  const configWithHidden = () =>
    baseConfig({
      modules: [
        {
          id: 'modulo_objetivos',
          title: 'Objetivos',
          enabled: true,
          order: 1,
          questions: [
            q(),
            q({
              id: 'solo_espanol',
              label: 'Pregunta solo para hispanohablantes',
              hidden_for: ['en'],
              required: true,
            }),
          ],
        },
      ],
    })

  it('filtra la pregunta para en pero no para es', () => {
    const en = resolveFormForLanguage(configWithHidden(), 'en')
    const es = resolveFormForLanguage(configWithHidden(), 'es')
    expect(en.modules[0].questions.map((x) => x.id)).toEqual(['objetivo_principal'])
    expect(es.modules[0].questions.map((x) => x.id)).toEqual(['objetivo_principal', 'solo_espanol'])
  })

  it('una required oculta desaparece del form resuelto (no puede bloquear el envío)', () => {
    const en = resolveFormForLanguage(configWithHidden(), 'en')
    const required = en.modules[0].questions.filter((x) => x.required).map((x) => x.id)
    expect(required).not.toContain('solo_espanol')
  })

  it('módulo que queda sin preguntas visibles se elimina', () => {
    const config = baseConfig({
      modules: [
        {
          id: 'modulo_solo_es',
          title: 'Solo español',
          enabled: true,
          order: 1,
          questions: [q({ hidden_for: ['en'] })],
        },
        {
          id: 'modulo_objetivos',
          title: 'Objetivos',
          enabled: true,
          order: 2,
          questions: [q({ id: 'otra' })],
        },
      ],
    })
    const resolved = resolveFormForLanguage(config, 'en')
    expect(resolved.modules.map((m) => m.id)).toEqual(['modulo_objetivos'])
  })

  it('el consentimiento se traduce pero nunca se filtra por hidden_for', () => {
    const config = baseConfig()
    config.consent.questions[0].hidden_for = ['en']
    config.consent.questions[0].i18n = { en: { label: 'I declare that...' } }
    const resolved = resolveFormForLanguage(config, 'en')
    expect(resolved.consent.questions).toHaveLength(1)
    expect(resolved.consent.questions[0].displayLabel).toBe('I declare that...')
  })

  it('condicional cuyo padre está oculto queda oculta (integración con conditionalLogic)', () => {
    const child = q({
      id: 'detalle',
      conditional: { dependsOn: 'solo_espanol', showWhen: 'Sí' },
    })
    // El padre fue filtrado para en ⇒ nunca se responde ⇒ la hija no se muestra.
    expect(shouldShowQuestion(child, {})).toBe(false)
  })

  it('displayValueFor traduce respuestas canónicas guardadas (select y multiselect)', () => {
    const question = resolveFormForLanguage(withTranslation(), 'en').modules[0].questions[0]
    expect(displayValueFor(question, 'Perder grasa')).toBe('Lose fat')
    expect(displayValueFor(question, ['Perder grasa', 'Ganar músculo'])).toEqual([
      'Lose fat',
      'Gain muscle',
    ])
    // Valores que no son opciones (texto libre, boolean) pasan intactos:
    expect(displayValueFor(question, 'otra cosa')).toBe('otra cosa')
    expect(displayValueFor(question, true)).toBe(true)
  })

  it('intro como string plano (snapshots viejos) no explota', () => {
    const config = baseConfig({ intro: '¡Bienvenido/a!' })
    const resolved = resolveFormForLanguage(config, 'en')
    expect(resolved.intro.displayContent).toBe('¡Bienvenido/a!')
  })

  it('isQuestionHiddenFor tolera preguntas sin hidden_for', () => {
    expect(isQuestionHiddenFor(q(), 'en')).toBe(false)
    expect(isQuestionHiddenFor(q({ hidden_for: ['en'] }), 'en')).toBe(true)
    expect(isQuestionHiddenFor(null, 'en')).toBe(false)
  })
})


// ── countVisibleQuestions ─────────────────────────────────

describe('countVisibleQuestions', () => {
  const base = {
    modules: [
      {
        id: 'm1',
        enabled: true,
        questions: [
          { id: 'q1', type: 'text', label: 'Una' },
          { id: 'q2', type: 'text', label: 'Otra', hidden_for: ['en'] },
        ],
      },
    ],
  }

  it('cuenta solo lo que vería un alumno de ese idioma', () => {
    expect(countVisibleQuestions(base, 'es')).toBe(2)
    expect(countVisibleQuestions(base, 'en')).toBe(1)
  })

  it('da 0 cuando todas las preguntas están ocultas para ese idioma', () => {
    const todas = {
      modules: [
        {
          id: 'm1',
          enabled: true,
          questions: [{ id: 'q1', type: 'text', label: 'Una', hidden_for: ['es'] }],
        },
      ],
    }
    expect(countVisibleQuestions(todas, 'es')).toBe(0)
    expect(countVisibleQuestions(todas, 'en')).toBe(1)
  })

  it('ignora módulos deshabilitados y suma el consentimiento', () => {
    const conConsent = {
      modules: [
        { id: 'm1', enabled: false, questions: [{ id: 'q1', type: 'text', label: 'No cuenta' }] },
      ],
      consent: { id: 'consent', questions: [{ id: 'c1', type: 'boolean', label: 'Acepto' }] },
    }
    expect(countVisibleQuestions(conConsent, 'es')).toBe(1)
  })

  it('no explota con un config vacío o nulo', () => {
    expect(countVisibleQuestions(null, 'es')).toBe(0)
    expect(countVisibleQuestions({}, 'es')).toBe(0)
  })
})
