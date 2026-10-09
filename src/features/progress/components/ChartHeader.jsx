import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'

// Encabezado de un gráfico de progreso con una "i" que despliega cómo leerlo.
// Pedido de Franco (2026-10-09): que la coach (y la persona) sepan qué mide
// cada métrica sin tener que preguntar. `info` admite párrafos separados por
// una línea en blanco.
export default function ChartHeader({
  title,
  subtitle,
  info,
  right,
  as: As = 'p',
  titleClassName = 'font-semibold text-sm text-gray-900',
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const paragraphs = info ? String(info).split(/\n\s*\n/) : []
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <As className={titleClassName}>{title}</As>
            {info && (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-label={t('progressChart.howToRead')}
                title={t('progressChart.howToRead')}
                aria-expanded={open}
                className={`p-1 rounded-md transition-colors ${
                  open ? 'text-primary-600 bg-durazno-50' : 'text-gray-400 hover:bg-gray-100'
                }`}
              >
                <Info size={14} />
              </button>
            )}
          </div>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
        {right}
      </div>
      {open && paragraphs.length > 0 && (
        <div className="bg-durazno-50 rounded-lg px-3 py-2 space-y-1.5">
          {paragraphs.map((p, i) => (
            <p key={i} className="text-xs text-tinta leading-relaxed">
              {p}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
