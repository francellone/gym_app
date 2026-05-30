import { MessageSquare, PlayCircle } from 'lucide-react'
import { calc1RM, METHODS, pruebaTypeInfo } from '../../helpers'
import { getDynamicSections } from '@/features/plans/helpers'

// ============================================================
// EvalByDayForm — formulario de la alumna para evals exercise-based (doc 38)
// ------------------------------------------------------------
// Recibe los ejercicios agrupados por día (section) y, por cada uno,
// despacha el input según su `eval_type` (one_rm / max_reps / custom).
//
// Props:
//   exercisesByDay   { day_a: [pe], day_b: [pe], ... } (filas de plan_exercises
//                     con join exercises(name, video_url) + eval_type/eval_method)
//   sessionsPerWeek  número de días → para los tabs (getDynamicSections)
//   responses        map plan_exercise_id → { ...jsonb, comment }
//   onChange(peId, field, value)
// ============================================================
export default function EvalByDayForm({ exercisesByDay, sessionsPerWeek, responses, onChange }) {
  const sections = getDynamicSections(sessionsPerWeek, false).filter(
    (s) => (exercisesByDay[s.id] || []).length > 0
  )

  if (sections.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-4">
        Esta evaluación no tiene ejercicios configurados. Pedile al coach que los agregue.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {sections.map((s) => (
        <div key={s.id} className="space-y-3">
          {sections.length > 1 && (
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide">{s.label}</h3>
          )}
          {(exercisesByDay[s.id] || []).map((pe) => (
            <ExerciseEvalCard
              key={pe.id}
              pe={pe}
              resp={responses[pe.id] || {}}
              onChange={(field, value) => onChange(pe.id, field, value)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function methodLabel(evalType, methodKey) {
  if (evalType === 'custom') return pruebaTypeInfo(methodKey).label
  const m = (METHODS[evalType] || []).find((x) => x.key === methodKey)
  return m?.label || methodKey || ''
}

function ExerciseEvalCard({ pe, resp, onChange }) {
  const evalType = pe.eval_type || 'custom'
  const name = pe.exercises?.name || pe.exercise?.name || 'Ejercicio'
  const videoUrl = pe.exercises?.video_url || pe.exercise?.video_url || null

  return (
    <div className="border-2 border-gray-100 rounded-2xl overflow-hidden">
      <div className="bg-gray-50 px-4 py-2.5 flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-semibold text-gray-800">{name}</p>
            {videoUrl && videoUrl.startsWith('http') && (
              <a
                href={videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 text-blue-500 hover:bg-blue-50 rounded-lg flex-shrink-0"
                title="Ver video del ejercicio"
              >
                <PlayCircle size={16} />
              </a>
            )}
            <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
              {methodLabel(evalType, pe.eval_method)}
            </span>
            {pe.mandatory && (
              <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                Obligatorio
              </span>
            )}
          </div>
          {pe.instructions && <p className="text-xs text-gray-500 mt-0.5">{pe.instructions}</p>}
          {pe.expected_value && (
            <p className="text-xs text-blue-500 mt-0.5">
              Esperado:{' '}
              <strong>
                {pe.expected_value} {pe.expected_unit}
              </strong>
            </p>
          )}
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        <ExerciseInput
          evalType={evalType}
          method={pe.eval_method}
          resp={resp}
          onChange={onChange}
        />

        <div>
          <label className="text-xs text-gray-500 flex items-center gap-1 mb-1">
            <MessageSquare size={12} /> Tu comentario (opcional)
          </label>
          <textarea
            className="input resize-none text-sm"
            rows={2}
            placeholder="¿Cómo te sentiste?"
            value={resp.comment || ''}
            onChange={(e) => onChange('comment', e.target.value)}
          />
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Input por ejercicio según eval_type
// ============================================================
function ExerciseInput({ evalType, method, resp, onChange }) {
  if (evalType === 'one_rm') {
    const m = method || 'brzycki'
    const oneRm = calc1RM(m, resp.weight_kg, resp.reps)
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label text-xs">Peso (kg)</label>
            <input
              type="number"
              step="0.5"
              min="0"
              className="input text-lg font-bold"
              placeholder="80"
              value={resp.weight_kg || ''}
              onChange={(e) => {
                const w = e.target.value
                onChange('weight_kg', w)
                onChange('one_rm_estimated', calc1RM(m, w, resp.reps))
              }}
            />
          </div>
          <div>
            <label className="label text-xs">Reps</label>
            <input
              type="number"
              min="1"
              className="input text-lg font-bold"
              placeholder="6"
              value={resp.reps || ''}
              onChange={(e) => {
                const r = e.target.value
                onChange('reps', r)
                onChange('one_rm_estimated', calc1RM(m, resp.weight_kg, r))
              }}
            />
          </div>
        </div>
        {oneRm != null && (
          <div className="bg-red-50 rounded-xl p-2.5 text-center">
            <p className="text-lg font-bold text-red-700">
              {oneRm} <span className="text-xs font-normal">kg</span>
            </p>
            <p className="text-xs text-red-500">1RM estimado ({methodLabel('one_rm', m)})</p>
          </div>
        )}
      </div>
    )
  }

  if (evalType === 'max_reps') {
    return (
      <div>
        <label className="label text-xs">Repeticiones máximas</label>
        <div className="flex gap-2 items-center">
          <input
            type="number"
            min="0"
            className="input flex-1 text-lg font-bold"
            placeholder="0"
            value={resp.reps || ''}
            onChange={(e) => onChange('reps', e.target.value)}
          />
          <span className="text-sm text-gray-400">reps</span>
        </div>
      </div>
    )
  }

  // custom (libre / reps / tiempo / peso / distancia / movilidad / tecnica / video)
  const typeInfo = pruebaTypeInfo(method)
  return (
    <CustomInput
      testType={method}
      typeInfo={typeInfo}
      value={resp.value || ''}
      unit={resp.unit ?? typeInfo.unit ?? ''}
      onChangeValue={(v) => onChange('value', v)}
      onChangeUnit={(u) => onChange('unit', u)}
    />
  )
}

// Reusa la misma lógica de inputs que CustomForm (PruebaInput).
function CustomInput({ testType, typeInfo, value, unit, onChangeValue, onChangeUnit }) {
  switch (testType) {
    case 'reps':
      return (
        <div>
          <label className="label text-xs">Repeticiones</label>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              className="input flex-1 text-lg font-bold"
              placeholder="0"
              value={value}
              onChange={(e) => onChangeValue(e.target.value)}
            />
            <span className="text-sm text-gray-400">reps</span>
          </div>
        </div>
      )
    case 'tiempo':
      return (
        <div>
          <label className="label text-xs">Tiempo (segundos)</label>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              step="0.1"
              className="input flex-1 text-lg font-bold"
              placeholder="0.0"
              value={value}
              onChange={(e) => onChangeValue(e.target.value)}
            />
            <span className="text-sm text-gray-400">seg</span>
          </div>
        </div>
      )
    case 'distancia':
      return (
        <div>
          <label className="label text-xs">Distancia</label>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              step="0.01"
              className="input flex-1 text-lg font-bold"
              placeholder="0.00"
              value={value}
              onChange={(e) => onChangeValue(e.target.value)}
            />
            <input
              className="input w-20 text-sm"
              placeholder="m"
              value={unit}
              onChange={(e) => onChangeUnit(e.target.value)}
            />
          </div>
        </div>
      )
    case 'peso':
      return (
        <div>
          <label className="label text-xs">Peso (kg)</label>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              step="0.5"
              className="input flex-1 text-lg font-bold"
              placeholder="0"
              value={value}
              onChange={(e) => onChangeValue(e.target.value)}
            />
            <span className="text-sm text-gray-400">kg</span>
          </div>
        </div>
      )
    case 'movilidad':
      return (
        <div>
          <label className="label text-xs">Medición (cm)</label>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              step="0.1"
              className="input flex-1 text-lg font-bold"
              placeholder="0.0"
              value={value}
              onChange={(e) => onChangeValue(e.target.value)}
            />
            <span className="text-sm text-gray-400">cm</span>
          </div>
        </div>
      )
    case 'tecnica': {
      const numVal = parseInt(value) || 0
      return (
        <div>
          <label className="label text-xs">Puntaje técnica (1–10)</label>
          <div className="flex gap-1.5 flex-wrap">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onChangeValue(String(n))}
                className={`flex-1 min-w-[2rem] py-2 rounded-xl text-sm font-bold border-2 transition-all ${
                  numVal === n
                    ? 'border-purple-500 bg-purple-600 text-white'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )
    }
    case 'video':
      return (
        <div>
          <label className="label text-xs">Link del video</label>
          <input
            type="url"
            className="input"
            placeholder="https://..."
            value={value}
            onChange={(e) => onChangeValue(e.target.value)}
          />
        </div>
      )
    default: // libre
      return (
        <div>
          <label className="label text-xs">Respuesta</label>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder={typeInfo.placeholder || 'Escribí tu respuesta...'}
              value={value}
              onChange={(e) => onChangeValue(e.target.value)}
            />
            <input
              className="input w-20 text-sm"
              placeholder="unidad"
              value={unit}
              onChange={(e) => onChangeUnit(e.target.value)}
            />
          </div>
        </div>
      )
  }
}
