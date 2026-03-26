import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Dumbbell, Plus, Search, Edit2, Trash2, X, Save, AlertCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const MUSCLE_GROUPS = [
  'Piernas', 'Glúteos', 'Espalda', 'Pecho', 'Hombros', 'Bíceps', 'Tríceps',
  'Core/Abdomen', 'Activación/Movilidad', 'Cardio', 'Cuerpo completo'
]

function ExerciseModal({ exercise, onSave, onClose }) {
  const { profile } = useAuth()
  const [form, setForm] = useState(exercise || {
    name: '', description: '', muscle_group: '', video_url: '',
    default_sets: '', default_reps: '', default_weight: '', technique_notes: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSave() {
    if (!form.name) { setError('El nombre es obligatorio'); return }
    setLoading(true)
    try {
      const data = {
        ...form,
        default_sets: form.default_sets ? parseInt(form.default_sets) : null,
        created_by: profile.id,
      }
      let result
      if (form.id) {
        result = await supabase.from('exercises').update(data).eq('id', form.id).select().single()
      } else {
        result = await supabase.from('exercises').insert(data).select().single()
      }
      if (result.error) throw result.error
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
            <input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Sentadilla con barra" />
          </div>
          <div>
            <label className="label">Grupo muscular</label>
            <select className="input" value={form.muscle_group} onChange={e => setForm(p => ({ ...p, muscle_group: e.target.value }))}>
              <option value="">Seleccionar...</option>
              {MUSCLE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Video URL</label>
            <input className="input" value={form.video_url} onChange={e => setForm(p => ({ ...p, video_url: e.target.value }))} placeholder="https://youtube.com/..." />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label">Series</label>
              <input type="number" className="input" value={form.default_sets} onChange={e => setForm(p => ({ ...p, default_sets: e.target.value }))} placeholder="3" />
            </div>
            <div>
              <label className="label">Reps</label>
              <input className="input" value={form.default_reps} onChange={e => setForm(p => ({ ...p, default_reps: e.target.value }))} placeholder="10" />
            </div>
            <div>
              <label className="label">Peso</label>
              <input className="input" value={form.default_weight} onChange={e => setForm(p => ({ ...p, default_weight: e.target.value }))} placeholder="kg" />
            </div>
          </div>
          <div>
            <label className="label">Notas técnicas</label>
            <textarea className="input resize-none" rows={3} value={form.technique_notes} onChange={e => setForm(p => ({ ...p, technique_notes: e.target.value }))} placeholder="Descripción técnica del ejercicio..." />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-3 text-sm">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="btn-secondary flex-1 text-sm">Cancelar</button>
            <button onClick={handleSave} disabled={loading} className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5">
              {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Save size={14} />Guardar</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ExercisesLibraryPage() {
  const [exercises, setExercises] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterGroup, setFilterGroup] = useState('')
  const [modalExercise, setModalExercise] = useState(null)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => { fetchExercises() }, [])

  async function fetchExercises() {
    const { data } = await supabase.from('exercises').select('*').order('name')
    setExercises(data || [])
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
  }

  const filtered = exercises.filter(e =>
    (!search || e.name?.toLowerCase().includes(search.toLowerCase())) &&
    (!filterGroup || e.muscle_group === filterGroup)
  )

  const groups = [...new Set(exercises.map(e => e.muscle_group).filter(Boolean))]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ejercicios</h1>
          <p className="text-sm text-gray-500">{exercises.length} en la biblioteca</p>
        </div>
        <button
          onClick={() => { setModalExercise(null); setShowModal(true) }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} />
          <span className="hidden sm:inline">Nuevo ejercicio</span>
        </button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto min-w-32" value={filterGroup} onChange={e => setFilterGroup(e.target.value)}>
          <option value="">Todos</option>
          {groups.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
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
          {filtered.map(ex => (
            <div key={ex.id} className="card flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Dumbbell size={18} className="text-gray-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-900 truncate">{ex.name}</p>
                <p className="text-xs text-gray-500">
                  {ex.muscle_group || 'Sin grupo'}
                  {ex.default_sets && ` · ${ex.default_sets} series`}
                  {ex.default_reps && ` × ${ex.default_reps}`}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => { setModalExercise(ex); setShowModal(true) }} className="btn-ghost p-2">
                  <Edit2 size={15} className="text-gray-500" />
                </button>
                <button onClick={() => deleteExercise(ex.id)} className="btn-ghost p-2">
                  <Trash2 size={15} className="text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ExerciseModal
          exercise={modalExercise}
          onSave={handleSaved}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
