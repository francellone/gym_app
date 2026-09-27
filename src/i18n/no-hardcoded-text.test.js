// ============================================================
// Guardia: ningún texto visible nuevo hardcodeado en la app.
// Corre scripts/find-hardcoded-es.mjs sobre src/ y compara contra la lista
// de excepciones aceptadas (texto que es igual en los dos idiomas o que
// muestra contenido en inglés a propósito). Si agregás UI, usá t().
// Si una excepción nueva es legítima, sumala acá con el motivo.
// ============================================================
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const ALLOWED = [
  // unidades / nombres técnicos iguales en ambos idiomas
  'src/features/evaluations/pages/EvaluationDetailPage.jsx|VO₂max',
  'src/features/evaluations/pages/StudentEvaluationsTab.jsx|…kg × …reps',
  'src/features/evaluations/pages/StudentEvaluationsTab.jsx|VO₂max:',
  'src/features/evaluations/pages/StudentEvaluationsTab.jsx|ml/kg/min',
  // ejemplos para los campos de contenido EN (se muestran en inglés siempre)
  'src/features/exercises/components/ExerciseFormModal.jsx|Barbell squat',
  'src/features/exercises/components/ExerciseFormModal.jsx|E.g.: Horizontal dumbbell press from the floor. Targets chest and triceps.',
  'src/features/exercises/components/ExerciseFormModal.jsx|E.g.: Lie on your back with knees bent. Lower under control until your elbows touch the fl',
  'src/features/forms/intake/components/coach/IntroEditor.jsx|Welcome! 👋 ...',
  'src/features/forms/intake/components/coach/QuestionEditor.jsx|What is your...?',
  'src/features/forms/intake/components/coach/QuestionEditor.jsx|Option 1\nOption 2\nOption 3',
  'src/features/forms/pages/FollowUpFormBuilderPage.jsx|E.g.: Mid-plan check-in',
  // nombre de cada idioma en su propio idioma
  'src/features/forms/intake/components/coach/FormBuilder.jsx|🇪🇸 Español',
  'src/features/forms/intake/components/coach/FormBuilder.jsx|🇬🇧 English',
  'src/features/reports/pages/ClientReportPage.jsx|Español',
  'src/features/reports/pages/ClientReportPage.jsx|English',
  'src/features/reports/pages/ClientReportPage.jsx|· Coach: …',
  // falsos positivos (códigos, opciones de librerías)
  'src/features/students/components/StudentProgressTableView.jsx|en-US',
  'src/features/students/components/StudentProgressTableView.jsx|es-AR',
  'src/features/students/tabs/StudentProgressTab.jsx|insideTopRight',
]

describe('texto hardcodeado', () => {
  it('no aparece texto visible fuera de t() (salvo excepciones listadas)', () => {
    const out = execFileSync('node', ['scripts/find-hardcoded-es.mjs', 'src', '--json'], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    })
    const hits = JSON.parse(out).map((h) => `${h.file}|${h.text}`)
    const unexpected = hits.filter((h) => !ALLOWED.includes(h))
    expect(unexpected, 'Texto hardcodeado nuevo: pasalo por t()').toEqual([])
  }, 60000)
})
