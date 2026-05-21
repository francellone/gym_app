import { useState } from 'react'
import { CheckCircle2, Circle, ChevronUp, ChevronDown } from 'lucide-react'
import ExerciseCard from './ExerciseCard'

// ============================================================
// Bloque STRENGTH colapsable (wrapper con header rico)
// ============================================================
// Card colapsable que agrupa los ejercicios de un bloque de fuerza.
// Header muestra título + progreso (X/Y hechos + %); body es la lista
// de ExerciseCard. Los bloques aerobic y circuit tienen sus propios
// run cards (AerobicBlockRunCard, CircuitBlockRunCard).
export default function StrengthBlockRunCard({
  block,
  strengthIndexInSection,
  logs,
  saveLog,
  deleteLog,
}) {
  const [expanded, setExpanded] = useState(false)

  const exercises = (block.plan_exercises || [])
    .slice()
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))

  const total = exercises.length
  const done = exercises.filter((ex) => logs[ex.id]?.completed).length
  const completed = total > 0 && done === total

  // Título del bloque:
  //   - Si el coach le puso título, ese.
  //   - Si hay varios strength en la sección, "Fuerza A/B/C…" (letras).
  //   - Si es el único strength de la sección, simplemente "Fuerza".
  // (El nombre de la sección "Activación" / "Principal Día A" lo da el h2 de arriba.)
  function titleFor() {
    if (block.title) return block.title
    if (strengthIndexInSection > 0) {
      const letter =
        ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'][strengthIndexInSection] ||
        strengthIndexInSection + 1
      return `Fuerza ${letter}`
    }
    return 'Fuerza'
  }

  const title = titleFor()

  return (
    <div
      className={`rounded-2xl border-2 transition-all overflow-hidden ${
        completed ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-white'
      }`}
    >
      {/* Header colapsable */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <div className="flex-shrink-0">
          {completed ? (
            <CheckCircle2 size={24} className="text-green-500" />
          ) : (
            <Circle size={24} className="text-gray-300" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base">💪</span>
            <p
              className={`font-semibold text-sm truncate ${completed ? 'text-green-800' : 'text-gray-900'}`}
            >
              {title}
            </p>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {done} / {total} hechos
            {total > 0 && (
              <span className="ml-2 text-gray-400">· {Math.round((done / total) * 100)}%</span>
            )}
          </p>
        </div>
        {/* Mini progress bar */}
        {total > 0 && !expanded && (
          <div className="hidden sm:block w-14 h-1.5 bg-gray-200 rounded-full overflow-hidden flex-shrink-0">
            <div
              className={`h-full ${completed ? 'bg-green-500' : 'bg-primary-500'} transition-all`}
              style={{ width: `${(done / total) * 100}%` }}
            />
          </div>
        )}
        {expanded ? (
          <ChevronUp size={18} className="text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronDown size={18} className="text-gray-400 flex-shrink-0" />
        )}
      </button>

      {/* Body: lista de ejercicios */}
      {expanded && (
        <div className="border-t border-gray-100 p-3 space-y-2 bg-gray-50/50">
          {exercises.length === 0 && (
            <p className="text-xs text-gray-400 italic text-center py-3">
              Este bloque todavía no tiene ejercicios.
            </p>
          )}
          {exercises.map((ex) => (
            <ExerciseCard
              key={ex.id}
              planEx={ex}
              log={logs[ex.id]}
              onSaveLog={saveLog}
              onDeleteLog={deleteLog}
              suggestedSets={ex.suggested_sets}
            />
          ))}
        </div>
      )}
    </div>
  )
}
