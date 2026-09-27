import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import {
  Dumbbell,
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  AlertCircle,
  Tag,
  Archive,
  ArchiveRestore,
  GitMerge,
  Copy,
} from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { WEIGHT_MODES } from '@/features/plans/helpers'
import ExerciseFormModal from '../components/ExerciseFormModal'
import MergeExerciseModal from '../components/MergeExerciseModal'
import { fetchUsage, isReferenced, usageSummary } from '../exerciseUsage'
import { filledSummary } from '../mergeFill'
import DuplicatesModal from '../components/DuplicatesModal'

// Colores predefinidos para etiquetas
const PRESET_COLORS = [
  // Paleta del manual de identidad (2026-09-27): ciruela, rojo, naranja,
  // ámbar, verde, niebla y gris cálido. Las etiquetas ya creadas conservan
  // el color que tenían.
  '#834f72',
  '#9c6589',
  '#dc2626',
  '#ea580c',
  '#fdba74',
  '#d97706',
  '#16a34a',
  '#4a6b80',
  '#3d5869',
  '#76675d',
]

// ============================================================
// Modal para crear/editar etiquetas
// ============================================================
function TagManagerModal({ coachId, tags, onClose, onRefresh }) {
  const { t } = useTranslation()
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
    if (!confirm(t('coach.exercises.tagManager.confirmDelete'))) return
    await supabase.from('exercise_tags').delete().eq('id', tagId)
    onRefresh()
  }

  return (
    <div className="fixed inset-0 bg-tinta/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">{t('coach.exercises.tagManager.title')}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Nueva etiqueta */}
          <div className="space-y-2">
            <label className="label">{t('coach.exercises.tagManager.newTag')}</label>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder={t('coach.exercises.tagManager.namePlaceholder')}
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
            <label className="label">
              {t('coach.exercises.tagManager.yourTags', { count: tags.length })}
            </label>
            {tags.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                {t('coach.exercises.tagManager.empty')}
              </p>
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
// Página principal de biblioteca de ejercicios
// ============================================================
export default function ExercisesLibraryPage() {
  const { t } = useTranslation()
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
  // v46 (decisión D2): el catálogo no se borra, se archiva o se fusiona.
  const [showArchived, setShowArchived] = useState(false)
  const [mergeFrom, setMergeFrom] = useState(null) // { from, into? }
  const [showDuplicates, setShowDuplicates] = useState(false)
  const [coachNames, setCoachNames] = useState({}) // id → nombre (etiqueta de dueño)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    const [exRes, tagRes, assignRes, coachRes] = await Promise.all([
      supabase.from('exercises').select('*').order('name'),
      supabase.from('exercise_tags').select('*').order('name'),
      supabase
        .from('exercise_tag_assignments')
        .select('exercise_id, tag_id, tag:exercise_tags!tag_id(id, name, color)'),
      supabase.from('profiles').select('id, name').eq('role', 'coach'),
    ])

    setExercises(exRes.data || [])
    setTags(tagRes.data || [])
    // Etiqueta "de <coach>" cuando el ejercicio lo creó otra cuenta (decisión D3).
    setCoachNames(Object.fromEntries((coachRes.data || []).map((c) => [c.id, c.name])))
    setRefreshKey((k) => k + 1)

    // Build map exerciseId → tags[]
    const map = {}
    ;(assignRes.data || []).forEach((a) => {
      if (!map[a.exercise_id]) map[a.exercise_id] = []
      if (a.tag) map[a.exercise_id].push(a.tag)
    })
    setExerciseTagMap(map)
    setLoading(false)
  }

  async function deleteExercise(ex) {
    const id = ex.id

    // Decisión D2: "Eliminar" solo existe para lo que nadie referencia. Las FKs
    // de las tablas de hechos son ON DELETE RESTRICT (v41/v45) y las de planes
    // CASCADE, así que un ejercicio con cualquier uso se archiva, no se borra.
    let usage = null
    try {
      usage = await fetchUsage(id)
    } catch {
      usage = null
    }
    if (usage && isReferenced(usage)) {
      const partes = usageSummary(usage, t)
      const ok = confirm(
        t('coach.exercises.library.confirmArchiveInUse', {
          name: ex.name,
          parts: partes.join(', '),
        })
      )
      if (ok) await setArchived(ex, true)
      return
    }

    if (!confirm(t('coach.exercises.library.confirmDelete', { name: ex.name }))) return

    // Chequear el resultado: si RLS lo bloquea, el DELETE afecta 0 filas SIN error.
    // Sin este chequeo el ejercicio "desaparecía" de la lista y reaparecía al recargar.
    const { data, error } = await supabase.from('exercises').delete().eq('id', id).select('id')

    if (error) {
      if (error.code === '23503') {
        alert(t('coach.exercises.library.deleteHasLogs', { name: ex.name }))
      } else {
        alert(t('coach.exercises.library.deleteError', { message: error.message }))
      }
      return
    }
    if (!data || data.length === 0) {
      alert(t('coach.exercises.library.deleteNoPermission'))
      return
    }
    setExercises((prev) => prev.filter((e) => e.id !== id))
  }

  async function setArchived(ex, archived) {
    const { data, error } = await supabase.rpc('set_exercise_archived', {
      p_exercise_id: ex.id,
      p_archived: archived,
    })
    if (error) {
      alert(
        t(
          archived
            ? 'coach.exercises.library.archiveError'
            : 'coach.exercises.library.unarchiveError',
          { message: error.message }
        )
      )
      return
    }
    setExercises((prev) => prev.map((e) => (e.id === ex.id ? { ...e, ...data } : e)))
  }

  function handleMerged({ from, into, counts }) {
    setMergeFrom(null)
    const M = 'coach.exercises.library.merged.'
    const partes = []
    if (counts?.plan_exercises) partes.push(t(M + 'planSlots', { count: counts.plan_exercises }))
    if (counts?.workout_logs) partes.push(t(M + 'workouts', { count: counts.workout_logs }))
    const evals = (counts?.eval_responses || 0) + (counts?.eval_tests || 0)
    if (evals) partes.push(t(M + 'evals', { count: evals }))
    if (counts?.notes) partes.push(t(M + 'notes', { count: counts.notes }))
    const completados = filledSummary(counts?.filled, t)
    alert(
      t(M + 'done', { from: from.name, into: into.name }) +
        (partes.length ? t(M + 'moved', { parts: partes.join(', ') }) : '') +
        (completados.length ? t(M + 'filled', { parts: completados.join(', ') }) : '')
    )
    fetchAll()
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
  const exerciseById = Object.fromEntries(exercises.map((e) => [e.id, e]))
  const activeCount = exercises.filter((e) => !e.archived_at).length
  const archivedCount = exercises.length - activeCount

  const filtered = exercises.filter((e) => {
    if (showArchived ? !e.archived_at : !!e.archived_at) return false
    const matchSearch =
      !search ||
      e.name?.toLowerCase().includes(search.toLowerCase()) ||
      (exerciseTagMap[e.id] || []).some((tag) =>
        tag.name?.toLowerCase().includes(search.toLowerCase())
      )
    const matchTag = !filterTag || (exerciseTagMap[e.id] || []).some((tag) => tag.id === filterTag)
    const exMode = e.default_weight_mode || 'with_weight'
    const matchMode = !filterMode || exMode === filterMode
    // "Completo" = video + nota técnica (lo que el alumno necesita sí o sí).
    // La descripción suma pero no descuenta (actualiza Decisión 17, doc 13).
    const isIncomplete = !e.video_url || !e.technique_notes
    const matchIncomplete = !filterIncomplete || isIncomplete
    return matchSearch && matchTag && matchMode && matchIncomplete
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('coach.exercises.library.title')}</h1>
          <p className="text-sm text-gray-500">
            {t('coach.exercises.library.inLibrary', { count: activeCount })}
            {archivedCount > 0 &&
              t('coach.exercises.library.archivedCount', { count: archivedCount })}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowDuplicates(true)}
            className="btn-secondary flex items-center gap-1.5 text-sm"
            title={t('coach.exercises.library.duplicatesTitle')}
          >
            <Copy size={15} />
            <span className="hidden sm:inline">{t('coach.exercises.library.duplicates')}</span>
          </button>
          <button
            onClick={() => setShowTagManager(true)}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <Tag size={15} />
            <span className="hidden sm:inline">{t('coach.exercises.library.tags')}</span>
          </button>
          <button
            onClick={() => {
              setModalExercise(null)
              setShowModal(true)
            }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">{t('coach.exercises.library.newExercise')}</span>
          </button>
        </div>
      </div>

      {/* Búsqueda + filtro por etiqueta */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder={t('coach.exercises.library.searchPlaceholder')}
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
            <option value="">{t('coach.exercises.library.allTags')}</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        )}
        <select
          className="input w-auto min-w-32"
          value={filterMode}
          onChange={(e) => setFilterMode(e.target.value)}
        >
          <option value="">{t('coach.exercises.library.allModes')}</option>
          {WEIGHT_MODES.map((m) => (
            <option key={m.key} value={m.key}>
              {t(`coach.exercises.weightModes.${m.key}`)}
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
          title={t('coach.exercises.library.incompleteTitle')}
        >
          <AlertCircle size={15} />
          <span className="hidden sm:inline">{t('coach.exercises.library.onlyIncomplete')}</span>
        </button>
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className={`flex items-center gap-1.5 px-3 rounded-xl text-sm font-medium border transition-colors ${
            showArchived
              ? 'bg-durazno-50 border-durazno-200 text-primary-700'
              : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
          title={t('coach.exercises.library.archivedTitle')}
        >
          <Archive size={15} />
          <span className="hidden sm:inline">
            {archivedCount > 0
              ? t('coach.exercises.library.archivedWithCount', { count: archivedCount })
              : t('coach.exercises.library.archived')}
          </span>
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
          <p className="text-gray-500">
            {showArchived
              ? t('coach.exercises.library.emptyArchived')
              : t('coach.exercises.library.empty')}
          </p>
          <button
            hidden={showArchived}
            onClick={() => setShowModal(true)}
            className="btn-primary inline-flex items-center gap-2 mt-3"
          >
            <Plus size={16} /> {t('coach.exercises.library.createExercise')}
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
                    <p className="font-semibold text-sm text-gray-900 break-words">{ex.name}</p>
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
                            {t('coach.exercises.library.badgeBarbell')}
                          </span>
                        )
                      }
                      return null
                    })()}
                    {ex.default_unilateral && (
                      <span
                        title={t('coach.exercises.library.unilateralTitle')}
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700"
                      >
                        {t('coach.exercises.library.badgeUnilateral')}
                      </span>
                    )}
                    {!ex.video_url && (
                      <span
                        title={t('coach.exercises.library.noVideoTitle')}
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600"
                      >
                        {t('coach.exercises.library.noVideo')}
                      </span>
                    )}
                    {!ex.technique_notes && (
                      <span
                        title={t('coach.exercises.library.noNoteTitle')}
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600"
                      >
                        {t('coach.exercises.library.noNote')}
                      </span>
                    )}
                    {ex.archived_at && (
                      <span
                        title={
                          ex.merged_into_id
                            ? t('coach.exercises.library.mergedIntoTitle', {
                                name: exerciseById[ex.merged_into_id]?.name || '…',
                              })
                            : t('coach.exercises.library.archivedBadgeTitle')
                        }
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-700"
                      >
                        {ex.merged_into_id
                          ? t('coach.exercises.library.mergedInto', {
                              name: exerciseById[ex.merged_into_id]?.name || '…',
                            })
                          : t('coach.exercises.library.archivedBadge')}
                      </span>
                    )}
                    {ex.created_by &&
                      profile?.id &&
                      ex.created_by !== profile.id &&
                      coachNames[ex.created_by] && (
                        <span
                          title={t('coach.exercises.library.otherCoachTitle')}
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700"
                        >
                          {t('coach.exercises.library.byCoach', {
                            name: coachNames[ex.created_by],
                          })}
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
                    <p className="text-xs text-gray-400">{t('coach.exercises.library.noTags')}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {ex.archived_at ? (
                    !ex.merged_into_id && (
                      <button
                        onClick={() => setArchived(ex, false)}
                        className="btn-ghost p-2"
                        title={t('coach.exercises.library.unarchiveTitle')}
                      >
                        <ArchiveRestore size={15} className="text-gray-500" />
                      </button>
                    )
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setModalExercise(ex)
                          setShowModal(true)
                        }}
                        className="btn-ghost p-2"
                        title={t('common.edit')}
                      >
                        <Edit2 size={15} className="text-gray-500" />
                      </button>
                      <button
                        onClick={() => setMergeFrom({ from: ex })}
                        className="btn-ghost p-2"
                        title={t('coach.exercises.library.mergeTitle')}
                      >
                        <GitMerge size={15} className="text-indigo-500" />
                      </button>
                      <button
                        onClick={() => setArchived(ex, true)}
                        className="btn-ghost p-2"
                        title={t('coach.exercises.library.archiveTitle')}
                      >
                        <Archive size={15} className="text-gray-500" />
                      </button>
                      <button
                        onClick={() => deleteExercise(ex)}
                        className="btn-ghost p-2"
                        title={t('coach.exercises.library.deleteTitle')}
                      >
                        <Trash2 size={15} className="text-red-400" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <ExerciseFormModal
          exercise={modalExercise}
          tags={tags}
          existingExercises={exercises.filter((e) => !e.archived_at)}
          onSave={handleSaved}
          onClose={() => setShowModal(false)}
        />
      )}

      {showDuplicates && (
        <DuplicatesModal
          exercises={exercises}
          refreshKey={refreshKey}
          onClose={() => setShowDuplicates(false)}
          onMergeRequest={(from, into) => setMergeFrom({ from, into })}
        />
      )}

      {/* Va después del panel de duplicados para quedar por encima cuando se abre desde ahí */}
      {mergeFrom && (
        <MergeExerciseModal
          from={mergeFrom.from}
          into={mergeFrom.into || null}
          exercises={exercises}
          onClose={() => setMergeFrom(null)}
          onMerged={handleMerged}
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
