import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { ArrowLeft, User, Dumbbell, Save, AlertCircle, AlertTriangle } from 'lucide-react'
import WelcomeMessageCard from '../components/WelcomeMessageCard'

// ============================================================
// Validaciones de datos del alumno
// ============================================================
function validateStudentData(form, t) {
  const errors = {}

  if (!form.name.trim()) errors.name = t('coach.students.create.errors.nameRequired')
  if (!form.email.trim()) errors.email = t('coach.students.create.errors.emailRequired')
  if (!form.password || form.password.length < 6)
    errors.password = t('coach.students.create.errors.passwordMin')

  if (form.height_cm) {
    const h = parseFloat(form.height_cm)
    if (isNaN(h) || h < 50 || h > 250)
      errors.height_cm = t('coach.students.create.errors.heightInvalid')
  }
  if (form.weight_kg) {
    const w = parseFloat(form.weight_kg)
    if (isNaN(w) || w < 20 || w > 200)
      errors.weight_kg = t('coach.students.create.errors.weightInvalid')
  }
  if (form.target_weight_kg) {
    const w = parseFloat(form.target_weight_kg)
    if (isNaN(w) || w < 20 || w > 200)
      errors.target_weight_kg = t('coach.students.create.errors.targetWeightInvalid')
  }
  if (form.birth_date) {
    const birth = new Date(form.birth_date)
    const now = new Date()
    const age = (now - birth) / (365.25 * 24 * 3600 * 1000)
    if (age < 5 || age > 110) errors.birth_date = t('coach.students.create.errors.birthDateInvalid')
  }
  if (form.weekly_frequency) {
    const f = parseInt(form.weekly_frequency)
    if (isNaN(f) || f < 1 || f > 7)
      errors.weekly_frequency = t('coach.students.create.errors.frequencyInvalid')
  }

  return errors
}

// ============================================================
// Traducción de errores de Supabase Auth al idioma de la coach
// ============================================================
function translateAuthError(msg = '', t) {
  const m = msg.toLowerCase()

  if (
    m.includes('rate limit') ||
    m.includes('over_email_send_rate_limit') ||
    m.includes('email rate limit')
  )
    return t('coach.students.create.errors.rateLimit')

  if (
    m.includes('user already registered') ||
    m.includes('already been registered') ||
    m.includes('email already')
  )
    return t('coach.students.create.errors.alreadyExists')

  if (m.includes('email address not authorized') || m.includes('not_authorized'))
    return t('coach.students.create.errors.notAuthorized')

  if (
    m.includes('invalid email') ||
    m.includes('invalid_email') ||
    m.includes('unable to validate email')
  )
    return t('coach.students.create.errors.invalidEmail')

  if (m.includes('weak password') || m.includes('password should be'))
    return t('coach.students.create.errors.weakPassword')

  if (m.includes('identities') || m.includes('ya existe un alumno'))
    return t('coach.students.create.errors.alreadyExists')

  if (m.includes('confirmación de email') || m.includes('email not confirmed'))
    return t('coach.students.create.errors.emailNotConfirmed')

  if (m.includes('network') || m.includes('fetch')) return t('coach.students.create.errors.network')

  // Si no matchea nada, devolver el mensaje original
  return msg || t('coach.students.create.errors.unknown')
}

function FieldError({ msg }) {
  if (!msg) return null
  return (
    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
      <AlertTriangle size={11} /> {msg}
    </p>
  )
}

const initialForm = {
  name: '',
  email: '',
  password: '',
  dni: '',
  birth_date: '',
  gender: '',
  height_cm: '',
  weight_kg: '',
  level: 'beginner',
  weekly_frequency: 3,
  goal: '',
  language: 'es', // Doc 46: idioma de la UI que va a ver el alumno

  // observations + coach_notes migraron al panel de notas (Fase D /
  // round 2b). Para escribirlas: crear primero el alumno y después
  // ir al tab "Notas" en su detalle.
  target_weight_kg: '',
}

export default function CreateStudentPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  // Cuenta recién creada: se muestra el mensaje listo para mandar
  const [created, setCreated] = useState(null)

  const [form, setForm] = useState(initialForm)

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    // Limpiar error del campo al editar
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }))
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    // Validar
    const errors = validateStudentData(form, t)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})
    setLoading(true)

    const profileData = {
      dni: form.dni || null,
      birth_date: form.birth_date || null,
      gender: form.gender || null,
      height_cm: form.height_cm ? parseFloat(form.height_cm) : null,
      weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
      level: form.level || null,
      weekly_frequency: form.weekly_frequency ? parseInt(form.weekly_frequency) : null,
      goal: form.goal || null,
      target_weight_kg: form.target_weight_kg ? parseFloat(form.target_weight_kg) : null,
      language: form.language || 'es', // Doc 46
      coach_id: profile?.id || null,
    }

    try {
      // Llamamos a la Edge Function con permisos de admin.
      // Ventajas: sin rate limit de emails, sin tocar la sesión del coach,
      // el alumno queda confirmado al instante (email_confirm: true).
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-student`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            email: form.email,
            password: form.password,
            name: form.name,
            profileData,
          }),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || t('coach.students.create.errors.createFailed'))
      }

      setCreated({
        id: result.user?.id,
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        language: form.language || 'es',
      })
      window.scrollTo?.(0, 0)
    } catch (err) {
      setError(translateAuthError(err.message, t))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-ghost p-2">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('coach.students.create.title')}</h1>
          <p className="text-sm text-gray-500">{t('coach.students.create.subtitle')}</p>
        </div>
      </div>

      {created ? (
        <WelcomeMessageCard
          created={created}
          coachName={profile?.name}
          onViewProfile={() =>
            navigate(created.id ? `/coach/students/${created.id}` : '/coach/students')
          }
          onCreateAnother={() => {
            setCreated(null)
            setForm(initialForm)
          }}
          onBack={() => navigate('/coach/students')}
        />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Datos personales */}
          <div className="card space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
                <User size={14} className="text-blue-600" />
              </div>
              <h2 className="font-semibold text-gray-900">
                {t('coach.students.info.personalData')}
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label">{t('coach.students.create.fullName')}</label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  className={`input ${fieldErrors.name ? 'border-red-400' : ''}`}
                  required
                  placeholder={t('coach.students.create.namePlaceholder')}
                />
                <FieldError msg={fieldErrors.name} />
              </div>
              <div>
                <label className="label">{t('coach.students.create.email')}</label>
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  className={`input ${fieldErrors.email ? 'border-red-400' : ''}`}
                  required
                  placeholder={t('coach.students.create.emailPlaceholder')}
                />
                <FieldError msg={fieldErrors.email} />
              </div>
              <div>
                <label className="label">{t('coach.students.create.password')}</label>
                <input
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={handleChange}
                  className={`input ${fieldErrors.password ? 'border-red-400' : ''}`}
                  required
                  placeholder={t('coach.students.create.errors.passwordMin')}
                />
                <FieldError msg={fieldErrors.password} />
              </div>
              <div>
                <label className="label">{t('coach.students.create.dni')}</label>
                <input
                  name="dni"
                  value={form.dni}
                  onChange={handleChange}
                  className="input"
                  placeholder={t('coach.students.create.optional')}
                />
              </div>
              <div>
                <label className="label">{t('coach.students.fields.birth_date')}</label>
                <input
                  name="birth_date"
                  type="date"
                  value={form.birth_date}
                  onChange={handleChange}
                  className={`input ${fieldErrors.birth_date ? 'border-red-400' : ''}`}
                />
                <FieldError msg={fieldErrors.birth_date} />
              </div>
              <div>
                <label className="label">{t('coach.students.fields.gender')}</label>
                <select name="gender" value={form.gender} onChange={handleChange} className="input">
                  <option value="">{t('coach.students.info.unspecified')}</option>
                  <option value="male">{t('coach.students.genderOptions.male')}</option>
                  <option value="female">{t('coach.students.genderOptions.female')}</option>
                  <option value="other">{t('coach.students.genderOptions.other')}</option>
                </select>
              </div>
              <div>
                <label className="label">{t('coach.students.fields.height_cm')}</label>
                <input
                  name="height_cm"
                  type="number"
                  step="0.1"
                  min="50"
                  max="250"
                  value={form.height_cm}
                  onChange={handleChange}
                  className={`input ${fieldErrors.height_cm ? 'border-red-400' : ''}`}
                  placeholder="175"
                />
                <FieldError msg={fieldErrors.height_cm} />
              </div>
              <div>
                <label className="label">{t('coach.students.create.currentWeight')}</label>
                <input
                  name="weight_kg"
                  type="number"
                  step="0.1"
                  min="20"
                  max="200"
                  value={form.weight_kg}
                  onChange={handleChange}
                  className={`input ${fieldErrors.weight_kg ? 'border-red-400' : ''}`}
                  placeholder="75"
                />
                <FieldError msg={fieldErrors.weight_kg} />
              </div>
              <div>
                <label className="label">{t('coach.students.info.targetWeightKg')}</label>
                <input
                  name="target_weight_kg"
                  type="number"
                  step="0.1"
                  min="20"
                  max="200"
                  value={form.target_weight_kg}
                  onChange={handleChange}
                  className={`input ${fieldErrors.target_weight_kg ? 'border-red-400' : ''}`}
                  placeholder={t('coach.students.create.optional')}
                />
                <FieldError msg={fieldErrors.target_weight_kg} />
              </div>
            </div>
          </div>

          {/* Datos de entrenamiento */}
          <div className="card space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-orange-100 rounded-lg flex items-center justify-center">
                <Dumbbell size={14} className="text-orange-600" />
              </div>
              <h2 className="font-semibold text-gray-900">{t('coach.students.create.training')}</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">{t('coach.students.fields.level')}</label>
                <select name="level" value={form.level} onChange={handleChange} className="input">
                  <option value="beginner">{t('coach.students.levelOptions.beginner')}</option>
                  <option value="intermediate">
                    {t('coach.students.levelOptions.intermediate')}
                  </option>
                  <option value="advanced">{t('coach.students.levelOptions.advanced')}</option>
                </select>
              </div>
              <div>
                <label className="label">{t('coach.students.create.frequency')}</label>
                <input
                  name="weekly_frequency"
                  type="number"
                  min="1"
                  max="7"
                  value={form.weekly_frequency}
                  onChange={handleChange}
                  className={`input ${fieldErrors.weekly_frequency ? 'border-red-400' : ''}`}
                />
                <FieldError msg={fieldErrors.weekly_frequency} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">{t('coach.students.fields.goal')}</label>
                <input
                  name="goal"
                  value={form.goal}
                  onChange={handleChange}
                  className="input"
                  placeholder={t('coach.students.create.goalPlaceholder')}
                />
              </div>
              {/* Doc 46: idioma de la UI que va a ver el alumno (la vista del
                alumno está traducida; el panel del coach queda en español) */}
              <div>
                <label className="label">{t('coach.students.fields.language')}</label>
                <select
                  name="language"
                  value={form.language}
                  onChange={handleChange}
                  className="input"
                >
                  <option value="es">{t('coach.students.languageOptions.es')}</option>
                  <option value="en">{t('coach.students.languageOptions.en')}</option>
                </select>
              </div>
            </div>
          </div>

          {/* Las observaciones y notas privadas se escriben desde el panel
            de Notas del alumno después de crearlo (round 2b: las columnas
            legacy se dropearon, todo vive en notes). */}

          {error && (
            <div className="flex items-start gap-2 text-red-700 bg-red-50 border border-red-200 rounded-xl p-4 text-sm">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-3 pb-8">
            <button type="button" onClick={() => navigate(-1)} className="btn-secondary flex-1">
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Save size={16} />
                  {t('coach.students.create.submit')}
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
