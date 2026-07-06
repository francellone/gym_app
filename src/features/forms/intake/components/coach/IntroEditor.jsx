/**
 * EDITOR DE INTRODUCCIÓN
 *
 * Textarea simple para el texto de bienvenida del formulario.
 * En modo bilingüe (docs/plan-formularios-bilingues.md) muestra un segundo
 * textarea para la versión en inglés (opcional; vacío = se muestra la
 * española). El preview completo está disponible en la pestaña "Vista previa"
 * del FormBuilder (nivel superior).
 */

export default function IntroEditor({ value, onChange, bilingual = false }) {
  const content = typeof value === 'string' ? value : value?.content || ''
  const enContent = typeof value === 'object' ? value?.i18n?.en?.content || '' : ''

  const handleChange = (e) => {
    const newContent = e.target.value
    onChange(typeof value === 'string' ? newContent : { ...value, content: newContent })
  }

  const handleEnChange = (e) => {
    // Si la intro era string plano (snapshots viejos), la convertimos a objeto.
    const base = typeof value === 'string' ? { type: 'intro', content: value } : value || {}
    onChange({
      ...base,
      i18n: { ...base.i18n, en: { ...base.i18n?.en, content: e.target.value } },
    })
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
        💡 Tip: Usá emojis para darle tu tono personal. Contá tu metodología, qué vas a hacer con la
        info, y cualquier instrucción especial.
      </p>

      {bilingual && (
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">
            🌐 Introducción en inglés (opcional — vacío = se muestra la de arriba)
          </label>
          <textarea
            value={enContent}
            onChange={handleEnChange}
            rows={6}
            placeholder="Welcome! 👋 ..."
            className="w-full text-sm border border-gray-300 rounded-lg p-3 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      )}
    </div>
  )
}
