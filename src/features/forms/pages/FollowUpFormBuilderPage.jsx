/**
 * PÁGINA COACH – EDITOR DE PLANTILLA DE SEGUIMIENTO
 * Rutas: /coach/follow-up-forms/new
 *        /coach/follow-up-forms/:id
 *
 * Reusa FormBuilder con formKind='follow_up'.
 * Antes de guardar pide nombre (la primera vez).
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import FormBuilder from '@/features/forms/intake/components/coach/FormBuilder'
import { buildFollowUpFormConfig } from '@/features/forms/intake/schema/default-form.js'
import { useCoachFormLanguages } from '@/features/forms/hooks/useCoachFormLanguages'
import { ArrowLeft } from 'lucide-react'

export default function FollowUpFormBuilderPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { t } = useTranslation()
  const isNew = id === 'new' || !id

  const { bilingual } = useCoachFormLanguages()
  const [name, setName] = useState('')
  const [nameEn, setNameEn] = useState('') // nombre en inglés (modo bilingüe)
  const [description, setDescription] = useState('')
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState(null) // 'saved' | 'error' | 'limit'
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
    setOtherTemplates(tpls?.filter((tpl) => tpl.id !== id) || [])

    if (isNew) {
      setConfig(buildFollowUpFormConfig())
      setName('')
      setNameEn('')
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
    setNameEn(data.config?.name_i18n?.en || '')
    setDescription(data.description || '')
    setConfig(data.config || buildFollowUpFormConfig())
    setLoading(false)
  }

  async function handleSave(newConfig) {
    setSaveStatus(null)

    // Si todavía no hay nombre, pedirlo
    let finalName = name
    if (!finalName?.trim()) {
      const promptName = window.prompt(
        t('coach.forms.followUpBuilder.promptName'),
        t('coach.forms.followUpBuilder.promptDefault')
      )
      if (!promptName?.trim()) return
      finalName = promptName.trim()
      setName(finalName)
    }

    // Nombre en inglés → config.name_i18n (el alumno lo ve en su listado)
    const configToSave = nameEn.trim()
      ? { ...newConfig, name_i18n: { ...newConfig.name_i18n, en: nameEn.trim() } }
      : { ...newConfig, name_i18n: undefined }

    try {
      if (isNew) {
        const { data, error } = await supabase
          .from('intake_form_templates')
          .insert({
            coach_id: profile.id,
            name: finalName,
            description: description || null,
            config: configToSave,
            form_kind: 'follow_up',
            is_active: true,
            is_default: false,
          })
          .select()
          .single()

        if (error) {
          // El trigger DB lanza si hay >10 (se compara contra su mensaje, en español)
          setSaveStatus(error.message?.includes('Límite alcanzado') ? 'limit' : 'error')
          return
        }

        setConfig(configToSave)
        setSaveStatus('saved')
        // Redirigir al editor con id real (para que próximas guardadas updateen)
        navigate(`/coach/follow-up-forms/${data.id}`, { replace: true })
      } else {
        const { error } = await supabase
          .from('intake_form_templates')
          .update({
            name: finalName,
            description: description || null,
            config: configToSave,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)

        if (error) {
          setSaveStatus('error')
          return
        }

        setConfig(configToSave)
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
          {t('coach.forms.followUpBuilder.saved')}
        </div>
      )}
      {saveStatus === 'error' && (
        <div className="fixed top-4 right-4 z-50 bg-red-600 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg">
          {t('coach.forms.followUpBuilder.saveError')}
        </div>
      )}
      {saveStatus === 'limit' && (
        <div className="fixed top-4 right-4 z-50 bg-amber-600 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg max-w-xs">
          {t('coach.forms.followUpBuilder.limitReached')}
        </div>
      )}

      {/* Cabecera con nombre + descripción + back */}
      <div className="max-w-3xl mx-auto pt-6 px-4 space-y-3">
        <button
          onClick={() => navigate('/coach/follow-up-forms')}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={14} /> {t('coach.forms.followUpBuilder.back')}
        </button>

        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {t('coach.forms.followUpBuilder.nameLabel')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('coach.forms.followUpBuilder.namePlaceholder')}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {bilingual && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t('coach.forms.followUpBuilder.nameEnLabel')}
              </label>
              <input
                type="text"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="E.g.: Mid-plan check-in"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {t('coach.forms.followUpBuilder.descriptionLabel')}
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('coach.forms.followUpBuilder.descriptionPlaceholder')}
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
