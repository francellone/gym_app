/**
 * TARJETA DE MODO BILINGÜE — VISTA COACH
 *
 * Se monta en las páginas del builder (intake y follow-up). Tres estados:
 *   1. Automático activo (tiene alumnos en >1 idioma): banner informativo.
 *   2. Override manual activo: banner + opción de volver a automático.
 *   3. Monolingüe: una sola línea discreta para activar el modo manualmente.
 *
 * El texto está en español a propósito — el panel del coach no se traduce
 * (ver src/i18n/index.js).
 */

import { Globe } from 'lucide-react'
import { useCoachFormLanguages } from '@/features/forms/hooks/useCoachFormLanguages'

export default function LanguageModeCard() {
  const { bilingual, autoBilingual, override, loading, setOverride } = useCoachFormLanguages()

  if (loading) return null

  // ── Modo bilingüe activo ─────────────────────────────────
  if (bilingual) {
    return (
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
        <Globe size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 text-sm">
          <p className="font-medium text-blue-900">
            {autoBilingual
              ? 'Tenés alumnos en español e inglés'
              : 'Modo bilingüe activado manualmente'}
          </p>
          <p className="text-blue-700 mt-0.5">
            Al editar cada pregunta de tus formularios y cada ejercicio de tu biblioteca vas a poder
            cargar su versión en inglés (opcional: lo que no traduzcas se muestra en español). Tus
            alumnos ven el contenido en su idioma y vos ves todo en español.
          </p>
          {override && !autoBilingual && (
            <button
              onClick={() => setOverride(false)}
              className="text-xs text-blue-600 underline mt-2 hover:text-blue-800"
            >
              Volver a modo automático
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Monolingüe: línea discreta para adelantarse ──────────
  return (
    <button
      onClick={() => setOverride(true)}
      className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      title="Habilita los campos de traducción (formularios y ejercicios) aunque todavía no tengas alumnos en inglés"
    >
      <Globe size={14} />
      <span>Preparar mi contenido en inglés</span>
    </button>
  )
}
