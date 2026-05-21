import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Edit2, Save, X, Lock, AlertCircle, Send, FileCheck,
  ClipboardList, CreditCard, Calendar, CheckCircle2,
  MessageSquare, ChevronRight,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { buildFormConfig } from '@/features/forms/intake/schema/default-form.js'
import {
  FIELD_LABELS, LEVEL_LABELS, GENDER_LABELS, displayValue,
  PATOLOGIAS_OPTIONS, validateLesionesConsistency, lesionesCheckErrorMessage,
} from '../helpers'
import {
  getPaymentStatus, PAYMENT_STATUS,
} from '../status'
import { getFriendlyErrorMessage as errorHelpersGetFriendlyMessage } from '@/utils/errorHelpers'

// ─────────────────────────────────────────────────────────────
// StudentInfoTab
// Props:
//   student        - perfil completo del alumno
//   studentId      - UUID del alumno
//   coachId        - UUID del coach (para historizar cambios)
//   formAssignment - asignación de intake form (puede ser null)
//   formSubmission - respuesta del intake form (puede ser null)
//   onRefresh      - callback para que el padre recargue datos
// ─────────────────────────────────────────────────────────────
// Campos del FIELD_LABELS que NO se editan más desde este formulario
// (migraron al panel de notas: el coach las escribe desde ahí y los
// triggers v26a las espejan a profiles.observations/coach_notes mientras
// la columna legacy siga viva. Acá solo mostramos preview read-only.)
const FIELDS_MIGRATED_TO_NOTES_PANEL = new Set(['observations', 'coach_notes'])

export default function StudentInfoTab({
  student,
  studentId,
  coachId,
  formAssignment,
  formSubmission,
  onRefresh,
  onOpenNotesTab,
}) {
  // ── Edición de perfil ────────────────────────────────────
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  // ── Edición de gestión / pagos ───────────────────────────
  const [payEditMode, setPayEditMode] = useState(false)
  const [payEditData, setPayEditData] = useState({})
  const [paySaving, setPaySaving] = useState(false)
  const [paySaveError, setPaySaveError] = useState(null)

  // ── Formulario de ingreso ────────────────────────────────
  const [sendingForm, setSendingForm] = useState(false)
  const [formSentOk, setFormSentOk] = useState(false)

  // ── Preview de últimas notas free del thread (reemplazan las
  //    textareas legacy de observations + coach_notes) ──────────
  const [lastObs, setLastObs] = useState(null)
  const [lastPriv, setLastPriv] = useState(null)
  const [notesPreviewLoading, setNotesPreviewLoading] = useState(false)

  useEffect(() => {
    let alive = true
    if (!studentId) return
    async function loadPreview() {
      setNotesPreviewLoading(true)
      // Buscamos el thread del alumno, después la última nota free
      // shared y la última coach_private.
      const { data: thread } = await supabase
        .from('note_threads')
        .select('id')
        .eq('student_id', studentId)
        .maybeSingle()
      if (!alive) return
      if (!thread) {
        setLastObs(null); setLastPriv(null); setNotesPreviewLoading(false)
        return
      }
      const [obsRes, privRes] = await Promise.all([
        supabase.from('notes')
          .select('id, body, created_at')
          .eq('thread_id', thread.id)
          .eq('context_type', 'free')
          .eq('author_role', 'coach')
          .eq('visibility', 'shared')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from('notes')
          .select('id, body, created_at')
          .eq('thread_id', thread.id)
          .eq('context_type', 'free')
          .eq('author_role', 'coach')
          .eq('visibility', 'coach_private')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
      if (!alive) return
      setLastObs(obsRes.data || null)
      setLastPriv(privRes.data || null)
      setNotesPreviewLoading(false)
    }
    loadPreview()
    return () => { alive = false }
  }, [studentId])

  // ── Handlers: perfil ─────────────────────────────────────
  function startEdit() {
    setEditData({ ...student })
    setEditMode(true)
    setSaveError(null)
  }

  function cancelEdit() {
    setEditData({})
    setEditMode(false)
    setSaveError(null)
  }

  async function saveEdit() {
    setSaving(true)
    setSaveError(null)
    try {
      // Validación cliente del CHECK profiles_lesiones_requires_detail
      // (handoff 2.6). Evita rebote del back y le da feedback inmediato al coach.
      // Toma el valor final post-edición para los 3 campos relevantes.
      const lesionesError = validateLesionesConsistency({
        tiene_lesiones: editData.tiene_lesiones,
        descripcion_lesiones: editData.descripcion_lesiones,
        patologias: editData.patologias,
      })
      if (lesionesError) {
        setSaveError(lesionesError)
        setSaving(false)
        return
      }

      // Comparación de campos: para arrays (patologias) comparamos como JSON
      // porque !== entre arrays distintos da true siempre. Para booleans/strings
      // alcanza con ===, pero normalizamos a la misma representación.
      const isChanged = (key) => {
        const a = editData[key]
        const b = student[key]
        if (Array.isArray(a) || Array.isArray(b)) {
          return JSON.stringify(a || null) !== JSON.stringify(b || null)
        }
        return a !== b
      }
      // observations/coach_notes migraron al panel — no se editan desde acá
      const changedFields = Object.keys(FIELD_LABELS)
        .filter(f => !FIELDS_MIGRATED_TO_NOTES_PANEL.has(f))
        .filter(isChanged)
      const updatePayload = {}
      changedFields.forEach(f => {
        const v = editData[f]
        // Preservamos arrays vacíos como [] (no NULL) si el usuario los limpió
        // a propósito. Para el resto, '' o undefined → null.
        if (Array.isArray(v)) {
          updatePayload[f] = v
        } else if (typeof v === 'boolean') {
          updatePayload[f] = v
        } else {
          updatePayload[f] = v || null
        }
      })

      if (changedFields.length > 0) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update(updatePayload)
          .eq('id', studentId)
        if (updateError) {
          // El back podría tirar 23514 si la validación cliente falló por algún
          // motivo (ej. otro coach editó en paralelo). Lo traducimos a algo legible.
          const friendly = lesionesCheckErrorMessage(updateError)
          throw friendly ? new Error(friendly) : updateError
        }

        const historyInserts = changedFields.map(f => ({
          student_id: studentId,
          changed_by: coachId,
          field_name: f,
          old_value: displayValue(f, student[f]),
          new_value: displayValue(f, editData[f]),
        }))
        await supabase.from('student_edit_history').insert(historyInserts)
      }

      setEditMode(false)
      onRefresh()
    } catch (err) {
      // Si el path de lesiones ya transformó el error en Error(friendly),
      // err.message ya es amigable. Sino, delegamos al helper centralizado
      // (handoff 9.1) que mapea 23514 / 23503 / 42501 / etc.
      const friendly =
        (err instanceof Error && err.message && !err.code)
          ? err.message
          : (errorHelpersGetFriendlyMessage(err) || err.message || 'Error al guardar los cambios')
      setSaveError(friendly)
    } finally {
      setSaving(false)
    }
  }

  // ── Handlers: pagos ──────────────────────────────────────
  function startPayEdit() {
    setPayEditData({
      last_payment_date: student.last_payment_date || '',
      next_payment_due: student.next_payment_due || '',
      payment_notes: student.payment_notes || '',
    })
    setPayEditMode(true)
    setPaySaveError(null)
  }

  function cancelPayEdit() {
    setPayEditData({})
    setPayEditMode(false)
    setPaySaveError(null)
  }

  async function savePayEdit() {
    setPaySaving(true)
    setPaySaveError(null)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          last_payment_date: payEditData.last_payment_date || null,
          next_payment_due: payEditData.next_payment_due || null,
          payment_notes: payEditData.payment_notes || null,
        })
        .eq('id', studentId)
      if (error) throw error
      setPayEditMode(false)
      onRefresh()
    } catch (err) {
      setPaySaveError(err.message || 'Error al guardar el pago')
    } finally {
      setPaySaving(false)
    }
  }

  // ── Handler: formulario de ingreso ───────────────────────
  async function sendForm() {
    setSendingForm(true)
    try {
      const { data: template } = await supabase
        .from('intake_form_templates')
        .select('*')
        .eq('coach_id', coachId)
        .eq('is_default', true)
        .maybeSingle()

      const formSnapshot = template?.config || buildFormConfig()

      const { error } = await supabase
        .from('intake_form_assignments')
        .insert({
          template_id: template?.id || null,
          coach_id: coachId,
          student_id: studentId,
          form_snapshot: formSnapshot,
          status: 'pending',
        })
      if (error) throw error

      setFormSentOk(true)
      setTimeout(() => setFormSentOk(false), 3000)
      onRefresh()
    } catch (err) {
      console.error('Error al enviar formulario:', err)
    } finally {
      setSendingForm(false)
    }
  }

  // ── Helpers de display ───────────────────────────────────
  function formatIntakeResponse(value) {
    if (value === null || value === undefined || value === '') return '—'
    if (typeof value === 'boolean') return value ? 'Sí' : 'No'
    if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '—'
    return String(value)
  }

  const paymentStatus = getPaymentStatus(student)
  const paymentConfig = PAYMENT_STATUS[paymentStatus]

  const formModules = formSubmission?.form_snapshot?.modules
    ?.filter(m => m.enabled)
    ?.sort((a, b) => a.order - b.order) || []

  // ────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Toast – formulario enviado */}
      {formSentOk && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
          <CheckCircle2 size={16} /> Formulario enviado al alumno
        </div>
      )}

      {/* ── Controles de edición de perfil ── */}
      {!editMode ? (
        <div className="flex justify-end">
          <button
            onClick={startEdit}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <Edit2 size={14} /> Editar datos
          </button>
        </div>
      ) : (
        <div className="flex gap-2 justify-end">
          <button onClick={cancelEdit} className="btn-ghost flex items-center gap-1.5 text-sm text-gray-600">
            <X size={14} /> Cancelar
          </button>
          <button onClick={saveEdit} disabled={saving} className="btn-primary flex items-center gap-1.5 text-sm">
            {saving
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <><Save size={14} /> Guardar</>
            }
          </button>
        </div>
      )}

      {saveError && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-3 text-sm">
          <AlertCircle size={15} /> <span>{saveError}</span>
        </div>
      )}

      {/* ── Datos personales ── */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-gray-900">Datos personales</h3>
        {editMode ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label text-xs">Nombre</label>
              <input className="input text-sm" value={editData.name || ''} onChange={e => setEditData(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="label text-xs">Fecha de nacimiento</label>
              <input type="date" className="input text-sm" value={editData.birth_date || ''} onChange={e => setEditData(p => ({ ...p, birth_date: e.target.value }))} />
            </div>
            <div>
              <label className="label text-xs">Sexo</label>
              <select className="input text-sm" value={editData.gender || ''} onChange={e => setEditData(p => ({ ...p, gender: e.target.value }))}>
                <option value="">Sin especificar</option>
                <option value="male">Masculino</option>
                <option value="female">Femenino</option>
                <option value="other">Otro</option>
              </select>
            </div>
            <div>
              <label className="label text-xs">Altura (cm)</label>
              <input type="number" className="input text-sm" value={editData.height_cm || ''} onChange={e => setEditData(p => ({ ...p, height_cm: e.target.value }))} />
            </div>
            <div>
              <label className="label text-xs">Peso (kg)</label>
              <input type="number" step="0.1" className="input text-sm" value={editData.weight_kg || ''} onChange={e => setEditData(p => ({ ...p, weight_kg: e.target.value }))} />
            </div>
            <div>
              <label className="label text-xs">Peso objetivo (kg)</label>
              <input type="number" step="0.1" className="input text-sm" value={editData.target_weight_kg || ''} onChange={e => setEditData(p => ({ ...p, target_weight_kg: e.target.value }))} />
            </div>
            <div>
              <label className="label text-xs">DNI</label>
              <input className="input text-sm" value={editData.dni || ''} onChange={e => setEditData(p => ({ ...p, dni: e.target.value }))} />
            </div>
            <div>
              <label className="label text-xs">Nivel</label>
              <select className="input text-sm" value={editData.level || ''} onChange={e => setEditData(p => ({ ...p, level: e.target.value }))}>
                <option value="">Sin especificar</option>
                <option value="beginner">Principiante</option>
                <option value="intermediate">Intermedio</option>
                <option value="advanced">Avanzado</option>
              </select>
            </div>
            <div>
              <label className="label text-xs">Objetivo</label>
              <input className="input text-sm" value={editData.goal || ''} onChange={e => setEditData(p => ({ ...p, goal: e.target.value }))} />
            </div>
            <div>
              <label className="label text-xs">Frecuencia semanal</label>
              <input type="number" min="1" max="7" className="input text-sm" value={editData.weekly_frequency || ''} onChange={e => setEditData(p => ({ ...p, weekly_frequency: e.target.value }))} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Altura', value: student.height_cm ? `${student.height_cm} cm` : '—' },
              { label: 'Peso inicial', value: student.weight_kg ? `${student.weight_kg} kg` : '—' },
              { label: 'Peso objetivo', value: student.target_weight_kg ? `${student.target_weight_kg} kg` : '—' },
              { label: 'DNI', value: student.dni || '—' },
              { label: 'Nacimiento', value: student.birth_date ? format(parseISO(student.birth_date), 'dd/MM/yyyy') : '—' },
              { label: 'Sexo', value: GENDER_LABELS[student.gender] || '—' },
              { label: 'Frecuencia', value: student.weekly_frequency ? `${student.weekly_frequency} días/sem` : '—' },
              { label: 'Objetivo', value: student.goal || '—' },
            ].map(item => (
              <div key={item.label}>
                <p className="text-xs text-gray-500">{item.label}</p>
                <p className="text-sm font-medium text-gray-900">{item.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Salud (handoff 2.6) ──
          La BD valida (CHECK profiles_lesiones_requires_detail): si
          tiene_lesiones=true, exige descripción NO vacía O patologías
          distintas de solo ['Ninguna']. La UI bloquea el guardado si no
          se cumple para evitar rebote. */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
          🩺 Salud
        </h3>
        {editMode ? (
          <div className="space-y-3">
            <div>
              <label className="label text-xs">¿Tiene lesiones actuales o recientes?</label>
              <select
                className="input text-sm"
                value={editData.tiene_lesiones === true ? 'true' : editData.tiene_lesiones === false ? 'false' : ''}
                onChange={e => {
                  const v = e.target.value
                  setEditData(p => ({
                    ...p,
                    tiene_lesiones: v === '' ? null : v === 'true',
                  }))
                }}
              >
                <option value="">Sin especificar</option>
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            </div>

            {editData.tiene_lesiones === true && (
              <div>
                <label className="label text-xs">Descripción de lesiones</label>
                <textarea
                  className="input resize-none text-sm"
                  rows={3}
                  value={editData.descripcion_lesiones || ''}
                  onChange={e => setEditData(p => ({ ...p, descripcion_lesiones: e.target.value }))}
                  placeholder="Ej: dolor en rodilla derecha, molestia en hombro al levantar..."
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Obligatorio si no marcaste ninguna patología real abajo.
                </p>
              </div>
            )}

            <div>
              <label className="label text-xs">Patologías</label>
              <div className="grid grid-cols-2 gap-1.5">
                {PATOLOGIAS_OPTIONS.map(opt => {
                  const selected = Array.isArray(editData.patologias) && editData.patologias.includes(opt)
                  return (
                    <label
                      key={opt}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border cursor-pointer text-xs ${
                        selected
                          ? 'border-primary-400 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="accent-primary-500"
                        checked={selected}
                        onChange={e => {
                          setEditData(p => {
                            const current = Array.isArray(p.patologias) ? [...p.patologias] : []
                            if (e.target.checked) {
                              // Marcar "Ninguna" desmarca el resto y viceversa para
                              // mantener un set coherente (igual que el intake).
                              if (opt === 'Ninguna') return { ...p, patologias: ['Ninguna'] }
                              const next = current.filter(x => x !== 'Ninguna')
                              if (!next.includes(opt)) next.push(opt)
                              return { ...p, patologias: next }
                            }
                            return { ...p, patologias: current.filter(x => x !== opt) }
                          })
                        }}
                      />
                      <span>{opt}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-gray-500 w-32 flex-shrink-0">¿Tiene lesiones?</span>
              <span className="font-medium text-gray-900">
                {displayValue('tiene_lesiones', student.tiene_lesiones)}
              </span>
            </div>
            {student.tiene_lesiones && student.descripcion_lesiones && (
              <div className="flex items-baseline gap-2">
                <span className="text-xs text-gray-500 w-32 flex-shrink-0">Descripción</span>
                <span className="font-medium text-gray-900 flex-1 whitespace-pre-wrap">
                  {student.descripcion_lesiones}
                </span>
              </div>
            )}
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-gray-500 w-32 flex-shrink-0">Patologías</span>
              <span className="font-medium text-gray-900 flex-1">
                {displayValue('patologias', student.patologias)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Notas con el alumno (panel) ───────────────────────
          Las textareas legacy de "Observaciones" + "Notas privadas"
          se reemplazaron por preview de las últimas notas del panel.
          Para escribir/editar/borrar el coach va al tab Notas. */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare size={15} className="text-primary-500" />
            <h3 className="font-semibold text-gray-900 text-sm">Notas con el alumno</h3>
          </div>
          {onOpenNotesTab && (
            <button
              type="button"
              onClick={onOpenNotesTab}
              className="text-xs text-primary-600 hover:text-primary-700 font-medium inline-flex items-center gap-0.5"
            >
              Ver y escribir <ChevronRight size={12} />
            </button>
          )}
        </div>

        {/* Observación pública (última) */}
        <div className="border-l-4 border-l-blue-400 pl-3 py-1">
          <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-0.5">
            Última observación pública
          </p>
          {notesPreviewLoading ? (
            <p className="text-xs text-gray-400 italic">Cargando…</p>
          ) : lastObs ? (
            <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-3">
              {lastObs.body}
            </p>
          ) : (
            <p className="text-sm text-gray-400 italic">Sin observaciones aún.</p>
          )}
        </div>

        {/* Nota privada (última) */}
        <div className="border-l-4 border-l-primary-400 pl-3 py-1">
          <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-0.5 flex items-center gap-1">
            <Lock size={10} /> Última nota privada
          </p>
          {notesPreviewLoading ? (
            <p className="text-xs text-gray-400 italic">Cargando…</p>
          ) : lastPriv ? (
            <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-3">
              {lastPriv.body}
            </p>
          ) : (
            <p className="text-sm text-gray-400 italic">Sin notas privadas aún.</p>
          )}
        </div>

        <p className="text-[10px] text-gray-400 pt-1 border-t border-gray-100">
          Las observaciones y notas privadas viven en el panel de Notas.
          Desde ahí podés escribir, responder, filtrar, editar y borrar.
        </p>
      </div>

      {/* ── Gestión de pagos ── */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard size={15} className="text-primary-500" />
            <h3 className="font-semibold text-gray-900 text-sm">Gestión de pagos</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className={`badge text-xs ${paymentConfig.badgeClass}`}>
              {paymentConfig.label}
            </span>
            {!payEditMode && (
              <button
                onClick={startPayEdit}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title="Editar información de pago"
              >
                <Edit2 size={13} />
              </button>
            )}
          </div>
        </div>

        {payEditMode ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-xs">Último pago</label>
                <input
                  type="date"
                  className="input text-sm"
                  value={payEditData.last_payment_date || ''}
                  onChange={e => setPayEditData(p => ({ ...p, last_payment_date: e.target.value }))}
                />
              </div>
              <div>
                <label className="label text-xs">Próximo vencimiento</label>
                <input
                  type="date"
                  className="input text-sm"
                  value={payEditData.next_payment_due || ''}
                  onChange={e => setPayEditData(p => ({ ...p, next_payment_due: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="label text-xs">Notas de pago (privadas)</label>
              <input
                className="input text-sm"
                placeholder="Ej: paga los 5 de cada mes, debe 2 meses..."
                value={payEditData.payment_notes || ''}
                onChange={e => setPayEditData(p => ({ ...p, payment_notes: e.target.value }))}
              />
            </div>
            {paySaveError && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-2.5 text-xs">
                <AlertCircle size={13} /> {paySaveError}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={cancelPayEdit} className="btn-ghost text-sm text-gray-600 flex items-center gap-1">
                <X size={13} /> Cancelar
              </button>
              <button onClick={savePayEdit} disabled={paySaving} className="btn-primary text-sm flex items-center gap-1">
                {paySaving
                  ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><Save size={13} /> Guardar</>
                }
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Calendar size={11} /> Último pago
              </p>
              <p className="text-sm font-medium text-gray-900">
                {student.last_payment_date
                  ? format(parseISO(student.last_payment_date), 'dd/MM/yyyy')
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Calendar size={11} /> Vencimiento
              </p>
              <p className={`text-sm font-medium ${
                paymentStatus === 'overdue' ? 'text-red-600' :
                paymentStatus === 'due_soon' ? 'text-yellow-600' :
                'text-gray-900'
              }`}>
                {student.next_payment_due
                  ? format(parseISO(student.next_payment_due), 'dd/MM/yyyy')
                  : '—'}
              </p>
            </div>
            {student.payment_notes && (
              <div className="col-span-2">
                <p className="text-xs text-gray-500">Notas</p>
                <p className="text-sm text-gray-600 italic">{student.payment_notes}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Formulario de ingreso ── */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList size={15} className="text-primary-500" />
            <h3 className="font-semibold text-gray-900 text-sm">Formulario de ingreso</h3>
          </div>
          {formSubmission && (
            <span className="badge bg-green-100 text-green-700 text-xs flex items-center gap-1">
              <FileCheck size={11} /> Completado
            </span>
          )}
          {formAssignment && !formSubmission && (
            <span className="badge bg-yellow-100 text-yellow-700 text-xs">Pendiente</span>
          )}
        </div>

        {!formAssignment && (
          <div className="text-center py-3 space-y-3">
            <p className="text-sm text-gray-500">
              El alumno todavía no recibió el formulario de ingreso.
            </p>
            <button
              onClick={sendForm}
              disabled={sendingForm}
              className="btn-primary flex items-center gap-2 text-sm mx-auto"
            >
              {sendingForm
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Send size={14} />
              }
              Enviar formulario
            </button>
          </div>
        )}

        {formAssignment && !formSubmission && (
          <div className="space-y-1">
            <p className="text-sm text-gray-600">
              El formulario fue enviado y está esperando respuesta del alumno.
            </p>
            <p className="text-xs text-gray-400">
              Enviado el {format(parseISO(formAssignment.sent_at), "d 'de' MMMM yyyy", { locale: es })}
            </p>
          </div>
        )}

        {formSubmission && (
          <div className="space-y-4">
            <p className="text-xs text-gray-400">
              Completado el {format(parseISO(formSubmission.submitted_at), "d 'de' MMMM yyyy", { locale: es })}
            </p>
            {formModules.map(module => {
              const answered = (module.questions || []).filter(q => {
                const val = formSubmission.responses?.[q.id]
                if (q.id?.startsWith('consentimiento')) return false
                return val !== undefined && val !== null && val !== '' &&
                  !(Array.isArray(val) && val.length === 0)
              })
              if (!answered.length) return null
              return (
                <div key={module.id} className="space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {module.emoji} {module.title}
                  </p>
                  <div className="space-y-2">
                    {answered.map(q => (
                      <div key={q.id} className="flex gap-3 text-xs leading-relaxed">
                        <span className="text-gray-500 w-2/5 flex-shrink-0">{q.label}</span>
                        <span className="text-gray-900 font-medium flex-1 text-right">
                          {formatIntakeResponse(formSubmission.responses[q.id])}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
