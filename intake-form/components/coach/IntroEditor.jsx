/**
 * EDITOR DE INTRODUCCIÓN
 *
 * Editor de texto libre con soporte para:
 *   - Texto plano con saltos de línea
 *   - Emojis (teclado del sistema)
 *   - Preview en tiempo real
 *
 * Nota: para Rich Text completo (negrita, links, etc.) se puede
 * integrar una librería como Tiptap o Quill en el futuro.
 * Por ahora se usa un textarea con preview.
 */

import { useState } from 'react'

export default function IntroEditor({ value, onChange }) {
  const [showPreview, setShowPreview] = useState(false)

  const content = typeof value === 'string' ? value : value?.content || ''

  const handleChange = (e) => {
    const newContent = e.target.value
    onChange(typeof value === 'string'
      ? newContent
      : { ...value, content: newContent }
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-xs text-gray-500 border-b pb-2">
        <button
          onClick={() => setShowPreview(false)}
          className={`px-2 py-1 rounded transition-colors ${!showPreview ? 'bg-gray-100 text-gray-800 font-medium' : 'hover:bg-gray-50'}`}
        >
          ✏️ Editar
        </button>
        <button
          onClick={() => setShowPreview(true)}
          className={`px-2 py-1 rounded transition-colors ${showPreview ? 'bg-gray-100 text-gray-800 font-medium' : 'hover:bg-gray-50'}`}
        >
          👁 Preview
        </button>
      </div>

      {!showPreview ? (
        <>
          <textarea
            value={content}
            onChange={handleChange}
            rows={6}
            placeholder="Escribí la introducción que verán tus estudiantes...
Podés usar emojis 💪 y saltos de línea."
            className="w-full text-sm border border-gray-300 rounded-lg p-3 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-400">
            💡 Tip: Usá emojis para darle tu tono personal. Contá tu metodología, qué vas a hacer con la info, y cualquier instrucción especial.
          </p>
        </>
      ) : (
        <div className="min-h-[120px] p-4 bg-gray-50 rounded-lg border border-gray-200 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
          {content || <span className="text-gray-400 italic">Sin contenido aún...</span>}
        </div>
      )}
    </div>
  )
}
