import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { User, LogOut, Save, ChevronRight, Lock } from 'lucide-react'

export default function ProfilePage() {
  const { profile, signOut, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    weight_kg: profile?.weight_kg || '',
  })
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' })
  const [pwError, setPwError] = useState(null)
  const [pwSuccess, setPwSuccess] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  async function saveWeight() {
    setSaving(true)
    try {
      await supabase.from('profiles').update({
        weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
      }).eq('id', profile.id)
      await refreshProfile()
      setEditing(false)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
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
      setTimeout(() => { setPwSuccess(false); setChangingPassword(false) }, 2000)
    } catch (err) {
      setPwError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const initials = profile?.name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()

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
            {profile.level === 'beginner' ? 'Principiante' : profile.level === 'intermediate' ? 'Intermedio' : 'Avanzado'}
          </span>
        )}
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Altura', value: profile?.height_cm ? `${profile.height_cm}cm` : '—' },
            { label: 'Peso', value: profile?.weight_kg ? `${profile.weight_kg}kg` : '—' },
            { label: 'Objetivo', value: profile?.target_weight_kg ? `${profile.target_weight_kg}kg` : '—' },
          ].map(item => (
            <div key={item.label} className="card text-center">
              <p className="text-lg font-bold text-gray-900">{item.value}</p>
              <p className="text-xs text-gray-500">{item.label}</p>
            </div>
          ))}
        </div>

        {/* Update weight */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Actualizar peso</h3>
            {!editing && (
              <button onClick={() => setEditing(true)} className="text-primary-600 text-sm font-medium">
                Editar
              </button>
            )}
          </div>
          {editing ? (
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="label text-xs">Peso actual (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  className="input"
                  value={form.weight_kg}
                  onChange={e => setForm(p => ({ ...p, weight_kg: e.target.value }))}
                  placeholder="70.5"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing(false)} className="btn-secondary text-sm py-2.5">
                  Cancelar
                </button>
                <button onClick={saveWeight} disabled={saving} className="btn-primary text-sm py-2.5 flex items-center gap-1.5">
                  {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Save size={14} />Guardar</>}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              {profile?.weight_kg ? `${profile.weight_kg} kg` : 'No registrado'}
            </p>
          )}
        </div>

        {/* Goal & plan */}
        {(profile?.goal || profile?.weekly_frequency) && (
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-3">Mi entrenamiento</h3>
            <div className="space-y-2">
              {profile.goal && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Objetivo</span>
                  <span className="text-gray-900 font-medium">{profile.goal}</span>
                </div>
              )}
              {profile.weekly_frequency && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Frecuencia</span>
                  <span className="text-gray-900 font-medium">{profile.weekly_frequency} días/semana</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Change password */}
        <div className="card">
          <button
            onClick={() => setChangingPassword(!changingPassword)}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Lock size={16} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-900">Cambiar contraseña</span>
            </div>
            <ChevronRight size={16} className={`text-gray-400 transition-transform ${changingPassword ? 'rotate-90' : ''}`} />
          </button>

          {changingPassword && (
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
              <div>
                <label className="label text-xs">Nueva contraseña</label>
                <input
                  type="password"
                  className="input"
                  value={passwordForm.new}
                  onChange={e => setPasswordForm(p => ({ ...p, new: e.target.value }))}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <div>
                <label className="label text-xs">Confirmar contraseña</label>
                <input
                  type="password"
                  className="input"
                  value={passwordForm.confirm}
                  onChange={e => setPasswordForm(p => ({ ...p, confirm: e.target.value }))}
                  placeholder="Repetir contraseña"
                />
              </div>
              {pwError && <p className="text-xs text-red-600">{pwError}</p>}
              {pwSuccess && <p className="text-xs text-green-600">✓ Contraseña actualizada</p>}
              <button onClick={changePassword} disabled={saving} className="btn-primary w-full text-sm flex items-center justify-center gap-1.5">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Actualizar contraseña'}
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
