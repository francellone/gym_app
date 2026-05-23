import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import {
  LogOut,
  Save,
  ChevronRight,
  Lock,
  ClipboardList,
  FileCheck,
  Pencil,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

// ── Opciones del form ──────────────────────────────────────────────────────────
// Tomadas del intake form (intake_form_submissions.form_snapshot) para mantener
// consistencia con valores que ya existen en BD. Si Anto suma options al intake,
// hay que reflejarlas acá.
const GOAL_OPTIONS = [
  'Perder grasa',
  'Ganar músculo',
  'Mejorar resistencia',
  'Tonificar',
  'Mejorar salud general',
  'Preparación deportiva',
  'Rehabilitación',
]

const PATOLOGIAS_OPTIONS = [
  'Hipertensión',
  'Diabetes tipo 1',
  'Diabetes tipo 2',
  'Obesidad',
  'Problemas cardíacos',
  'Problemas respiratorios',
  'Problemas articulares',
  'Ninguna',
]

// Q6 (handoff 13/16, 2026-05-23): valores que el alumno puede editar y que
// disparan notif al coach vía trigger fn_notify_profile_change. La lista vive
// también en la migración SQL (debe matchear). height_cm es editable pero NO
// dispara notif (no es decisión coach).
//
// Si Anto suma/quita campos a la lista crítica, actualizar:
//   1. src/features/auth/pages/ProfilePage.jsx (este archivo, sólo si cambia UI)
//   2. supabase/migrations/<...>_q6_notify_coach_on_profile_change.sql (función SQL)

export default function ProfilePage() {
  const { profile, signOut, refreshProfile } = useAuth()
  const navigate = useNavigate()

  // ── Estado de edición y feedback ─────────────────────────────────────────────
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // ── Form state. Computa el initial state a partir del profile cargado ────────
  // Goal se split en dos: si el valor en BD no está entre las options canónicas,
  // se marca como "Otro" y se muestra textarea editable.
  const initialForm = useMemo(() => {
    const rawGoal = profile?.goal ?? ''
    const isOtherGoal = rawGoal && !GOAL_OPTIONS.includes(rawGoal)
    return {
      weight_kg: profile?.weight_kg ?? '',
      height_cm: profile?.height_cm ?? '',
      target_weight_kg: profile?.target_weight_kg ?? '',
      goal_choice: isOtherGoal ? 'Otro' : rawGoal,
      goal_other_text: isOtherGoal ? rawGoal : '',
      tiene_lesiones: !!profile?.tiene_lesiones,
      patologias: Array.isArray(profile?.patologias) ? [...profile.patologias] : [],
      descripcion_lesiones: profile?.descripcion_lesiones ?? '',
      weekly_frequency: profile?.weekly_frequency ?? '',
    }
  }, [profile])

  const [form, setForm] = useState(initialForm)

  // Resetear el form cuando llega un profile refresheado (post-save)
  useEffect(() => {
    setForm(initialForm)
  }, [initialForm])

  // Dirty check: comparación por valor (JSON.stringify alcanza porque son
  // primitivos + arrays simples, sin objetos anidados con orden inestable).
  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initialForm),
    [form, initialForm]
  )

  // ── Cambiar contraseña (sin cambios respecto a la versión previa) ────────────
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' })
  const [pwError, setPwError] = useState(null)
  const [pwSuccess, setPwSuccess] = useState(false)

  // ── Intake form (sin cambios respecto a la versión previa) ───────────────────
  const [formSubmission, setFormSubmission] = useState(null)
  const [formPending, setFormPending] = useState(false)
  const [formLoading, setFormLoading] = useState(true)

  useEffect(() => {
    if (!profile?.id) return
    async function loadForm() {
      setFormLoading(true)
      try {
        const [submissionRes, assignmentRes] = await Promise.all([
          supabase
            .from('intake_form_submissions')
            .select('*')
            .eq('student_id', profile.id)
            .order('submitted_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('intake_form_assignments')
            .select('id, status')
            .eq('student_id', profile.id)
            .in('status', ['pending', 'in_progress'])
            .limit(1)
            .maybeSingle(),
        ])
        setFormSubmission(submissionRes.data || null)
        setFormPending(!!assignmentRes.data)
      } finally {
        setFormLoading(false)
      }
    }
    loadForm()
  }, [profile?.id])

  function formatIntakeResponse(value) {
    if (value === null || value === undefined || value === '') return '—'
    if (typeof value === 'boolean') return value ? 'Sí' : 'No'
    if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '—'
    return String(value)
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  // ── Validación cliente ───────────────────────────────────────────────────────
  // Replica la regla del CHECK constraint `profiles_lesiones_requires_detail` que
  // exige descripción o patología distinta de "Ninguna" cuando tiene_lesiones=true.
  // Validar acá evita mostrar un error de constraint feo y permite UX más clara.
  function validate() {
    if (form.tiene_lesiones) {
      const hasDesc = form.descripcion_lesiones?.trim().length > 0
      const hasNonNingunaPat = form.patologias?.some((p) => p !== 'Ninguna')
      if (!hasDesc && !hasNonNingunaPat) {
        return 'Si marcaste que tenés lesiones, describilas o sumá una patología distinta a "Ninguna".'
      }
    }
    if (form.weight_kg !== '' && (form.weight_kg < 20 || form.weight_kg > 300)) {
      return 'El peso debe estar entre 20 y 300 kg.'
    }
    if (form.height_cm !== '' && (form.height_cm < 50 || form.height_cm > 250)) {
      return 'La altura debe estar entre 50 y 250 cm.'
    }
    if (
      form.target_weight_kg !== '' &&
      (form.target_weight_kg < 20 || form.target_weight_kg > 300)
    ) {
      return 'El objetivo de peso debe estar entre 20 y 300 kg.'
    }
    if (
      form.weekly_frequency !== '' &&
      (form.weekly_frequency < 1 || form.weekly_frequency > 7)
    ) {
      return 'La frecuencia debe estar entre 1 y 7 días por semana.'
    }
    if (form.goal_choice === 'Otro' && form.goal_other_text.trim().length === 0) {
      return 'Especificá tu objetivo en el campo "Otro".'
    }
    return null
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  async function saveProfile() {
    const validationError = validate()
    if (validationError) {
      setSaveError(validationError)
      return
    }

    // Anto 6=B: solo guardar si hizo cambios. Si no hay diff, cerrar editor sin UPDATE.
    if (!isDirty) {
      setEditing(false)
      return
    }

    setSaving(true)
    setSaveError(null)
    try {
      const goalToSave =
        form.goal_choice === 'Otro'
          ? form.goal_other_text.trim()
          : form.goal_choice || null

      const toNumber = (v) => (v === '' || v === null || v === undefined ? null : Number(v))

      const updates = {
        weight_kg: toNumber(form.weight_kg),
        height_cm: toNumber(form.height_cm),
        target_weight_kg: toNumber(form.target_weight_kg),
        goal: goalToSave,
        tiene_lesiones: form.tiene_lesiones,
        patologias: form.patologias.length ? form.patologias : null,
        descripcion_lesiones: form.descripcion_lesiones?.trim() || null,
        weekly_frequency:
          form.weekly_frequency === '' ? null : parseInt(form.weekly_frequency, 10),
      }

      const { error } = await supabase.from('profiles').update(updates).eq('id', profile.id)
      if (error) throw error

      await refreshProfile()
      setEditing(false)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    } catch (err) {
      console.error('[Q6] save profile error:', err)
      setSaveError(err.message || 'No se pudo guardar. Probá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  function cancelEdit() {
    setForm(initialForm)
    setSaveError(null)
    setEditing(false)
  }

  function togglePatologia(p) {
    setForm((prev) => {
      const has = prev.patologias.includes(p)
      // Regla UX: si seleccionás "Ninguna" se limpia el resto.
      // Si seleccionás otra cosa, se saca "Ninguna" automáticamente.
      if (p === 'Ninguna') {
        return { ...prev, patologias: has ? [] : ['Ninguna'] }
      }
      const next = has
        ? prev.patologias.filter((x) => x !== p)
        : [...prev.patologias.filter((x) => x !== 'Ninguna'), p]
      return { ...prev, patologias: next }
    })
  }

  async function changePassword() {
    setPwError(null)
    if (passwordForm.new !== passwordForm.confirm) {
      setPwError('Las contraseñas no coinciden')
      return
    }
    if (passwordForm.new.length < 6) {
      setPwError('La contraseña debe tener al menos 6 caracteres')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: passwordForm.new })
      if (error) throw error
      setPwSuccess(true)
      setPasswordForm({ current: '', new: '', confirm: '' })
      setTimeout(() => {
        setPwSuccess(false)
        setChangingPassword(false)
      }, 2000)
    } catch (err) {
      setPwError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const initials = profile?.name
    ?.split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary-600 to-primary-700 px-5 pt-12 pb-8 text-center">
        <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <span className="text-white font-bold text-2xl">{initials}</span>
        </div>
        <h1 className="text-xl font-bold text-white">{profile?.name}</h1>
        <p className="text-primary-200 text-sm mt-0.5">{profile?.email}</p>
        {profile?.level && (
          <span className="inline-block mt-2 badge bg-white/20 text-white capitalize">
            {profile.level === 'beginner'
              ? 'Principiante'
              : profile.level === 'intermediate'
                ? 'Intermedio'
                : 'Avanzado'}
          </span>
        )}
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Stats compactos (siempre visibles, no editables — vista rápida) */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Altura', value: profile?.height_cm ? `${profile.height_cm} cm` : '—' },
            { label: 'Peso', value: profile?.weight_kg ? `${profile.weight_kg} kg` : '—' },
            {
              label: 'Objetivo',
              value: profile?.target_weight_kg ? `${profile.target_weight_kg} kg` : '—',
            },
          ].map((item) => (
            <div key={item.label} className="card text-center">
              <p className="text-lg font-bold text-gray-900">{item.value}</p>
              <p className="text-xs text-gray-500">{item.label}</p>
            </div>
          ))}
        </div>

        {/* Card Mis datos — modo lectura / edición */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Mis datos</h3>
            {!editing && (
              <button
                onClick={() => {
                  setSaveError(null)
                  setEditing(true)
                }}
                className="text-primary-600 text-sm font-medium flex items-center gap-1"
              >
                <Pencil size={14} />
                Editar
              </button>
            )}
          </div>

          {/* Feedback global */}
          {saveSuccess && !editing && (
            <div className="mb-3 flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
              <CheckCircle2 size={14} />
              Datos actualizados. {profile?.coach_id && 'Tu coach fue notificado.'}
            </div>
          )}

          {/* ── Vista lectura ──────────────────────────────────────────────── */}
          {!editing && (
            <dl className="space-y-2 text-sm">
              <Row label="Peso actual" value={fmtNum(profile?.weight_kg, 'kg')} />
              <Row label="Altura" value={fmtNum(profile?.height_cm, 'cm')} />
              <Row label="Objetivo de peso" value={fmtNum(profile?.target_weight_kg, 'kg')} />
              <Row label="Objetivo entrenamiento" value={profile?.goal || '—'} />
              <Row
                label="Frecuencia"
                value={
                  profile?.weekly_frequency ? `${profile.weekly_frequency} días/semana` : '—'
                }
              />
              <Row
                label="¿Tenés lesiones?"
                value={
                  profile?.tiene_lesiones === true
                    ? 'Sí'
                    : profile?.tiene_lesiones === false
                      ? 'No'
                      : '—'
                }
              />
              {profile?.tiene_lesiones && (
                <>
                  <Row
                    label="Patologías"
                    value={
                      profile?.patologias?.length ? profile.patologias.join(', ') : '—'
                    }
                  />
                  <Row label="Descripción" value={profile?.descripcion_lesiones || '—'} />
                </>
              )}
            </dl>
          )}

          {/* ── Modo edición ───────────────────────────────────────────────── */}
          {editing && (
            <div className="space-y-4">
              {/* Errores de validación / save */}
              {saveError && (
                <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>{saveError}</span>
                </div>
              )}

              {/* Peso y altura en grid */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs">Peso (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="20"
                    max="300"
                    className="input"
                    value={form.weight_kg}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, weight_kg: e.target.value }))
                    }
                    placeholder="70.5"
                  />
                </div>
                <div>
                  <label className="label text-xs">Altura (cm)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="50"
                    max="250"
                    className="input"
                    value={form.height_cm}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, height_cm: e.target.value }))
                    }
                    placeholder="170"
                  />
                </div>
              </div>

              {/* Objetivo de peso + frecuencia */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs">Objetivo de peso (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="20"
                    max="300"
                    className="input"
                    value={form.target_weight_kg}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, target_weight_kg: e.target.value }))
                    }
                    placeholder="68"
                  />
                </div>
                <div>
                  <label className="label text-xs">Frecuencia (días/semana)</label>
                  <input
                    type="number"
                    min="1"
                    max="7"
                    step="1"
                    className="input"
                    value={form.weekly_frequency}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, weekly_frequency: e.target.value }))
                    }
                    placeholder="3"
                  />
                </div>
              </div>

              {/* Objetivo entrenamiento (goal) */}
              <div>
                <label className="label text-xs">Objetivo de entrenamiento</label>
                <select
                  className="input"
                  value={form.goal_choice}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, goal_choice: e.target.value }))
                  }
                >
                  <option value="">— Sin definir —</option>
                  {GOAL_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                  <option value="Otro">Otro…</option>
                </select>
                {form.goal_choice === 'Otro' && (
                  <textarea
                    className="input mt-2 min-h-[60px]"
                    placeholder="Describí tu objetivo"
                    value={form.goal_other_text}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, goal_other_text: e.target.value }))
                    }
                  />
                )}
              </div>

              {/* Lesiones (switch + condicional) */}
              <div className="border-t border-gray-100 pt-3 space-y-3">
                <label className="flex items-center justify-between text-sm">
                  <span className="text-gray-900 font-medium">¿Tenés alguna lesión?</span>
                  <input
                    type="checkbox"
                    className="w-5 h-5 accent-primary-600"
                    checked={form.tiene_lesiones}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, tiene_lesiones: e.target.checked }))
                    }
                  />
                </label>

                {form.tiene_lesiones && (
                  <>
                    <div>
                      <label className="label text-xs">Patologías</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {PATOLOGIAS_OPTIONS.map((p) => (
                          <label
                            key={p}
                            className={`text-xs flex items-center gap-2 px-2 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                              form.patologias.includes(p)
                                ? 'border-primary-500 bg-primary-50 text-primary-700'
                                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="w-3.5 h-3.5 accent-primary-600"
                              checked={form.patologias.includes(p)}
                              onChange={() => togglePatologia(p)}
                            />
                            {p}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="label text-xs">Descripción de la lesión</label>
                      <textarea
                        className="input min-h-[60px]"
                        placeholder="Contale al coach qué te molesta, desde cuándo, qué movimientos te limitan."
                        value={form.descripcion_lesiones}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, descripcion_lesiones: e.target.value }))
                        }
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Botones */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={cancelEdit}
                  className="btn-secondary text-sm py-2.5 flex-1"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  onClick={saveProfile}
                  disabled={saving}
                  className="btn-primary text-sm py-2.5 flex-1 flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Save size={14} />
                      {isDirty ? 'Guardar' : 'Cerrar'}
                    </>
                  )}
                </button>
              </div>
              {!isDirty && (
                <p className="text-[11px] text-gray-400 text-center -mt-1">
                  No hiciste cambios.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Formulario de ingreso (sin cambios) */}
        {!formLoading && (
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList size={15} className="text-primary-500" />
                <h3 className="font-semibold text-gray-900 text-sm">Mis datos de ingreso</h3>
              </div>
              {formSubmission && (
                <span className="badge bg-green-100 text-green-700 text-xs flex items-center gap-1">
                  <FileCheck size={11} /> Completado
                </span>
              )}
            </div>

            {!formSubmission && formPending && (
              <div className="space-y-2">
                <p className="text-sm text-gray-600">Tu coach te envió el formulario de ingreso.</p>
                <button
                  onClick={() => navigate('/student/intake')}
                  className="btn-primary text-sm w-full"
                >
                  Completar formulario
                </button>
              </div>
            )}

            {!formSubmission && !formPending && (
              <p className="text-sm text-gray-400 italic">
                Tu coach todavía no te envió el formulario de ingreso.
              </p>
            )}

            {formSubmission && (
              <div className="space-y-4">
                <p className="text-xs text-gray-400">
                  Enviado el{' '}
                  {format(parseISO(formSubmission.submitted_at), "d 'de' MMMM yyyy", {
                    locale: es,
                  })}
                </p>

                {(formSubmission.form_snapshot?.modules || [])
                  .filter((m) => m.enabled)
                  .sort((a, b) => a.order - b.order)
                  .map((module) => {
                    const answered = (module.questions || []).filter((q) => {
                      if (q.id?.startsWith('consentimiento')) return false
                      const val = formSubmission.responses?.[q.id]
                      return (
                        val !== undefined &&
                        val !== null &&
                        val !== '' &&
                        !(Array.isArray(val) && val.length === 0)
                      )
                    })
                    if (!answered.length) return null
                    return (
                      <div key={module.id} className="space-y-2">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                          {module.emoji} {module.title}
                        </p>
                        <div className="space-y-2">
                          {answered.map((q) => (
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
        )}

        {/* Cambiar contraseña (sin cambios) */}
        <div className="card">
          <button
            onClick={() => setChangingPassword(!changingPassword)}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Lock size={16} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-900">Cambiar contraseña</span>
            </div>
            <ChevronRight
              size={16}
              className={`text-gray-400 transition-transform ${changingPassword ? 'rotate-90' : ''}`}
            />
          </button>

          {changingPassword && (
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
              <div>
                <label className="label text-xs">Nueva contraseña</label>
                <input
                  type="password"
                  className="input"
                  value={passwordForm.new}
                  onChange={(e) => setPasswordForm((p) => ({ ...p, new: e.target.value }))}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <div>
                <label className="label text-xs">Confirmar contraseña</label>
                <input
                  type="password"
                  className="input"
                  value={passwordForm.confirm}
                  onChange={(e) => setPasswordForm((p) => ({ ...p, confirm: e.target.value }))}
                  placeholder="Repetir contraseña"
                />
              </div>
              {pwError && <p className="text-xs text-red-600">{pwError}</p>}
              {pwSuccess && <p className="text-xs text-green-600">✓ Contraseña actualizada</p>}
              <button
                onClick={changePassword}
                disabled={saving}
                className="btn-primary w-full text-sm flex items-center justify-center gap-1.5"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  'Actualizar contraseña'
                )}
              </button>
            </div>
          )}
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="btn-secondary w-full flex items-center justify-center gap-2 text-red-600 border-red-200 hover:bg-red-50"
        >
          <LogOut size={16} />
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}

// ── Helpers locales ────────────────────────────────────────────────────────────
function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-900 font-medium text-right">{value}</dd>
    </div>
  )
}

function fmtNum(v, unit) {
  if (v === null || v === undefined || v === '') return '—'
  return `${v} ${unit}`
}
