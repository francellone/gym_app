import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { ArrowLeft, User, Dumbbell, Save, AlertCircle, AlertTriangle } from 'lucide-react'

// ============================================================
// Validaciones de datos del alumno
// ============================================================
function validateStudentData(form) {
  const errors = {}

  if (!form.name.trim()) errors.name = 'El nombre es obligatorio'
  if (!form.email.trim()) errors.email = 'El email es obligatorio'
  if (!form.password || form.password.length < 6) errors.password = 'Mínimo 6 caracteres'

  if (form.height_cm) {
    const h = parseFloat(form.height_cm)
    if (isNaN(h) || h < 50 || h > 250) errors.height_cm = 'Altura inválida (50–250 cm)'
  }
  if (form.weight_kg) {
    const w = parseFloat(form.weight_kg)
    if (isNaN(w) || w < 20 || w > 200) errors.weight_kg = 'Peso inválido (20–200 kg)'
  }
  if (form.target_weight_kg) {
    const w = parseFloat(form.target_weight_kg)
    if (isNaN(w) || w < 20 || w > 200) errors.target_weight_kg = 'Peso objetivo inválido (20–200 kg)'
  }
  if (form.birth_date) {
    const birth = new Date(form.birth_date)
    const now = new Date()
    const age = (now - birth) / (365.25 * 24 * 3600 * 1000)
    if (age < 5 || age > 110) errors.birth_date = 'Fecha de nacimiento inválida'
  }
  if (form.weekly_frequency) {
    const f = parseInt(form.weekly_frequency)
    if (isNaN(f) || f < 1 || f > 7) errors.weekly_frequency = 'Frecuencia entre 1 y 7 días'
  }

  return errors
}

function FieldError({ msg }) {
  if (!msg) return null
  return (
    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
      <AlertTriangle size={11} /> {msg}
    </p>
  )
}

export default function CreateStudentPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  const [form, setForm] = useState({
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
    coach_notes: '',
    observations: '',
    target_weight_kg: '',
  })

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    // Limpiar error del campo al editar
    if (fieldErrors[name]) {
      setFieldErrors(prev => ({ ...prev, [name]: undefined }))
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    // Validar
    const errors = validateStudentData(form)
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
      coach_notes: form.coach_notes || null,
      observations: form.observations || null,
      target_weight_kg: form.target_weight_kg ? parseFloat(form.target_weight_kg) : null,
    }

    try {
      // Intentar con admin API primero
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: form.email,
        password: form.password,
        email_confirm: true,
        user_metadata: { name: form.name, role: 'student' }
      })

      if (authError) throw authError

      const { error: profileError } = await supabase
        .from('profiles')
        .update(profileData)
        .eq('id', authData.user.id)
      if (profileError) throw profileError

      navigate('/coach/students')
    } catch (err) {
      // Fallback: signup normal
      try {
        const { data: signupData, error: signupError } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: { data: { name: form.name, role: 'student' } }
        })
        if (signupError) throw signupError

        if (signupData.user) {
          await supabase.from('profiles').update(profileData).eq('id', signupData.user.id)
        }
        navigate('/coach/students')
      } catch (err2) {
        setError(err2.message || 'Error al crear el alumno')
      }
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
          <h1 className="text-2xl font-bold text-gray-900">Nuevo alumno</h1>
          <p className="text-sm text-gray-500">Completá los datos del alumno</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Datos personales */}
        <div className="card space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
              <User size={14} className="text-blue-600" />
            </div>
            <h2 className="font-semibold text-gray-900">Datos personales</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Nombre completo *</label>
              <input name="name" value={form.name} onChange={handleChange} className={`input ${fieldErrors.name ? 'border-red-400' : ''}`} required placeholder="Juan Pérez" />
              <FieldError msg={fieldErrors.name} />
            </div>
            <div>
              <label className="label">Email *</label>
              <input name="email" type="email" value={form.email} onChange={handleChange} className={`input ${fieldErrors.email ? 'border-red-400' : ''}`} required placeholder="juan@email.com" />
              <FieldError msg={fieldErrors.email} />
            </div>
            <div>
              <label className="label">Contraseña *</label>
              <input name="password" type="password" value={form.password} onChange={handleChange} className={`input ${fieldErrors.password ? 'border-red-400' : ''}`} required placeholder="Mínimo 6 caracteres" />
              <FieldError msg={fieldErrors.password} />
            </div>
            <div>
              <label className="label">DNI / ID</label>
              <input name="dni" value={form.dni} onChange={handleChange} className="input" placeholder="Opcional" />
            </div>
            <div>
              <label className="label">Fecha de nacimiento</label>
              <input name="birth_date" type="date" value={form.birth_date} onChange={handleChange} className={`input ${fieldErrors.birth_date ? 'border-red-400' : ''}`} />
              <FieldError msg={fieldErrors.birth_date} />
            </div>
            <div>
              <label className="label">Sexo</label>
              <select name="gender" value={form.gender} onChange={handleChange} className="input">
                <option value="">Sin especificar</option>
                <option value="male">Masculino</option>
                <option value="female">Femenino</option>
                <option value="other">Otro</option>
              </select>
            </div>
            <div>
              <label className="label">Altura (cm)</label>
              <input name="height_cm" type="number" step="0.1" min="50" max="250" value={form.height_cm} onChange={handleChange} className={`input ${fieldErrors.height_cm ? 'border-red-400' : ''}`} placeholder="175" />
              <FieldError msg={fieldErrors.height_cm} />
            </div>
            <div>
              <label className="label">Peso actual (kg)</label>
              <input name="weight_kg" type="number" step="0.1" min="20" max="200" value={form.weight_kg} onChange={handleChange} className={`input ${fieldErrors.weight_kg ? 'border-red-400' : ''}`} placeholder="75" />
              <FieldError msg={fieldErrors.weight_kg} />
            </div>
            <div>
              <label className="label">Peso objetivo (kg)</label>
              <input name="target_weight_kg" type="number" step="0.1" min="20" max="200" value={form.target_weight_kg} onChange={handleChange} className={`input ${fieldErrors.target_weight_kg ? 'border-red-400' : ''}`} placeholder="Opcional" />
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
            <h2 className="font-semibold text-gray-900">Entrenamiento</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Nivel</label>
              <select name="level" value={form.level} onChange={handleChange} className="input">
                <option value="beginner">Principiante</option>
                <option value="intermediate">Intermedio</option>
                <option value="advanced">Avanzado</option>
              </select>
            </div>
            <div>
              <label className="label">Frecuencia semanal (días)</label>
              <input name="weekly_frequency" type="number" min="1" max="7" value={form.weekly_frequency} onChange={handleChange} className={`input ${fieldErrors.weekly_frequency ? 'border-red-400' : ''}`} />
              <FieldError msg={fieldErrors.weekly_frequency} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Objetivo</label>
              <input name="goal" value={form.goal} onChange={handleChange} className="input" placeholder="Ej: Hipertrofia, fuerza, salud..." />
            </div>
          </div>
        </div>

        {/* Observaciones (visibles para ambos) */}
        <div className="card space-y-3">
          <div>
            <h2 className="font-semibold text-gray-900">Observaciones del alumno</h2>
            <p className="text-xs text-gray-500 mt-0.5">Visibles para vos y el alumno</p>
          </div>
          <textarea
            name="observations"
            value={form.observations}
            onChange={handleChange}
            className="input resize-none"
            rows={3}
            placeholder="Particularidades, historial relevante, preferencias..."
          />
        </div>

        {/* Notas privadas del coach */}
        <div className="card space-y-3">
          <div>
            <h2 className="font-semibold text-gray-900">Notas privadas del coach</h2>
            <p className="text-xs text-gray-500 mt-0.5">Solo vos podés ver estas notas</p>
          </div>
          <textarea
            name="coach_notes"
            value={form.coach_notes}
            onChange={handleChange}
            className="input resize-none"
            rows={3}
            placeholder="Lesiones, consideraciones especiales..."
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-3 text-sm">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="flex gap-3 pb-8">
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary flex-1">
            Cancelar
          </button>
          <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <><Save size={16} />Guardar alumno</>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
