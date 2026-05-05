/**
 * PÁGINA COACH – LISTADO DE FORMULARIOS DE SEGUIMIENTO
 * Ruta: /coach/follow-up-forms
 *
 * Muestra todas las plantillas follow_up del coach, con botón
 * para crear una nueva (deshabilitado si ya hay 10 activas).
 * Permite editar, archivar o enviar cada una.
 */

import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { Plus, Send, Edit2, Archive, FileText } from 'lucide-react'
import SendToStudentModal from '../../components/SendToStudentModal'

const TEMPLATE_LIMIT = 10

export default function FollowUpFormsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [sendingTemplate, setSendingTemplate] = useState(null)

  useEffect(() => {
    if (!profile?.id) return
    load()
  }, [profile?.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('intake_form_templates')
      .select('id, name, description, config, is_active, created_at, updated_at')
      .eq('coach_id', profile.id)
      .eq('form_kind', 'follow_up')
      .order('updated_at', { ascending: false })
    setTemplates(data || [])
    setLoading(false)
  }

  const activeTemplates = templates.filter(t => t.is_active)
  const archivedTemplates = templates.filter(t => !t.is_active)
  const canCreate = activeTemplates.length < TEMPLATE_LIMIT

  async function handleArchive(id) {
    if (!confirm('¿Archivar esta plantilla? No se borrará, pero dejará de aparecer en envíos nuevos.')) return
    await supabase
      .from('intake_form_templates')
      .update({ is_active: false })
      .eq('id', id)
    load()
  }

  async function handleUnarchive(id) {
    if (!canCreate) {
      alert(`Ya tenés ${TEMPLATE_LIMIT} plantillas activas. Archivá una para reactivar esta.`)
      return
    }
    await supabase
      .from('intake_form_templates')
      .update({ is_active: true })
      .eq('id', id)
    load()
  }

  function questionCount(config) {
    if (!config?.modules) return 0
    return config.modules.reduce((sum, m) => sum + (m.questions?.length || 0), 0)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Formularios de seguimiento</h1>
          <p className="text-sm text-gray-500 mt-1">
            Plantillas libres para mandar durante o al cierre de un plan. {activeTemplates.length}/{TEMPLATE_LIMIT} activas.
          </p>
        </div>
        <button
          onClick={() => navigate('/coach/follow-up-forms/new')}
          disabled={!canCreate}
          title={canCreate ? 'Crear nueva plantilla' : `Llegaste al límite de ${TEMPLATE_LIMIT}. Archivá alguna primero.`}
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus size={16} /> Nueva
        </button>
      </div>

      {/* Plantillas activas */}
      {activeTemplates.length === 0 ? (
        <div className="border border-dashed border-gray-200 rounded-xl p-8 text-center text-gray-400">
          <FileText size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm">Todavía no tenés formularios de seguimiento.</p>
          <button
            onClick={() => navigate('/coach/follow-up-forms/new')}
            className="mt-3 text-sm text-blue-600 hover:underline"
          >
            Crear el primero →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {activeTemplates.map(tpl => (
            <div key={tpl.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-gray-900 truncate">{tpl.name}</h3>
                  {tpl.description && (
                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{tpl.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    {questionCount(tpl.config)} pregunta{questionCount(tpl.config) !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => setSendingTemplate(tpl)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <Send size={12} /> Enviar
                  </button>
                  <Link
                    to={`/coach/follow-up-forms/${tpl.id}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
                  >
                    <Edit2 size={12} /> Editar
                  </Link>
                  <button
                    onClick={() => handleArchive(tpl.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <Archive size={12} /> Archivar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Archivados (collapsable simple) */}
      {archivedTemplates.length > 0 && (
        <details className="bg-gray-50 rounded-xl border border-gray-100 px-4 py-3">
          <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
            Archivadas ({archivedTemplates.length})
          </summary>
          <div className="mt-3 space-y-2">
            {archivedTemplates.map(tpl => (
              <div key={tpl.id} className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-gray-100">
                <span className="text-sm text-gray-600 truncate">{tpl.name}</span>
                <button
                  onClick={() => handleUnarchive(tpl.id)}
                  className="text-xs text-blue-600 hover:underline flex-shrink-0 ml-2"
                >
                  Reactivar
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Modal envío */}
      {sendingTemplate && (
        <SendToStudentModal
          coachId={profile.id}
          formConfig={sendingTemplate.config}
          templateId={sendingTemplate.id}
          formKind="follow_up"
          templateName={sendingTemplate.name}
          onClose={() => setSendingTemplate(null)}
          onSent={() => setSendingTemplate(null)}
        />
      )}
    </div>
  )
}
