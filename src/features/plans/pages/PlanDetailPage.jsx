import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import {
  ArrowLeft,
  Edit2,
  Users,
  ExternalLink,
  Plus,
  X,
  UserPlus,
  MoreHorizontal,
  Info,
  Trash2,
  Activity,
  Flame,
  Clock,
  Repeat,
  LayoutGrid,
  TrendingUp,
} from 'lucide-react'
import {
  displayReps,
  parseReps,
  getDynamicSections,
  AEROBIC_FORMATS,
  AEROBIC_INTERVAL_FORMATS,
  AEROBIC_ZONES,
  CIRCUIT_TYPES,
  INTENSITY_LEVELS,
  groupExercisesIntoBlocks,
} from '../helpers'
import { format } from 'date-fns'
import DeletePlanModal from '../components/DeletePlanModal'
import PlanProgressTab from './PlanProgressTab'
import { assignTemplateToStudent } from '../assignmentHelpers'

// ── Assign student modal (sin cambios visuales mayores) ─────
//
// Asignar desde la pantalla del PLAN. Si el plan es de training y el
// alumno ya tiene otro training activo, NO hacemos el insert acá (haría
// que se viole el índice único `one_active_training_per_student`).
// Le decimos a la coach que vaya al perfil del alumno y use el flujo
// completo de reemplazo (ReplacePlanModal). Esto evita exponer la misma
// UX duplicada en dos lugares y mantiene consistente la cierre de plan
// saliente con motivo, atajo a duplicar, etc.
//
// La asignación se hace siempre vía RPC `assign_template_to_student`,
// que clona la plantilla a una instancia personal del alumno. Como la
// RPC solo acepta plantillas (is_template=true), el botón "Asignar" se
// oculta cuando el plan es una instancia ya personalizada — esa visita
// no tiene sentido conceptual (no podés asignar el plan de un alumno a
// otro alumno) y además el back lo rechazaría con check_violation.
function AssignStudentModal({ planId, planType, isTemplate, onClose, onDone }) {
  const navigate = useNavigate()
  const [students, setStudents] = useState([])
  const [alreadyAssigned, setAlreadyAssigned] = useState(new Set())
  const [studentsWithActiveTraining, setStudentsWithActiveTraining] = useState(new Set())
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const isTraining = !planType || planType === 'training'

  useEffect(() => {
    const promises = [
      supabase.from('profiles').select('id, name').eq('role', 'student').order('name'),
      supabase
        .from('plan_assignments')
        .select('student_id')
        .eq('plan_id', planId)
        .eq('active', true),
    ]
    if (isTraining) {
      promises.push(
        supabase
          .from('plan_assignments')
          .select('student_id')
          .eq('plan_type', 'training')
          .eq('status', 'active')
      )
    }
    Promise.all(promises).then(([studentsRes, assignRes, activeTrainingsRes]) => {
      setStudents(studentsRes.data || [])
      setAlreadyAssigned(new Set((assignRes.data || []).map((a) => a.student_id)))
      if (activeTrainingsRes) {
        setStudentsWithActiveTraining(
          new Set((activeTrainingsRes.data || []).map((a) => a.student_id))
        )
      }
    })
  }, [planId, isTraining])

  async function handleAssign() {
    if (!selected) return

    // Defensa de UX: si por algún motivo se abre el modal sobre una
    // instancia ya personalizada (is_template=false), avisar y abortar
    // antes de tocar el back. El back igualmente lo rechazaría con
    // check_violation desde la RPC.
    if (isTemplate === false) {
      setError(
        'Este plan ya es una instancia personalizada de un alumno y no se puede asignar a otro. ' +
          'Duplicalo como plantilla nueva si querés reutilizarlo.'
      )
      return
    }

    // Si es training y el alumno ya tiene activo, llevarlo al perfil
    // a usar el flujo completo (con ReplacePlanModal).
    if (isTraining && studentsWithActiveTraining.has(selected)) {
      const goProfile = window.confirm(
        'Este alumno ya tiene un plan de entrenamiento activo. Para reemplazarlo necesitamos que lo gestiones desde el perfil del alumno (con motivo, opción de pausar, etc.). ¿Ir al perfil?'
      )
      if (goProfile) navigate(`/coach/students/${selected}`)
      return
    }

    setSaving(true)
    setError(null)
    try {
      // RPC: clona la plantilla a una instancia personal + crea el
      // plan_assignment apuntando al clon, todo atómico.
      await assignTemplateToStudent(supabase, {
        templateId: planId,
        studentId: selected,
        startDate: format(new Date(), 'yyyy-MM-dd'),
      })
      onDone()
    } catch (err) {
      setError(err.message || 'Error al asignar alumno')
    } finally {
      setSaving(false)
    }
  }

  const filtered = students
    .filter((s) => s.name?.toLowerCase().includes(search.toLowerCase()))
    .filter((s) => !alreadyAssigned.has(s.id))

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <UserPlus size={16} className="text-primary-600" />
            <h2 className="font-bold text-gray-900 text-sm">Asignar alumno</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <input
            type="text"
            className="input"
            placeholder="Buscar alumno..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                {students.length === 0 ? 'No hay alumnos' : 'Todos ya tienen este plan'}
              </p>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelected(s.id === selected ? null : s.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
                    selected === s.id
                      ? 'bg-primary-50 border-2 border-primary-400'
                      : 'bg-gray-50 border-2 border-transparent hover:border-gray-200'
                  }`}
                >
                  <div className="w-7 h-7 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-primary-700 font-semibold text-xs">
                      {s.name?.[0]?.toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-900">{s.name}</span>
                  {selected === s.id && (
                    <div className="ml-auto w-3.5 h-3.5 bg-primary-600 rounded-full" />
                  )}
                </button>
              ))
            )}
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>}
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1 text-sm">
              Cancelar
            </button>
            <button
              onClick={handleAssign}
              disabled={!selected || saving}
              className="btn-primary flex-1 text-sm flex items-center justify-center gap-2"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <UserPlus size={13} /> Asignar
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Helper: bloque → color CSS ──────────────────────────────
function blockStyle(block) {
  if (!block) return { bg: '#f3f4f6', color: '#9ca3af', border: '#e5e7eb' }
  const l = block[0]
  if (l === 'A') return { bg: '#fff7ed', color: '#c2410c', border: '#fcd3a0' }
  if (l === 'B') return { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' }
  if (l === 'C') return { bg: '#f0fdf4', color: '#059669', border: '#a7f3d0' }
  return { bg: '#f5f3ff', color: '#7c3aed', border: '#ddd6fe' }
}

// ── Helper: PSE → color CSS ─────────────────────────────────
function pseStyle(pse) {
  if (!pse) return null
  const n = parseFloat(pse)
  if (n >= 8) return { bg: '#fef2f2', color: '#dc2626' }
  if (n >= 6) return { bg: '#fff7ed', color: '#c2410c' }
  if (n >= 4) return { bg: '#fefce8', color: '#854d0e' }
  return { bg: '#f0fdf4', color: '#059669' }
}

// ── Helper: formatear peso ──────────────────────────────────
function fmtWeight(ex) {
  if (ex.suggested_weights) {
    try {
      const arr = parseReps(ex.suggested_weights).filter((w) => w !== '' && w != null)
      if (arr.length > 0) {
        const unique = [...new Set(arr)]
        return unique.length === 1 ? `${unique[0]} kg` : `${arr.join('/')} kg`
      }
    } catch {}
  }
  if (ex.suggested_weight && ex.suggested_weight !== 'None') return ex.suggested_weight
  return null
}

// ── Fila de ejercicio (tabla) ───────────────────────────────
function ExerciseRow({ ex, onDelete }) {
  const [notesOpen, setNotesOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const hasNotes = !!(ex.extra_notes || ex.exercise?.technique_notes)
  const bStyle = blockStyle(ex.block_label)
  const weight = fmtWeight(ex)

  const repsDisplay = (() => {
    if (!ex.suggested_reps) return null
    return displayReps(ex.suggested_reps)
  })()

  return (
    <>
      <div
        className={`plan-ex-row group ${notesOpen ? 'plan-ex-row--open' : ''}`}
        onClick={() => hasNotes && setNotesOpen((o) => !o)}
      >
        {/* Bloque */}
        <div>
          <span
            className="plan-ex-block"
            style={{ background: bStyle.bg, color: bStyle.color, borderColor: bStyle.border }}
          >
            {ex.block_label || '—'}
          </span>
        </div>

        {/* Nombre */}
        <div className="plan-ex-name">
          <span className="plan-ex-name-text">{ex.exercise?.name || 'Sin ejercicio'}</span>
          <div className="plan-ex-name-actions">
            {hasNotes && (
              <button
                className={`plan-ex-note-btn ${notesOpen ? 'plan-ex-note-btn--on' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setNotesOpen((o) => !o)
                }}
                title="Ver técnica"
              >
                <Info size={9} strokeWidth={2.5} />
              </button>
            )}
            {ex.exercise?.video_url && ex.exercise.video_url.startsWith('http') && (
              <a
                href={ex.exercise.video_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="plan-ex-video-btn"
                title="Ver video"
              >
                <ExternalLink size={11} />
              </a>
            )}
          </div>
        </div>

        {/* Series */}
        <div className="plan-ex-cell plan-ex-cell--center plan-ex-mono">
          {ex.suggested_sets || '—'}
        </div>

        {/* Reps */}
        <div className="plan-ex-cell plan-ex-mono">{repsDisplay || '—'}</div>

        {/* Peso */}
        <div className="plan-ex-cell plan-ex-soft">{weight || '—'}</div>

        {/* Pausa */}
        <div className="plan-ex-cell plan-ex-cell--center plan-ex-soft">{ex.rest_time || '—'}</div>

        {/* PSE */}
        <div className="plan-ex-cell plan-ex-cell--center">
          {ex.suggested_pse ? (
            (() => {
              const s = pseStyle(ex.suggested_pse)
              return (
                <span className="plan-ex-pse" style={{ background: s.bg, color: s.color }}>
                  {ex.suggested_pse}
                </span>
              )
            })()
          ) : (
            <span className="plan-ex-dash">—</span>
          )}
        </div>

        {/* Acciones */}
        <div className="plan-ex-cell">
          <div className="relative">
            <button
              className="plan-ex-menu-btn opacity-0 group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen((o) => !o)
              }}
            >
              <MoreHorizontal size={14} />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 min-w-[120px]"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  onClick={() => {
                    onDelete(ex.id)
                    setMenuOpen(false)
                  }}
                >
                  <X size={13} /> Eliminar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Notas expandibles */}
      {notesOpen && hasNotes && (
        <div className="plan-ex-notes-row">
          <div className="plan-ex-notes-inner">
            <div className="plan-ex-notes-label">Técnica / notas</div>
            {ex.extra_notes || ex.exercise?.technique_notes}
          </div>
        </div>
      )}
    </>
  )
}

// ── Tarjeta resumen de bloque AERÓBICO ──────────────────────
function AerobicBlockSummary({ block }) {
  const fmt = AEROBIC_FORMATS.find((f) => f.key === block.aerobic_format)
  const intensity = INTENSITY_LEVELS.find((i) => i.key === block.aerobic_intensity)
  const zone = AEROBIC_ZONES.find((z) => z.key === block.aerobic_zone)
  const showIntervals = AEROBIC_INTERVAL_FORMATS.includes(block.aerobic_format)
  const mainExercise = block.plan_exercises?.[0]?.exercise
  const exerciseName = mainExercise?.name
  const exerciseVideo = mainExercise?.video_url

  return (
    <div className="rounded-2xl border-2 border-sky-200 bg-sky-50 p-3.5 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-base">🏃</span>
        <span className="font-semibold text-sm text-sky-800">{block.title || 'Aeróbico'}</span>
        {fmt && (
          <span className="text-[10px] font-semibold uppercase tracking-wide bg-sky-200/60 text-sky-800 rounded-full px-2 py-0.5">
            {fmt.label}
          </span>
        )}
        {zone && (
          <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 border ${zone.color}`}>
            {zone.label} · {zone.short}
          </span>
        )}
        {intensity && !zone && (
          <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${intensity.color}`}>
            {intensity.label}
          </span>
        )}
        {exerciseName && (
          <span className="text-xs text-sky-700/80 inline-flex items-center gap-1">
            · {exerciseName}
            {exerciseVideo && exerciseVideo.startsWith('http') && (
              <a
                href={exerciseVideo}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="plan-ex-video-btn"
                title="Ver video"
              >
                <ExternalLink size={12} />
              </a>
            )}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-sky-800">
        {block.aerobic_total_minutes && (
          <div className="flex items-center gap-1.5 bg-white/60 rounded-lg px-2 py-1.5">
            <Clock size={12} className="text-sky-600" />
            <span>
              <strong>{block.aerobic_total_minutes}</strong> min
            </span>
          </div>
        )}
        {showIntervals && block.aerobic_work_seconds && (
          <div className="flex items-center gap-1.5 bg-white/60 rounded-lg px-2 py-1.5">
            <Activity size={12} className="text-sky-600" />
            <span>
              Trabajo <strong>{block.aerobic_work_seconds}s</strong>
            </span>
          </div>
        )}
        {showIntervals && block.aerobic_rest_seconds && (
          <div className="flex items-center gap-1.5 bg-white/60 rounded-lg px-2 py-1.5">
            <span className="text-sky-600 text-xs">⏸</span>
            <span>
              Descanso <strong>{block.aerobic_rest_seconds}s</strong>
            </span>
          </div>
        )}
        {showIntervals && block.aerobic_rounds && (
          <div className="flex items-center gap-1.5 bg-white/60 rounded-lg px-2 py-1.5">
            <Repeat size={12} className="text-sky-600" />
            <span>
              <strong>{block.aerobic_rounds}</strong> rondas
            </span>
          </div>
        )}
      </div>

      {block.aerobic_expected_sensation && (
        <div className="text-xs text-sky-700 italic bg-white/40 rounded-lg px-2.5 py-1.5">
          <span className="font-semibold not-italic">Sensación esperada: </span>"
          {block.aerobic_expected_sensation}"
        </div>
      )}

      {block.notes && (
        <div className="text-xs text-blue-700 bg-blue-100/60 rounded-lg px-2.5 py-1.5 flex gap-1.5">
          <Info size={12} className="flex-shrink-0 mt-0.5" />
          {block.notes}
        </div>
      )}
    </div>
  )
}

// ── Tarjeta resumen de bloque CIRCUITO ──────────────────────
function CircuitBlockSummary({ block }) {
  const cType = CIRCUIT_TYPES.find((t) => t.key === block.circuit_type)
  const intensity = INTENSITY_LEVELS.find((i) => i.key === block.circuit_intensity)
  const exercises = (block.plan_exercises || [])
    .slice()
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))

  return (
    <div className="rounded-2xl border-2 border-orange-200 bg-orange-50 p-3.5 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-base">🔥</span>
        <span className="font-semibold text-sm text-orange-800">{block.title || 'Circuito'}</span>
        {cType && (
          <span className="text-[10px] font-semibold uppercase tracking-wide bg-orange-200/60 text-orange-800 rounded-full px-2 py-0.5">
            {cType.label}
          </span>
        )}
        {intensity && (
          <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${intensity.color}`}>
            {intensity.label}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-orange-800">
        {block.circuit_type === 'hiit' && block.circuit_work_seconds && (
          <div className="flex items-center gap-1.5 bg-white/60 rounded-lg px-2 py-1.5">
            <Flame size={12} className="text-orange-600" />
            <span>
              Trabajo <strong>{block.circuit_work_seconds}s</strong>
            </span>
          </div>
        )}
        {block.circuit_type === 'hiit' && block.circuit_rest_seconds && (
          <div className="flex items-center gap-1.5 bg-white/60 rounded-lg px-2 py-1.5">
            <span className="text-orange-600 text-xs">⏸</span>
            <span>
              Descanso <strong>{block.circuit_rest_seconds}s</strong>
            </span>
          </div>
        )}
        {block.circuit_rounds && (
          <div className="flex items-center gap-1.5 bg-white/60 rounded-lg px-2 py-1.5">
            <Repeat size={12} className="text-orange-600" />
            <span>
              <strong>{block.circuit_rounds}</strong> rondas
            </span>
          </div>
        )}
        {block.circuit_total_minutes && (
          <div className="flex items-center gap-1.5 bg-white/60 rounded-lg px-2 py-1.5">
            <Clock size={12} className="text-orange-600" />
            <span>
              <strong>{block.circuit_total_minutes}</strong> min
            </span>
          </div>
        )}
      </div>

      {exercises.length > 0 && (
        <div className="space-y-1 pt-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-700/70">
            Ejercicios
          </p>
          <div className="space-y-1">
            {exercises.map((ex, i) => {
              const isTime = ex.exercise_mode === 'time'
              return (
                <div
                  key={ex.id}
                  className="flex items-center gap-2 bg-white/70 rounded-lg px-2.5 py-1.5"
                >
                  <span className="text-[11px] font-bold text-orange-600 w-4">{i + 1}.</span>
                  <span className="text-xs text-gray-800 flex-1 truncate">
                    {ex.exercise?.name || 'Sin ejercicio'}
                  </span>
                  {ex.exercise?.video_url && ex.exercise.video_url.startsWith('http') && (
                    <a
                      href={ex.exercise.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="plan-ex-video-btn"
                      title="Ver video"
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                  <span className="text-[11px] text-gray-500 font-mono whitespace-nowrap">
                    {isTime
                      ? `${ex.duration_seconds || '—'}s`
                      : ex.suggested_reps
                        ? `${displayReps(ex.suggested_reps)} reps`
                        : '—'}
                  </span>
                  {ex.suggested_weight && ex.suggested_weight !== 'None' && (
                    <span className="text-[11px] text-gray-500 font-mono whitespace-nowrap">
                      · {ex.suggested_weight}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {block.notes && (
        <div className="text-xs text-blue-700 bg-blue-100/60 rounded-lg px-2.5 py-1.5 flex gap-1.5">
          <Info size={12} className="flex-shrink-0 mt-0.5" />
          {block.notes}
        </div>
      )}
    </div>
  )
}

// ── Sección con tabla ────────────────────────────────────────
function ExerciseSection({ section, exercises, onDelete }) {
  const sectionColors = {
    activation: '#8b5cf6',
    day_a: '#f97316',
    day_b: '#3b82f6',
    day_c: '#10b981',
    day_d: '#ec4899',
    day_e: '#f59e0b',
    day_f: '#06b6d4',
    day_g: '#84cc16',
  }
  const color = sectionColors[section.id] || '#6b7280'

  return (
    <div className="plan-ex-panel">
      {/* Franja de color */}
      <div style={{ height: 3, background: color }} />

      {/* Encabezados de columna */}
      <div className="plan-ex-col-headers">
        <div className="plan-ex-col-h">Bloque</div>
        <div className="plan-ex-col-h">Ejercicio</div>
        <div className="plan-ex-col-h plan-ex-col-h--center">Series</div>
        <div className="plan-ex-col-h">Reps</div>
        <div className="plan-ex-col-h">Peso</div>
        <div className="plan-ex-col-h plan-ex-col-h--center">Pausa</div>
        <div className="plan-ex-col-h plan-ex-col-h--center">PSE sug.</div>
        <div />
      </div>

      {exercises.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-400">
          Sin ejercicios en esta sección
        </div>
      ) : (
        exercises.map((ex) => <ExerciseRow key={ex.id} ex={ex} onDelete={onDelete} />)
      )}
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────
export default function PlanDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [plan, setPlan] = useState(null)
  const [exercises, setExercises] = useState([])
  const [planBlocks, setPlanBlocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [assignments, setAssignments] = useState([])
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [activeSection, setActiveSection] = useState(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [mainTab, setMainTab] = useState('structure') // 'structure' | 'progress'

  useEffect(() => {
    fetchPlan()
  }, [id])

  async function fetchPlan() {
    try {
      const [planRes, blocksRes, assignmentsRes] = await Promise.all([
        supabase
          .from('plans')
          .select(`*, plan_exercises(*, exercise:exercises!exercise_id(*))`)
          .eq('id', id)
          .single(),
        supabase.from('plan_blocks').select('*').eq('plan_id', id).order('order_index'),
        supabase
          .from('plan_assignments')
          .select('*, student:profiles!student_id(id, name)')
          .eq('plan_id', id)
          .eq('active', true),
      ])
      setPlan(planRes.data)
      setExercises(planRes.data?.plan_exercises || [])
      setPlanBlocks(blocksRes.data || [])
      setAssignments(assignmentsRes.data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function deleteExercise(exId) {
    await supabase.from('plan_exercises').delete().eq('id', exId)
    fetchPlan()
  }

  async function removeAssignment(assignmentId) {
    await supabase.from('plan_assignments').update({ active: false }).eq('id', assignmentId)
    fetchPlan()
  }

  async function handleDeletePlan(planId) {
    const { error } = await supabase.from('plans').delete().eq('id', planId)
    if (error) throw error
    navigate('/coach/plans')
  }

  // Secciones activas
  const activeSections = plan ? getDynamicSections(plan.sessions_per_week, plan.has_activation) : []

  // Inicializar pestaña activa al cargar
  useEffect(() => {
    if (activeSections.length > 0 && !activeSection) {
      // Primera sección no-activation por defecto (o activation si es la única)
      const firstMain = activeSections.find((s) => s.id !== 'activation') || activeSections[0]
      setActiveSection(firstMain.id)
    }
  }, [activeSections.length])

  // Agrupar plan_blocks (con sus ejercicios) por sección, separando por tipo.
  // Los ejercicios de cada bloque se mantienen aislados por block_type — esto
  // es lo que evita que ejercicios de un bloque circuit/aerobic se intercalen
  // en la tabla de fuerza (bug B1 — Anto 2026-05-21).
  const blocksBySectionTyped = {}
  {
    const allGrouped = groupExercisesIntoBlocks(exercises, planBlocks)
    for (const s of activeSections) {
      const sectionBlocks = allGrouped
        .filter((b) => b.section === s.id)
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
      blocksBySectionTyped[s.id] = {
        strength: sectionBlocks.filter((b) => b.block_type === 'strength'),
        aerobic: sectionBlocks.filter((b) => b.block_type === 'aerobic'),
        circuit: sectionBlocks.filter((b) => b.block_type === 'circuit'),
      }
    }
  }

  // Ejercicios de FUERZA por sección: derivados de los bloques strength
  // (incluye bloques virtuales para planes viejos sin block_id, que
  // groupExercisesIntoBlocks crea como strength por default).
  const strengthExercisesBySection = {}
  for (const s of activeSections) {
    const strengthBlocks = blocksBySectionTyped[s.id]?.strength || []
    strengthExercisesBySection[s.id] = strengthBlocks
      .flatMap((b) => b.plan_exercises || [])
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
  }

  const totalExercises = exercises.length
  const currentSection = activeSections.find((s) => s.id === activeSection)

  const sectionColors = {
    activation: '#8b5cf6',
    day_a: '#f97316',
    day_b: '#3b82f6',
    day_c: '#10b981',
    day_d: '#ec4899',
    day_e: '#f59e0b',
    day_f: '#06b6d4',
    day_g: '#84cc16',
  }

  if (loading)
    return (
      <div className="flex justify-center py-14">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )

  if (!plan)
    return <div className="text-center py-14 text-gray-500 text-sm">Plan no encontrado</div>

  return (
    <>
      {showAssignModal && (
        <AssignStudentModal
          planId={id}
          planType={plan?.plan_type}
          isTemplate={plan?.is_template}
          onClose={() => setShowAssignModal(false)}
          onDone={() => {
            setShowAssignModal(false)
            fetchPlan()
          }}
        />
      )}

      {showDeleteModal && (
        <DeletePlanModal
          plan={plan}
          activeStudents={assignments.length}
          resultCount={0}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleDeletePlan}
        />
      )}

      {/* ── Plan hero ────────────────────────────────────── */}
      <div className="plan-hero">
        {/* Fila superior */}
        <div className="plan-hero-top">
          <button onClick={() => navigate(-1)} className="plan-hero-back">
            <ArrowLeft size={15} />
          </button>
          <div className="plan-hero-info">
            <h1 className="plan-hero-title">{plan.title}</h1>
            {plan.description && <p className="plan-hero-desc">{plan.description}</p>}
            <div className="plan-hero-meta">
              <span className="plan-meta-item">
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                {plan.sessions_per_week || '—'} días/semana
              </span>
              <span className="plan-meta-sep">·</span>
              <span className="plan-meta-item">{totalExercises} ejercicios</span>
              {plan.created_at && (
                <>
                  <span className="plan-meta-sep">·</span>
                  <span className="plan-meta-item">
                    Creado {format(new Date(plan.created_at), 'dd MMM yyyy')}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="plan-hero-actions">
            <button
              onClick={() => setShowDeleteModal(true)}
              className="btn-ghost p-2 text-gray-400 hover:text-red-500"
              title="Eliminar plan"
            >
              <Trash2 size={16} />
            </button>
            <Link
              to={`/coach/plans/${id}/edit`}
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              <Edit2 size={13} /> Editar
            </Link>
            <button className="btn-primary flex items-center gap-1.5 text-sm">
              <Plus size={13} /> Agregar ejercicio
            </button>
          </div>
        </div>

        {/* Stats inline */}
        <div className="plan-stats-strip">
          <div className="plan-stat">
            <span className="plan-stat-val">{totalExercises}</span>
            <span className="plan-stat-lbl">Ejercicios</span>
          </div>
          <div className="plan-stat">
            <span className="plan-stat-val">{plan.sessions_per_week || '—'}</span>
            <span className="plan-stat-lbl">Días / semana</span>
          </div>
          <div className="plan-stat">
            <span className="plan-stat-val">{assignments.length}</span>
            <span className="plan-stat-lbl">Alumnos</span>
          </div>
          <div className="plan-stat">
            <span className="plan-stat-val">{activeSections.length}</span>
            <span className="plan-stat-lbl">Secciones</span>
          </div>
        </div>
      </div>

      {/* ── Tabs principales: Estructura | Progreso ──────── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        <button
          onClick={() => setMainTab('structure')}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            mainTab === 'structure'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <LayoutGrid size={13} />
          Estructura
        </button>
        <button
          onClick={() => setMainTab('progress')}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            mainTab === 'progress'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <TrendingUp size={13} />
          Progreso
          {assignments.length > 0 && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                mainTab === 'progress'
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {assignments.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Tab: Progreso ─────────────────────────────────── */}
      {mainTab === 'progress' && <PlanProgressTab planId={id} assignments={assignments} />}

      {/* ── Tab: Estructura ───────────────────────────────── */}
      {mainTab === 'structure' && (
        <>
          {/* ── Alumnos asignados ─────────────────────────────── */}
          {/*
        Los botones de "Asignar / Agregar" solo se muestran cuando el plan
        es una plantilla. Las instancias personalizadas (is_template=false)
        son clones por alumno y conceptualmente no se asignan a otros: la
        RPC `assign_template_to_student` solo acepta plantillas.
      */}
          <div className="card mb-0 rounded-2xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Users size={14} className="text-gray-400" />
                Alumnos asignados
              </div>
              {plan?.is_template !== false && (
                <button
                  onClick={() => setShowAssignModal(true)}
                  className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
                >
                  <Plus size={12} /> Asignar
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {assignments.length === 0 ? (
                plan?.is_template !== false ? (
                  <button
                    onClick={() => setShowAssignModal(true)}
                    className="plan-add-student-chip"
                  >
                    <Plus size={11} /> Asignar alumno
                  </button>
                ) : (
                  <p className="text-xs text-gray-400 italic">
                    Plan personalizado (sin alumnos para asignar).
                  </p>
                )
              ) : (
                <>
                  {assignments.map((a) => (
                    <div key={a.id} className="plan-student-chip">
                      <div className="plan-chip-avatar">{a.student?.name?.[0]?.toUpperCase()}</div>
                      <Link
                        to={`/coach/students/${a.student_id}`}
                        className="text-xs font-medium text-gray-700 hover:text-gray-900"
                      >
                        {a.student?.name}
                      </Link>
                      <button
                        onClick={() => removeAssignment(a.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors ml-1 leading-none"
                        title="Desasignar"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {plan?.is_template !== false && (
                    <button
                      onClick={() => setShowAssignModal(true)}
                      className="plan-add-student-chip"
                    >
                      <Plus size={11} /> Agregar
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── Tabs de sección ───────────────────────────────── */}
          <div className="plan-tabs-bar">
            {activeSections.map((s) => {
              const color = sectionColors[s.id] || '#6b7280'
              const isActive = activeSection === s.id
              // Contar: strength = nº de ejercicios, aerobic/circuit = nº de bloques
              const typed = blocksBySectionTyped[s.id] || { strength: [], aerobic: [], circuit: [] }
              const strengthExCount = typed.strength.reduce(
                (acc, b) => acc + (b.plan_exercises?.length || 0),
                0
              )
              const count = strengthExCount + typed.aerobic.length + typed.circuit.length
              return (
                <button
                  key={s.id}
                  className={`plan-tab ${isActive ? 'plan-tab--active' : ''}`}
                  style={isActive ? { '--tab-color': color } : {}}
                  onClick={() => setActiveSection(s.id)}
                >
                  <span
                    className="plan-tab-dot"
                    style={{ background: isActive ? color : '#d1d5db' }}
                  />
                  {s.label}
                  <span
                    className={`plan-tab-count ${isActive ? 'plan-tab-count--active' : ''}`}
                    style={isActive ? { background: color + '18', color } : {}}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* ── Contenido de la sección (fuerza + aeróbico + circuito) ── */}
          {currentSection &&
            (() => {
              const typed = blocksBySectionTyped[currentSection.id] || {
                strength: [],
                aerobic: [],
                circuit: [],
              }
              const hasAerobic = typed.aerobic.length > 0
              const hasCircuit = typed.circuit.length > 0
              const strengthExercises = strengthExercisesBySection[currentSection.id] || []
              const hasStrength = strengthExercises.length > 0
              const hasAnything = hasStrength || hasAerobic || hasCircuit

              return (
                <div className="space-y-3">
                  {/* Fuerza: tabla actual */}
                  {hasStrength && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 px-1">
                        <span className="text-xs">💪</span>
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          Fuerza
                        </span>
                      </div>
                      <ExerciseSection
                        section={currentSection}
                        exercises={strengthExercises}
                        onDelete={deleteExercise}
                      />
                    </div>
                  )}

                  {/* Aeróbico: tarjetas */}
                  {hasAerobic && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 px-1">
                        <span className="text-xs">🏃</span>
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                          Aeróbico
                        </span>
                      </div>
                      <div className="space-y-2">
                        {typed.aerobic.map((b) => (
                          <AerobicBlockSummary key={b.id} block={b} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Circuito: tarjetas */}
                  {hasCircuit && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 px-1">
                        <span className="text-xs">🔥</span>
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-orange-700">
                          Circuito
                        </span>
                      </div>
                      <div className="space-y-2">
                        {typed.circuit.map((b) => (
                          <CircuitBlockSummary key={b.id} block={b} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Vacío */}
                  {!hasAnything && (
                    <div className="plan-ex-panel py-10 text-center text-sm text-gray-400">
                      Sin contenido en esta sección
                    </div>
                  )}
                </div>
              )
            })()}
        </> /* fin mainTab === 'structure' */
      )}
    </>
  )
}
