/**
 * EDITOR DE INTRODUCCIÓN
 *
 * Textarea simple para el texto de bienvenida del formulario.
 * El preview completo está disponible en la pestaña "Vista previa"
 * del FormBuilder (nivel superior).
 */

export default function IntroEditor({ value, onChange }) {
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
    </div>
  )
}
