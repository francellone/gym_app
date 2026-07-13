import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Dumbbell, Plus, Search, Edit2, Trash2, X, Save, AlertCircle, Tag } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { WEIGHT_MODES, WEIGHT_MODE_BY_KEY } from '@/features/plans/helpers'
import { useCoachFormLanguages } from '@/features/forms/hooks/useCoachFormLanguages'

// Colores predefinidos para etiquetas
const PRESET_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#64748b',
]

// ============================================================
// Modal para crear/editar etiquetas
// ============================================================
function TagManagerModal({ coachId, tags, onClose, onRefresh }) {
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function createTag() {
    if (!newName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const { error: e } = await supabase.from('exercise_tags').insert({
        coach_id: coachId,
        name: newName.trim(),
        color: newColor,
      })
      if (e) throw e
      setNewName('')
      onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteTag(tagId) {
    if (!confirm('¿Eliminar esta etiqueta? Se quitará de todos los ejercicios.')) return
    await supabase.from('exercise_tags').delete().eq('id', tagId)
    onRefresh()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Gestionar etiquetas</h2>
          <button onClick={onClose} className="btn-ghost p-1.5">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Nueva etiqueta */}
          <div className="space-y-2">
            <label className="label">Nueva etiqueta</label>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="Nombre (ej: Cuádriceps, Cadena posterior...)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createTag()}
              />
              <button
                onClick={createTag}
                disabled={!newName.trim() || saving}
                className="btn-primary px-3"
              >
                <Plus size={16} />
              </button>
            </div>

            {/* Selector de color */}
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className={`w-7 h-7 rounded-full transition-transform ${
                    newColor === c ? 'scale-125 ring-2 ring-offset-2 ring-gray-400' : ''
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>

            {/* Preview */}
            {newName && (
              <span
                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: newColor }}
              >
                {newName}
              </span>
            )}
          </div>

          {error && <div className="text-red-600 text-sm bg-red-50 rounded-xl p-3">{error}</div>}

          {/* Lista de etiquetas existentes */}
          <div className="space-y-2">
            <label className="label">Tus etiquetas ({tags.length})</label>
            {tags.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Aún no creaste etiquetas</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <div
                    key={tag.id}
                    className="flex items-center gap-1 rounded-full pl-3 pr-1 py-1 text-xs font-medium text-white"
                    style={{ backgroundColor: tag.color }}
                  >
                    {tag.name}
                    <button
                      onClick={() => deleteTag(tag.id)}
                      className="w-4 h-4 rounded-full bg-white/30 hover:bg-white/50 flex items-center justify-center ml-1"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Modal para crear/editar ejercicio
// ============================================================
function ExerciseModal({ exercise, tags, coachId: _coachId, onSave, onClose }) {
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
  const [selectedTags, setSelectedTags] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingTags, setLoadingTags] = useState(!!exercise?.id)
  const [error, setError] = useState(null)

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
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Sentadilla con barra"
            />
          </div>

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
                No tenés etiquetas creadas. Usá el botón "Etiquetas" para crear las tuyas.
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
            <textarea
              className="input resize-none"
              rows={2}
              value={form.description || ''}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Descripción breve..."
            />
          </div>

          <div>
            <label className="label">Notas técnicas</label>
            <textarea
              className="input resize-none"
              rows={3}
              value={form.technique_notes || ''}
              onChange={(e) => setForm((p) => ({ ...p, technique_notes: e.target.value }))}
              placeholder="Descripción técnica del ejercicio..."
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
                <label className="label">Description</label>
                <textarea
                  className="input resize-none"
                  rows={2}
                  value={en.description}
                  onChange={(e) => setEn((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Short description..."
                />
              </div>
              <div>
                <label className="label">Technique notes</label>
                <textarea
                  className="input resize-none"
                  rows={3}
                  value={en.technique_notes}
                  onChange={(e) => setEn((p) => ({ ...p, technique_notes: e.target.value }))}
                  placeholder="Technique cues..."
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
              disabled={loading || loadingTags}
              className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5"
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

// ============================================================
// Página principal de biblioteca de ejercicios
// ============================================================
export default function ExercisesLibraryPage() {
  const { profile } = useAuth()
  const [exercises, setExercises] = useState([])
  const [tags, setTags] = useState([])
  const [exerciseTagMap, setExerciseTagMap] = useState({}) // exerciseId → [tagId, ...]
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [filterMode, setFilterMode] = useState('') // '' | 'with_weight' | 'barbell_only' | 'bodyweight'
  const [filterIncomplete, setFilterIncomplete] = useState(false) // solo ejercicios sin video o sin nota
  const [modalExercise, setModalExercise] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [showTagManager, setShowTagManager] = useState(false)

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    const [exRes, tagRes, assignRes] = await Promise.all([
      supabase.from('exercises').select('*').order('name'),
      supabase.from('exercise_tags').select('*').order('name'),
      supabase
        .from('exercise_tag_assignments')
        .select('exercise_id, tag_id, tag:exercise_tags!tag_id(id, name, color)'),
    ])

    setExercises(exRes.data || [])
    setTags(tagRes.data || [])

    // Build map exerciseId → tags[]
    const map = {}
    ;(assignRes.data || []).forEach((a) => {
      if (!map[a.exercise_id]) map[a.exercise_id] = []
      if (a.tag) map[a.exercise_id].push(a.tag)
    })
    setExerciseTagMap(map)
    setLoading(false)
  }

  async function deleteExercise(id) {
    if (!confirm('¿Eliminar este ejercicio?')) return
    await supabase.from('exercises').delete().eq('id', id)
    setExercises((prev) => prev.filter((e) => e.id !== id))
  }

  function handleSaved(exercise) {
    setExercises((prev) => {
      const idx = prev.findIndex((e) => e.id === exercise.id)
      if (idx >= 0) return prev.map((e, i) => (i === idx ? exercise : e))
      return [...prev, exercise].sort((a, b) => a.name.localeCompare(b.name))
    })
    setShowModal(false)
    // Reload tag assignments
    fetchAll()
  }

  // Filtrar ejercicios por texto, etiqueta o modo de peso
  const filtered = exercises.filter((e) => {
    const matchSearch =
      !search ||
      e.name?.toLowerCase().includes(search.toLowerCase()) ||
      (exerciseTagMap[e.id] || []).some((t) => t.name?.toLowerCase().includes(search.toLowerCase()))
    const matchTag = !filterTag || (exerciseTagMap[e.id] || []).some((t) => t.id === filterTag)
    const exMode = e.default_weight_mode || 'with_weight'
    const matchMode = !filterMode || exMode === filterMode
    const isIncomplete = !e.video_url || (!e.description && !e.technique_notes)
    const matchIncomplete = !filterIncomplete || isIncomplete
    return matchSearch && matchTag && matchMode && matchIncomplete
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ejercicios</h1>
          <p className="text-sm text-gray-500">{exercises.length} en la biblioteca</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowTagManager(true)}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <Tag size={15} />
            <span className="hidden sm:inline">Etiquetas</span>
          </button>
          <button
            onClick={() => {
              setModalExercise(null)
              setShowModal(true)
            }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Nuevo ejercicio</span>
          </button>
        </div>
      </div>

      {/* Búsqueda + filtro por etiqueta */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Buscar por nombre o etiqueta..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {tags.length > 0 && (
          <select
            className="input w-auto min-w-36"
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
          >
            <option value="">Todas las etiquetas</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <select
          className="input w-auto min-w-32"
          value={filterMode}
          onChange={(e) => setFilterMode(e.target.value)}
        >
          <option value="">Todos los modos</option>
          {WEIGHT_MODES.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setFilterIncomplete((v) => !v)}
          className={`flex items-center gap-1.5 px-3 rounded-xl text-sm font-medium border transition-colors ${
            filterIncomplete
              ? 'bg-red-50 border-red-200 text-red-600'
              : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
          title="Mostrar solo ejercicios sin video o sin nota"
        >
          <AlertCircle size={15} />
          <span className="hidden sm:inline">Solo incompletos</span>
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card animate-pulse h-16" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <Dumbbell className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500">No hay ejercicios</p>
          <button
            onClick={() => setShowModal(true)}
            className="btn-primary inline-flex items-center gap-2 mt-3"
          >
            <Plus size={16} /> Crear ejercicio
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((ex) => {
            const exTags = exerciseTagMap[ex.id] || []
            return (
              <div key={ex.id} className="card flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Dumbbell size={18} className="text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-semibold text-sm text-gray-900 truncate">{ex.name}</p>
                    {(() => {
                      const mode = ex.default_weight_mode || 'with_weight'
                      if (mode === 'bodyweight') {
                        return (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                            BW
                          </span>
                        )
                      }
                      if (mode === 'barbell_only') {
                        return (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            Barra
                          </span>
                        )
                      }
                      return null
                    })()}
                    {ex.default_unilateral && (
                      <span
                        title="Unilateral (cada lado)"
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700"
                      >
                        Unilat.
                      </span>
                    )}
                    {!ex.video_url && (
                      <span
                        title="Falta video"
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600"
                      >
                        Sin video
                      </span>
                    )}
                    {!ex.description && !ex.technique_notes && (
                      <span
                        title="Falta descripción / nota técnica"
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600"
                      >
                        Sin nota
                      </span>
                    )}
                  </div>
                  {exTags.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {exTags.map((tag) => (
                        <span
                          key={tag.id}
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                          style={{ backgroundColor: tag.color }}
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">Sin etiquetas</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => {
                      setModalExercise(ex)
                      setShowModal(true)
                    }}
                    className="btn-ghost p-2"
                  >
                    <Edit2 size={15} className="text-gray-500" />
                  </button>
                  <button onClick={() => deleteExercise(ex.id)} className="btn-ghost p-2">
                    <Trash2 size={15} className="text-red-400" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <ExerciseModal
          exercise={modalExercise}
          tags={tags}
          coachId={profile?.id}
          onSave={handleSaved}
          onClose={() => setShowModal(false)}
        />
      )}

      {showTagManager && (
        <TagManagerModal
          coachId={profile?.id}
          tags={tags}
          onClose={() => setShowTagManager(false)}
          onRefresh={fetchAll}
        />
      )}
    </div>
  )
}
