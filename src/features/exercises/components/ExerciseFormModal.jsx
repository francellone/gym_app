import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { X, Save, AlertCircle, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { WEIGHT_MODES, WEIGHT_MODE_BY_KEY } from '@/features/plans/helpers'
import { useCoachFormLanguages } from '@/features/forms/hooks/useCoachFormLanguages'
import { findDuplicateByName } from '../exercise-name'

// ============================================================
// Modal para crear/editar un ejercicio del catálogo.
// ------------------------------------------------------------
// Vivía adentro de ExercisesLibraryPage. Se extrajo para poder reusarlo
// tal cual desde el armador de planes (ExercisePicker) — una sola fuente
// de verdad, así no se desincronizan los campos como pasó con las run cards.
//
// Props:
//   exercise            ejercicio a editar (null = crear uno nuevo)
//   tags                etiquetas del coach [{id, name, color}]
//   existingExercises   catálogo, sólo para avisar de nombres duplicados
//   defaultTagIds       etiquetas preseleccionadas al crear (ej: el filtro activo)
//   onSave(exercise)    se llama con la fila guardada
//   onClose()
// ============================================================
export default function ExerciseFormModal({
  exercise,
  tags = [],
  existingExercises = [],
  defaultTagIds = [],
  onSave,
  onClose,
}) {
  const { profile } = useAuth()
  const { bilingual } = useCoachFormLanguages()
  const [form, setForm] = useState(
    exercise || {
      name: '',
      description: '',
      video_url: '',
      technique_notes: '',
      default_weight_mode: 'with_weight',
      default_unilateral: false,
    }
  )
  // Traducción EN opcional (patrón canónico + i18n, igual que formularios)
  const [en, setEn] = useState({
    name: exercise?.i18n?.en?.name || '',
    description: exercise?.i18n?.en?.description || '',
    technique_notes: exercise?.i18n?.en?.technique_notes || '',
  })
  const [selectedTags, setSelectedTags] = useState(exercise?.id ? [] : defaultTagIds)
  const [loading, setLoading] = useState(false)
  const [loadingTags, setLoadingTags] = useState(!!exercise?.id)
  const [error, setError] = useState(null)
  // Duplicados: el nombre no tiene índice único en la base, así que avisamos
  // acá y pedimos una confirmación explícita antes de insertar.
  const [dupConfirmed, setDupConfirmed] = useState(false)

  useEffect(() => {
    if (exercise?.id) {
      supabase
        .from('exercise_tag_assignments')
        .select('tag_id')
        .eq('exercise_id', exercise.id)
        .then(({ data }) => {
          setSelectedTags(data?.map((d) => d.tag_id) || [])
          setLoadingTags(false)
        })
    }
  }, [exercise?.id])

  const duplicate = findDuplicateByName(existingExercises, form.name, form.id || null)

  function toggleTag(tagId) {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]
    )
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError('El nombre es obligatorio')
      return
    }
    if (duplicate && !dupConfirmed) {
      setError(null)
      return
    }
    setLoading(true)
    try {
      // i18n.en: solo campos con contenido; sin ninguno => se quita 'en' (fallback total al canónico)
      const enClean = Object.fromEntries(
        Object.entries(en)
          .map(([k, v]) => [k, v.trim()])
          .filter(([, v]) => v !== '')
      )
      const newI18n = { ...(form.i18n || {}) }
      if (Object.keys(enClean).length > 0) newI18n.en = enClean
      else delete newI18n.en
      const data = {
        name: form.name.trim(),
        description: form.description || null,
        video_url: form.video_url || null,
        technique_notes: form.technique_notes || null,
        // OBLIGATORIO: la RLS `coach_manage_own_exercises` es FOR ALL con
        // USING (created_by = auth.uid()) y sin WITH CHECK propio, así que
        // Postgres reusa el USING al insertar. Sin created_by el INSERT se
        // rechaza (y el error es fácil de tragarse).
        created_by: profile.id,
        default_weight_mode: form.default_weight_mode || 'with_weight',
        default_unilateral: !!form.default_unilateral,
        i18n: Object.keys(newI18n).length > 0 ? newI18n : null,
      }
      let exerciseId = form.id
      let result

      if (form.id) {
        result = await supabase.from('exercises').update(data).eq('id', form.id).select().single()
      } else {
        result = await supabase.from('exercises').insert(data).select().single()
        exerciseId = result.data?.id
      }
      if (result.error) throw result.error

      // Sincronizar etiquetas
      if (exerciseId) {
        // Borrar asignaciones actuales y reinsertar
        await supabase.from('exercise_tag_assignments').delete().eq('exercise_id', exerciseId)
        if (selectedTags.length > 0) {
          await supabase
            .from('exercise_tag_assignments')
            .insert(selectedTags.map((tagId) => ({ exercise_id: exerciseId, tag_id: tagId })))
        }
      }

      onSave(result.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const blockedByDuplicate = !!duplicate && !dupConfirmed

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">
            {form.id ? 'Editar ejercicio' : 'Nuevo ejercicio'}
          </h2>
          <button onClick={onClose} className="btn-ghost p-1.5">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="label">Nombre *</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => {
                setForm((p) => ({ ...p, name: e.target.value }))
                setDupConfirmed(false)
              }}
              placeholder="Sentadilla con barra"
              autoFocus={!form.id}
            />
          </div>

          {/* Aviso de duplicado (el nombre no es único en la base) */}
          {duplicate && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
              <div className="space-y-1.5">
                <p>
                  Ya existe un ejercicio con ese nombre: <strong>{duplicate.name}</strong>. Si es el
                  mismo, cerrá y elegilo de la lista.
                </p>
                {!dupConfirmed && (
                  <button
                    type="button"
                    onClick={() => setDupConfirmed(true)}
                    className="text-xs font-semibold underline"
                  >
                    Es otro ejercicio, crearlo igual
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Configuración del ejercicio: modo de peso + unilateral */}
          <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 space-y-2.5">
            <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
              Configuración del ejercicio
            </p>
            <div>
              <label className="label">Modo de peso (default)</label>
              <select
                className="input text-sm"
                value={form.default_weight_mode || 'with_weight'}
                onChange={(e) => setForm((p) => ({ ...p, default_weight_mode: e.target.value }))}
              >
                {WEIGHT_MODES.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-500 mt-1">
                {WEIGHT_MODE_BY_KEY[form.default_weight_mode || 'with_weight']?.description}
              </p>
            </div>
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-primary-600"
                checked={!!form.default_unilateral}
                onChange={(e) => setForm((p) => ({ ...p, default_unilateral: e.target.checked }))}
              />
              <span className="text-sm text-gray-700">
                Unilateral (cada lado)
                <span className="block text-[11px] text-gray-500 font-normal">
                  Si está activo, las reps se cuentan POR LADO, no como total.
                </span>
              </span>
            </label>
          </div>

          {/* Etiquetas personalizadas */}
          <div>
            <label className="label">Etiquetas</label>
            {tags.length === 0 ? (
              <p className="text-xs text-gray-400">
                No tenés etiquetas creadas. Podés crearlas desde la pestaña Ejercicios.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 mt-1">
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all border-2 ${
                      selectedTags.includes(tag.id)
                        ? 'text-white border-transparent'
                        : 'bg-white border-gray-200 text-gray-500'
                    }`}
                    style={
                      selectedTags.includes(tag.id)
                        ? { backgroundColor: tag.color, borderColor: tag.color }
                        : {}
                    }
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="label">Video URL</label>
            <input
              className="input"
              value={form.video_url || ''}
              onChange={(e) => setForm((p) => ({ ...p, video_url: e.target.value }))}
              placeholder="https://youtube.com/..."
            />
          </div>

          <div>
            <label className="label">Descripción</label>
            <p className="text-[11px] text-gray-500 mb-1">
              <strong>Qué es</strong>: qué trabaja, para qué sirve, equipamiento. El alumno la ve
              solo si toca "ver más". Opcional.
            </p>
            <textarea
              className="input resize-none"
              rows={2}
              value={form.description || ''}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Ej: Empuje horizontal con mancuernas desde el piso. Trabaja pecho y tríceps con menor demanda de hombro."
            />
          </div>

          <div>
            <label className="label">Nota técnica</label>
            <p className="text-[11px] text-gray-500 mb-1">
              <strong>Cómo se hace</strong>: posición inicial, ejecución, errores a evitar. El
              alumno la ve siempre al abrir el ejercicio mientras entrena.
            </p>
            <textarea
              className="input resize-none"
              rows={3}
              value={form.technique_notes || ''}
              onChange={(e) => setForm((p) => ({ ...p, technique_notes: e.target.value }))}
              placeholder="Ej: Acostate boca arriba con rodillas flexionadas. Bajá controlado hasta que los codos toquen el piso..."
            />
          </div>

          {/* Traducción al inglés (solo coaches con alumnos bilingües / toggle) */}
          {bilingual && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 space-y-2.5">
              <p className="text-[11px] uppercase tracking-wider text-blue-600 font-semibold">
                🇬🇧 Versión en inglés (opcional)
              </p>
              <p className="text-[11px] text-gray-500 -mt-1.5">
                Los alumnos en inglés ven estos textos. Si dejás un campo vacío, ven el español.
              </p>
              <div>
                <label className="label">Name</label>
                <input
                  className="input"
                  value={en.name}
                  onChange={(e) => setEn((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Barbell squat"
                />
              </div>
              <div>
                <label className="label">Description (qué es)</label>
                <textarea
                  className="input resize-none"
                  rows={2}
                  value={en.description}
                  onChange={(e) => setEn((p) => ({ ...p, description: e.target.value }))}
                  placeholder="E.g.: Horizontal dumbbell press from the floor. Targets chest and triceps."
                />
              </div>
              <div>
                <label className="label">Technique notes (cómo se hace)</label>
                <textarea
                  className="input resize-none"
                  rows={3}
                  value={en.technique_notes}
                  onChange={(e) => setEn((p) => ({ ...p, technique_notes: e.target.value }))}
                  placeholder="E.g.: Lie on your back with knees bent. Lower under control until your elbows touch the floor..."
                />
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-3 text-sm">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="btn-secondary flex-1 text-sm">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={loading || loadingTags || blockedByDuplicate}
              className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Save size={14} />
                  Guardar
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
