/**
 * PÁGINA COACH – EDITOR DE PLANTILLA DE SEGUIMIENTO
 * Rutas: /coach/follow-up-forms/new
 *        /coach/follow-up-forms/:id
 *
 * Reusa FormBuilder con formKind='follow_up'.
 * Antes de guardar pide nombre (la primera vez).
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import FormBuilder from '@/features/forms/intake/components/coach/FormBuilder'
import { buildFollowUpFormConfig } from '@/features/forms/intake/schema/default-form.js'
import { ArrowLeft } from 'lucide-react'

export default function FollowUpFormBuilderPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isNew = id === 'new' || !id

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState(null) // 'saved' | 'error' | string
  const [otherTemplates, setOtherTemplates] = useState([])

  useEffect(() => {
    if (!profile?.id) return
    load()
  }, [profile?.id, id])

  async function load() {
    setLoading(true)

    // Otras plantillas para "cargar como punto de partida"
    const { data: tpls } = await supabase
      .from('intake_form_templates')
      .select('*')
      .eq('coach_id', profile.id)
      .eq('form_kind', 'follow_up')
      .eq('is_active', true)
    setOtherTemplates(tpls?.filter(t => t.id !== id) || [])

    if (isNew) {
      setConfig(buildFollowUpFormConfig())
      setName('')
      setDescription('')
      setLoading(false)
      return
    }

    const { data } = await supabase
      .from('intake_form_templates')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (!data) {
      navigate('/coach/follow-up-forms')
      return
    }

    setName(data.name || '')
    setDescription(data.description || '')
    setConfig(data.config || buildFollowUpFormConfig())
    setLoading(false)
  }

  async function handleSave(newConfig) {
    setSaveStatus(null)

    // Si todavía no hay nombre, pedirlo
    let finalName = name
    if (!finalName?.trim()) {
      const promptName = window.prompt('Nombre de la plantilla:', 'Check-in mitad de plan')
      if (!promptName?.trim()) return
      finalName = promptName.trim()
      setName(finalName)
    }

    try {
      if (isNew) {
        const { data, error } = await supabase
          .from('intake_form_templates')
          .insert({
            coach_id: profile.id,
            name: finalName,
            description: description || null,
            config: newConfig,
            form_kind: 'follow_up',
            is_active: true,
            is_default: false,
          })
          .select()
          .single()

        if (error) {
          // El trigger DB lanza si hay >10
          setSaveStatus(error.message?.includes('Límite alcanzado')
            ? 'Llegaste al límite de 10 plantillas activas. Archivá una antes de crear otra.'
            : 'error')
          return
        }

        setConfig(newConfig)
        setSaveStatus('saved')
        // Redirigir al editor con id real (para que próximas guardadas updateen)
        navigate(`/coach/follow-up-forms/${data.id}`, { replace: true })
      } else {
        const { error } = await supabase
          .from('intake_form_templates')
          .update({
            name: finalName,
            description: description || null,
            config: newConfig,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)

        if (error) {
          setSaveStatus('error')
          return
        }

        setConfig(newConfig)
        setSaveStatus('saved')
      }

      setTimeout(() => setSaveStatus(null), 3000)
    } catch (err) {
      console.error('[FollowUpFormBuilderPage] save error', err)
      setSaveStatus('error')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      {/* Toast */}
      {saveStatus === 'saved' && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg">
          ✅ Guardado
        </div>
      )}
      {saveStatus === 'error' && (
        <div className="fixed top-4 right-4 z-50 bg-red-600 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg">
          ❌ Error al guardar
        </div>
      )}
      {typeof saveStatus === 'string' && saveStatus !== 'saved' && saveStatus !== 'error' && (
        <div className="fixed top-4 right-4 z-50 bg-amber-600 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg max-w-xs">
          ⚠ {saveStatus}
        </div>
      )}

      {/* Cabecera con nombre + descripción + back */}
      <div className="max-w-3xl mx-auto pt-6 px-4 space-y-3">
        <button
          onClick={() => navigate('/coach/follow-up-forms')}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={14} /> Volver
        </button>

        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nombre del formulario</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej: Check-in mitad de plan"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Descripción (opcional)</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Breve descripción para vos"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <FormBuilder
        coachId={profile.id}
        initialConfig={config}
        templates={otherTemplates}
        onSave={handleSave}
        onSendToStudent={null}
        formKind="follow_up"
      />
    </div>
  )
}
