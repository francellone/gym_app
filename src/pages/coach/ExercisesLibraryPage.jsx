import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Dumbbell, Plus, Search, Edit2, Trash2, X, Save, AlertCircle, Tag, Settings } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

// Colores predefinidos para etiquetas
const PRESET_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#ef4444','#f97316',
  '#eab308','#22c55e','#14b8a6','#3b82f6','#64748b',
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
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
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
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createTag()}
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
              {PRESET_COLORS.map(c => (
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

          {error && (
            <div className="text-red-600 text-sm bg-red-50 rounded-xl p-3">{error}</div>
          )}

          {/* Lista de etiquetas existentes */}
          <div className="space-y-2">
            <label className="label">Tus etiquetas ({tags.length})</label>
            {tags.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Aún no creaste etiquetas</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => (
                  <div key={tag.id} className="flex items-center gap-1 rounded-full pl-3 pr-1 py-1 text-xs font-medium text-white" style={{ backgroundColor: tag.color }}>
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
function ExerciseModal({ exercise, tags, coachId, onSave, onClose }) {
  const { profile } = useAuth()
  const [form, setForm] = useState(exercise || {
    name: '', description: '', video_url: '', technique_notes: ''
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
          setSelectedTags(data?.map(d => d.tag_id) || [])
          setLoadingTags(false)
        })
    }
  }, [exercise?.id])

  function toggleTag(tagId) {
    setSelectedTags(prev =>
      prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId]
    )
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('El nombre es obligatorio'); return }
    setLoading(true)
    try {
      const data = {
        name: form.name.trim(),
        description: form.description || null,
        video_url: form.video_url || null,
        technique_notes: form.technique_notes || null,
        created_by: profile.id,
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
          await supabase.from('exercise_tag_assignments').insert(
            selectedTags.map(tagId => ({ exercise_id: exerciseId, tag_id: tagId }))
          )
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
          <h2 className="font-bold text-gray-900">{form.id ? 'Editar ejercicio' : 'Nuevo ejercicio'}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="label">Nombre *</label>
            <input
              className="input"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Sentadilla con barra"
            />
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
                {tags.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all border-2 ${
                      selectedTags.includes(tag.id)
                        ? 'text-white border-transparent'
                        : 'bg-white border-gray-200 text-gray-500'
                    }`}
                    style={selectedTags.includes(tag.id) ? { backgroundColor: tag.color, borderColor: tag.color } : {}}
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
              onChange={e => setForm(p => ({ ...p, video_url: e.target.value }))}
              placeholder="https://youtube.com/..."
            />
          </div>

          <div>
            <label className="label">Descripción</label>
            <textarea
              className="input resize-none"
              rows={2}
              value={form.description || ''}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Descripción breve..."
            />
          </div>

          <div>
            <label className="label">Notas técnicas</label>
            <textarea
              className="input resize-none"
              rows={3}
              value={form.technique_notes || ''}
              onChange={e => setForm(p => ({ ...p, technique_notes: e.target.value }))}
              placeholder="Descripción técnica del ejercicio..."
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-3 text-sm">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="btn-secondary flex-1 text-sm">Cancelar</button>
            <button
              onClick={handleSave}
              disabled={loading || loadingTags}
              className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5"
            >
              {loading
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <><Save size={14} />Guardar</>
              }
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
  const [modalExercise, setModalExercise] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [showTagManager, setShowTagManager] = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [exRes, tagRes, assignRes] = await Promise.all([
      supabase.from('exercises').select('*').order('name'),
      supabase.from('exercise_tags').select('*').order('name'),
      supabase.from('exercise_tag_assignments').select('exercise_id, tag_id, tag:exercise_tags!tag_id(id, name, color)'),
    ])

    setExercises(exRes.data || [])
    setTags(tagRes.data || [])

    // Build map exerciseId → tags[]
    const map = {}
    ;(assignRes.data || []).forEach(a => {
      if (!map[a.exercise_id]) map[a.exercise_id] = []
      if (a.tag) map[a.exercise_id].push(a.tag)
    })
    setExerciseTagMap(map)
    setLoading(false)
  }

  async function deleteExercise(id) {
    if (!confirm('¿Eliminar este ejercicio?')) return
    await supabase.from('exercises').delete().eq('id', id)
    setExercises(prev => prev.filter(e => e.id !== id))
  }

  function handleSaved(exercise) {
    setExercises(prev => {
      const idx = prev.findIndex(e => e.id === exercise.id)
      if (idx >= 0) return prev.map((e, i) => i === idx ? exercise : e)
      return [...prev, exercise].sort((a, b) => a.name.localeCompare(b.name))
    })
    setShowModal(false)
    // Reload tag assignments
    fetchAll()
  }

  // Filtrar ejercicios por texto o etiqueta
  const filtered = exercises.filter(e => {
    const matchSearch = !search ||
      e.name?.toLowerCase().includes(search.toLowerCase()) ||
      (exerciseTagMap[e.id] || []).some(t => t.name?.toLowerCase().includes(search.toLowerCase()))
    const matchTag = !filterTag || (exerciseTagMap[e.id] || []).some(t => t.id === filterTag)
    return matchSearch && matchTag
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
            onClick={() => { setModalExercise(null); setShowModal(true) }}
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
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {tags.length > 0 && (
          <select
            className="input w-auto min-w-36"
            value={filterTag}
            onChange={e => setFilterTag(e.target.value)}
          >
            <option value="">Todas las etiquetas</option>
            {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4].map(i => <div key={i} className="card animate-pulse h-16" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <Dumbbell className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500">No hay ejercicios</p>
          <button onClick={() => setShowModal(true)} className="btn-primary inline-flex items-center gap-2 mt-3">
            <Plus size={16} /> Crear ejercicio
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(ex => {
            const exTags = exerciseTagMap[ex.id] || []
            return (
              <div key={ex.id} className="card flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Dumbbell size={18} className="text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900 truncate">{ex.name}</p>
                  {exTags.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {exTags.map(tag => (
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
                    onClick={() => { setModalExercise(ex); setShowModal(true) }}
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
