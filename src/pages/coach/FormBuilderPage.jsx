/**
 * PÁGINA COACH – CONSTRUCTOR DE FORMULARIO DE INGRESO
 * Ruta: /coach/form-builder
 *
 * Carga la config guardada del coach (o el default),
 * conecta FormBuilder con Supabase y gestiona plantillas.
 */

import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import FormBuilder from '../../../intake-form/components/coach/FormBuilder'
import { buildFormConfig } from '../../../intake-form/schema/default-form.js'

export default function FormBuilderPage() {
  const { profile } = useAuth()
  const [formConfig, setFormConfig] = useState(null)
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState(null) // 'saved' | 'error'

  // ── Cargar config y plantillas del coach ─────────────────
  useEffect(() => {
    if (!profile?.id) return

    async function load() {
      setLoading(true)
      try {
        // Buscar el formulario default del coach
        const { data: defaultForm } = await supabase
          .from('intake_form_templates')
          .select('*')
          .eq('coach_id', profile.id)
          .eq('is_default', true)
          .maybeSingle()

        if (defaultForm) {
          setFormConfig(defaultForm.config)
        } else {
          // Primer uso: usar la config base
          setFormConfig(buildFormConfig())
        }

        // Cargar todas las plantillas del coach
        const { data: tpls } = await supabase
          .from('intake_form_templates')
          .select('*')
          .eq('coach_id', profile.id)
          .order('created_at', { ascending: false })

        setTemplates(tpls || [])
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [profile?.id])

  // ── Guardar formulario ────────────────────────────────────
  const handleSave = async (config) => {
    setSaveStatus(null)
    try {
      const { data: existing } = await supabase
        .from('intake_form_templates')
        .select('id')
        .eq('coach_id', profile.id)
        .eq('is_default', true)
        .maybeSingle()

      if (existing) {
        await supabase
          .from('intake_form_templates')
          .update({ config, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      } else {
        await supabase
          .from('intake_form_templates')
          .insert({
            coach_id: profile.id,
            name: 'Formulario principal',
            config,
            is_default: true,
          })
      }

      setFormConfig(config)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus(null), 3000)
    } catch {
      setSaveStatus('error')
    }
  }

  // ── Guardar como nueva plantilla ─────────────────────────
  const handleSaveTemplate = async ({ name, config }) => {
    const { data } = await supabase
      .from('intake_form_templates')
      .insert({ coach_id: profile.id, name, config, is_default: false })
      .select()
      .single()

    if (data) setTemplates(prev => [data, ...prev])
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
      {/* Toast de confirmación */}
      {saveStatus === 'saved' && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
          ✅ Formulario guardado
        </div>
      )}
      {saveStatus === 'error' && (
        <div className="fixed top-4 right-4 z-50 bg-red-600 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
          ❌ Error al guardar
        </div>
      )}

      <FormBuilder
        coachId={profile.id}
        initialConfig={formConfig}
        templates={templates}
        onSave={handleSave}
        onSendToStudent={() => {}} // TODO: modal de selección de alumno
      />
    </div>
  )
}
