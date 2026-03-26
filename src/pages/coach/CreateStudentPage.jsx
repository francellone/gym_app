import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { ArrowLeft, User, Save, AlertCircle } from 'lucide-react'

export default function CreateStudentPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

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
    target_weight_kg: '',
  })

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // 1. Crear usuario en Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: form.email,
        password: form.password,
        email_confirm: true,
        user_metadata: { name: form.name, role: 'student' }
      })

      if (authError) throw authError

      // 2. Actualizar perfil con datos adicionales
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          dni: form.dni || null,
          birth_date: form.birth_date || null,
          gender: form.gender || null,
          height_cm: form.height_cm ? parseFloat(form.height_cm) : null,
          weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
          level: form.level || null,
          weekly_frequency: form.weekly_frequency ? parseInt(form.weekly_frequency) : null,
          goal: form.goal || null,
          coach_notes: form.coach_notes || null,
          target_weight_kg: form.target_weight_kg ? parseFloat(form.target_weight_kg) : null,
        })
        .eq('id', authData.user.id)

      if (profileError) throw profileError

      navigate('/coach/students')
    } catch (err) {
      console.error(err)
      // Si el admin API no está disponible, usar signup normal
      try {
        const { data: signupData, error: signupError } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            data: { name: form.name, role: 'student' }
          }
        })
        if (signupError) throw signupError

        if (signupData.user) {
          await supabase.from('profiles').update({
            dni: form.dni || null,
            birth_date: form.birth_date || null,
            gender: form.gender || null,
            height_cm: form.height_cm ? parseFloat(form.height_cm) : null,
            weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
            level: form.level || null,
            weekly_frequency: form.weekly_frequency ? parseInt(form.weekly_frequency) : null,
            goal: form.goal || null,
            coach_notes: form.coach_notes || null,
            target_weight_kg: form.target_weight_kg ? parseFloat(form.target_weight_kg) : null,
          }).eq('id', signupData.user.id)
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
      {/* Header */}
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
              <input name="name" value={form.name} onChange={handleChange} className="input" required placeholder="Juan Pérez" />
            </div>
            <div>
              <label className="label">Email *</label>
              <input name="email" type="email" value={form.email} onChange={handleChange} className="input" required placeholder="juan@email.com" />
            </div>
            <div>
              <label className="label">Contraseña *</label>
              <input name="password" type="password" value={form.password} onChange={handleChange} className="input" required minLength={6} placeholder="Mínimo 6 caracteres" />
            </div>
            <div>
              <label className="label">DNI / ID</label>
              <input name="dni" value={form.dni} onChange={handleChange} className="input" placeholder="Opcional" />
            </div>
            <div>
              <label className="label">Fecha de nacimiento</label>
              <input name="birth_date" type="date" value={form.birth_date} onChange={handleChange} className="input" />
            </div>
            <div>
              <label className="label">Género</label>
              <select name="gender" value={form.gender} onChange={handleChange} className="input">
                <option value="">Sin especificar</option>
                <option value="male">Masculino</option>
                <option value="female">Femenino</option>
                <option value="other">Otro</option>
              </select>
            </div>
            <div>
              <label className="label">Altura (cm)</label>
              <input name="height_cm" type="number" step="0.1" value={form.height_cm} onChange={handleChange} className="input" placeholder="175" />
            </div>
            <div>
              <label className="label">Peso actual (kg)</label>
              <input name="weight_kg" type="number" step="0.1" value={form.weight_kg} onChange={handleChange} className="input" placeholder="75" />
            </div>
            <div>
              <label className="label">Peso objetivo (kg)</label>
              <input name="target_weight_kg" type="number" step="0.1" value={form.target_weight_kg} onChange={handleChange} className="input" placeholder="Opcional" />
            </div>
          </div>
        </div>

        {/* Datos de entrenamiento */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-900">Entrenamiento</h2>

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
              <input name="weekly_frequency" type="number" min="1" max="7" value={form.weekly_frequency} onChange={handleChange} className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Objetivo</label>
              <input name="goal" value={form.goal} onChange={handleChange} className="input" placeholder="Ej: Hipertrofia, fuerza, salud..." />
            </div>
          </div>
        </div>

        {/* Notas privadas */}
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

        <div className="flex gap-3">
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary flex-1">
            Cancelar
          </button>
          <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Save size={16} />
                Guardar alumno
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
