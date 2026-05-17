/**
 * NoteComposer
 *
 * Composer para escribir notas desde el panel.
 *
 * Fase A: DESHABILITADO. Solo renderiza un placeholder informativo
 *         ("Próximamente: escribir nota"). La creación se hará en Fase B.
 *
 * Props (reservadas para Fase B):
 *   threadId
 *   authorId
 *   authorRole
 *   viewerRole
 *   onCreated (note) => void
 */

import { MessageSquare } from 'lucide-react'

export default function NoteComposer(/* props reservadas */) {
  return (
    <div className="card border-dashed border-gray-300 bg-gray-50 text-center py-4">
      <div className="flex items-center justify-center gap-2 text-gray-400">
        <MessageSquare size={14} />
        <span className="text-xs font-medium">Próximamente: escribir nota</span>
      </div>
      <p className="text-[11px] text-gray-400 mt-1">
        Por ahora el panel es solo de lectura.
      </p>
    </div>
  )
}
