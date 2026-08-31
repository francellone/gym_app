// ============================================================
// Informe CLIENTE — carta de 1 página para el alumno
// ------------------------------------------------------------
// Ruta: /coach/students/:id/informe-cliente (solo coach, decisión 2026-07).
//
// Diseño base: docs/mockup-informe-alumno.html (el que aprobó Anto).
// Texto primero, SIN gráficos a la vista (feedback Anto 2026-08-31): cada
// bullet puede abrir un <details> cerrado con un mini-gráfico de respaldo.
// Números CRUDOS (decisión Franco 2026-08-31). "Sin cambios" apagado por
// defecto, con toggle para la coach.
//
// Mismo motor que el informe coach: fetchReportData + buildReport (fetch UNA
// vez, período en memoria) + buildClientContent (claves i18n + params).
// El contenido se renderiza en el idioma del ALUMNO (profiles.language) vía
// getFixedT; el chrome de la página queda en español como todo el panel del
// coach. El texto libre de la coach no se traduce (criterio plan-description).
//
// PREVIEW EDITABLE: todo el borrador llega generado y la coach lo corrige
// tocando el texto (contentEditable no controlado: React nunca pisa las
// ediciones porque el __html del borrador no cambia mientras no cambien
// período/idioma/toggle — cambiarlos REGENERA el borrador y descarta
// ediciones, avisado en el hint). Objetivos, mensaje y desafío los escribe
// ella (vacío = no sale en el export).
//
// ⚠️ Mini-gráficos con DIMENSIONES FIJAS (width/height): dentro de un
// <details> cerrado el contenido tiene ancho 0 y ResponsiveContainer no
// puede medir. El export serializa estos mismos SVG (una implementación).
// ============================================================
import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format, subDays } from 'date-fns'
import { es as esLocale, enUS } from 'date-fns/locale'
import { ArrowLeft, Download, Printer, X } from 'lucide-react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import i18n from '@/i18n'
import { buildReport, UNTAGGED_KEY } from '../reportEngine'
import { fetchReportData } from '../fetchReportData'
import { buildClientContent } from '../clientReportContent'
import { downloadReportHtml } from '../exportReportHtml'

const PERIODS = [
  { days: 28, label: '4 semanas' },
  { days: 56, label: '8 semanas' },
  { days: 84, label: '12 semanas' },
]

// Motor (snake_case) → claves i18n ya existentes del formulario de wellbeing.
const WELLBEING_I18N = {
  sleep_quality: 'sleepQuality',
  nutrition_quality: 'nutritionQuality',
  hydration_quality: 'hydrationQuality',
  energy_level: 'energyLevel',
  stress_level: 'stressLevel',
  muscle_fatigue: 'muscleFatigue',
}

const CHART = { width: 520, height: 170 }
const COLORS = { period: '#6366f1', prev: '#d1d5db', pse: '#8b5cf6' }

function escapeHtml(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
}

// contentEditable NO controlado: React solo escribe el __html inicial (por
// key); las ediciones de la coach viven en el DOM y el export las serializa.
function Editable({ as: Tag = 'div', html, placeholder, className = '' }) {
  return (
    <Tag
      contentEditable
      suppressContentEditableWarning
      data-ph={placeholder || undefined}
      className={`editable ${className}`}
      dangerouslySetInnerHTML={{ __html: html || '' }}
    />
  )
}

function SectionH2({ children }) {
  return (
    <h2 className="text-sm font-bold uppercase tracking-wide text-primary-600 mt-6 mb-3">
      {children}
    </h2>
  )
}

// <details> cerrado con el mini-gráfico: la info escrita manda.
function ChartDetails({ id, label, children }) {
  return (
    <details id={id} className="mt-1 client-chart">
      <summary className="text-xs text-primary-600 cursor-pointer select-none">{label}</summary>
      <div className="overflow-x-auto py-2">{children}</div>
    </details>
  )
}

export default function ClientReportPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile: coachProfile } = useAuth()

  const [student, setStudent] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [periodDays, setPeriodDays] = useState(56)
  const [useCustomRange, setUseCustomRange] = useState(false)
  const [customFrom, setCustomFrom] = useState(() => format(subDays(new Date(), 55), 'yyyy-MM-dd'))
  const [customTo, setCustomTo] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [includeStalled, setIncludeStalled] = useState(false)
  const [lang, setLang] = useState(null) // null = todavía sin perfil; default alumno

  // Bullets sacados por la coach, atados al borrador vigente (regenKey):
  // al regenerar, los descartes viejos dejan de aplicar sin efectos extra.
  const [removed, setRemoved] = useState({ key: '', ids: new Set() })

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [{ data: profile }, reportData] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, name, modality, language')
            .eq('id', id)
            .maybeSingle(),
          fetchReportData(supabase, id),
        ])
        if (!alive) return
        setStudent(profile)
        setLang(profile?.language === 'en' ? 'en' : 'es')
        setData(reportData)
      } catch (e) {
        if (alive) setError(e.message || 'No se pudieron cargar los datos')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [id])

  const { from, to } = useMemo(() => {
    if (useCustomRange) return { from: customFrom, to: customTo }
    return {
      from: format(subDays(new Date(), periodDays - 1), 'yyyy-MM-dd'),
      to: format(new Date(), 'yyyy-MM-dd'),
    }
  }, [periodDays, useCustomRange, customFrom, customTo])

  const report = useMemo(() => {
    if (!data) return null
    return buildReport({ from, to, ...data })
  }, [data, from, to])

  const effectiveLang = lang || 'es'
  // t con el idioma del ALUMNO (la UI global del coach no cambia).
  const t = useMemo(() => i18n.getFixedT(effectiveLang, null, 'report.client'), [effectiveLang])
  const tGlobal = useMemo(() => i18n.getFixedT(effectiveLang), [effectiveLang])

  const content = useMemo(() => {
    if (!report) return null
    return buildClientContent(report, { includeStalled })
  }, [report, includeStalled])

  // Cambiar período/idioma/toggle regenera el borrador: las ediciones y los
  // bullets borrados se descartan (avisado en el hint del preview).
  const regenKey = `${from}|${to}|${effectiveLang}|${includeStalled}`
  const removedIds = removed.key === regenKey ? removed.ids : new Set()

  const dateLocale = effectiveLang === 'en' ? enUS : esLocale
  const fmtLong = (d) =>
    format(
      new Date(`${d}T00:00:00`),
      effectiveLang === 'en' ? 'MMMM d, yyyy' : "d 'de' MMMM yyyy",
      { locale: dateLocale }
    )
  const fmtShort = (d) => format(new Date(`${d}T00:00:00`), 'dd/MM')

  if (loading) return <div className="p-6 text-sm text-gray-500">Cargando informe…</div>
  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={() => navigate(-1)} className="btn-secondary mt-3 text-sm">
          Volver
        </button>
      </div>
    )
  }
  if (!report || !content) return null

  const m = report.modules
  const noData = !m.attendance && !m.mainWork && !m.activation && !m.blocks

  const firstName = (student?.name || '').trim().split(/\s+/)[0] || ''
  const unitOf = (metric) => (metric === 'weight' ? t('unitWeight') : t('unitReps'))

  // Texto de cada bullet: clave + params (números crudos; nombres escapados
  // porque el borrador se inyecta como HTML editable).
  function pointHtml(p) {
    const params = { ...p.params }
    if (params.name) params.name = escapeHtml(params.name)
    if (params.metric) params.unit = unitOf(params.metric)
    if (p.id.startsWith('progress-')) params.pct = `${params.pct > 0 ? '+' : ''}${params.pct}`
    let key = p.key
    if ((key === 'blocksAerobic' || key === 'blocksCircuit') && !(params.minutes > 0))
      key = `${key}NoMin`
    return t(`points.${key}`, { ...params, interpolation: { escapeValue: false } })
  }

  const points = content.points.filter((p) => !removedIds.has(p.id))

  // Filas de los mini-gráficos (una sola fuente: el report ya calculado).
  const attendanceRows = report.attendance.weekly.map((w) => ({
    week: fmtShort(w.week),
    full: w.fullDays,
    partial: w.partialDays,
  }))
  const volumeRows = report.mainWork.byPattern.map((p) => ({
    name:
      p.pattern === UNTAGGED_KEY
        ? effectiveLang === 'en'
          ? 'Untagged'
          : 'Sin categoría'
        : p.pattern,
    now: p.series,
    prev: p.prevSeries ?? 0,
  }))
  const effortRows = report.effort.pseWeekly.map((w) => ({ week: fmtShort(w.week), pse: w.avg }))
  const exerciseRows = (exerciseId) => {
    const e = report.exercises.find((x) => x.exerciseId === exerciseId)
    if (!e) return { rows: [], metric: 'weight' }
    return {
      rows: e.points.map((pt) => ({ date: fmtShort(pt.date), value: pt.value })),
      metric: e.metric,
    }
  }

  function pointChart(p) {
    if (!p.chart) return null
    const chartId = `chart-${p.id}`
    if (p.chart.type === 'attendance' && attendanceRows.length > 1) {
      return (
        <ChartDetails id={chartId} label={t('seeDetail')}>
          <BarChart width={CHART.width} height={CHART.height} data={attendanceRows}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
            <Bar dataKey="full" stackId="d" fill={COLORS.period} />
            <Bar dataKey="partial" stackId="d" fill="#a5b4fc" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartDetails>
      )
    }
    if (p.chart.type === 'volume' && volumeRows.length > 0) {
      return (
        <ChartDetails id={chartId} label={t('seeDetail')}>
          <BarChart width={CHART.width} height={CHART.height} data={volumeRows} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
            <Bar dataKey="now" fill={COLORS.period} maxBarSize={12} radius={[0, 3, 3, 0]} />
            <Bar dataKey="prev" fill={COLORS.prev} maxBarSize={12} radius={[0, 3, 3, 0]} />
          </BarChart>
        </ChartDetails>
      )
    }
    if (p.chart.type === 'effort' && effortRows.length > 1) {
      return (
        <ChartDetails id={chartId} label={t('seeDetail')}>
          <LineChart width={CHART.width} height={CHART.height} data={effortRows}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} width={28} />
            <Line dataKey="pse" stroke={COLORS.pse} strokeWidth={2} dot={{ r: 3 }} connectNulls />
          </LineChart>
        </ChartDetails>
      )
    }
    if (p.chart.type === 'exercise') {
      const { rows } = exerciseRows(p.chart.exerciseId)
      if (rows.length < 2) return null
      return (
        <ChartDetails id={chartId} label={t('seeDetail')}>
          <LineChart width={CHART.width} height={CHART.height} data={rows}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={34} domain={['auto', 'auto']} />
            <Line
              dataKey="value"
              stroke={COLORS.period}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          </LineChart>
        </ChartDetails>
      )
    }
    return null
  }

  // Tooltips nativos del export: mismas filas que dibujan los charts.
  function buildSvgTitleSpecs() {
    const specs = []
    for (const p of points) {
      if (!p.chart) continue
      const sel = `#chart-${p.id}`
      if (p.chart.type === 'attendance')
        specs.push({
          selector: sel,
          bars: [
            attendanceRows.map((r) => `${r.week}: ${r.full}`),
            attendanceRows.map((r) => `${r.week}: ${r.partial}`),
          ],
        })
      if (p.chart.type === 'volume')
        specs.push({
          selector: sel,
          bars: [
            volumeRows.map((r) => `${r.name}: ${r.now}`),
            volumeRows.map((r) => `${r.name}: ${r.prev}`),
          ],
        })
      if (p.chart.type === 'effort')
        specs.push({
          selector: sel,
          dots: [effortRows.filter((r) => r.pse != null).map((r) => `${r.week}: ${r.pse}`)],
        })
      if (p.chart.type === 'exercise') {
        const { rows, metric } = exerciseRows(p.chart.exerciseId)
        specs.push({
          selector: sel,
          dots: [rows.map((r) => `${r.date}: ${r.value} ${unitOf(metric)}`)],
        })
      }
    }
    return specs
  }

  // Limpieza del clon antes de serializar: sin contenteditable, sin
  // placeholders, y las secciones que la coach dejó vacías no salen.
  function prepareClientExport(clone) {
    clone.querySelectorAll('[contenteditable]').forEach((el) => {
      el.removeAttribute('contenteditable')
      el.removeAttribute('data-ph')
    })
    clone.querySelectorAll('[data-optional]').forEach((el) => {
      if (!el.textContent.trim()) el.remove()
    })
    clone.querySelectorAll('[data-optional-section]').forEach((sec) => {
      if (!sec.querySelector('[data-optional]')) sec.remove()
    })
  }

  function handleDownload() {
    downloadReportHtml(
      document.getElementById('client-report-root'),
      { studentName: student?.name || 'alumno', from: report.period.from, to: report.period.to },
      {
        svgTitleSpecs: buildSvgTitleSpecs(),
        collapsible: false,
        toc: false,
        lang: effectiveLang,
        title: `${t('badge')} — ${student?.name || ''}`,
        filePrefix: 'informe-cliente',
        prepare: prepareClientExport,
      }
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      {/* Barra de acciones (chrome del coach, en español; no sale en export) */}
      <div className="flex items-center justify-between print:hidden">
        <button
          onClick={() => navigate(`/coach/students/${id}`)}
          className="btn-ghost flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft size={16} /> Volver
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <Printer size={16} /> Imprimir / PDF
          </button>
          <button
            onClick={handleDownload}
            className="btn-primary flex items-center gap-1.5 text-sm"
          >
            <Download size={16} /> Descargar
          </button>
        </div>
      </div>

      {/* Controles (no salen en export) */}
      <div className="flex items-center gap-2 flex-wrap print:hidden">
        {PERIODS.map((p) => (
          <button
            key={p.days}
            onClick={() => {
              setUseCustomRange(false)
              setPeriodDays(p.days)
            }}
            className={
              !useCustomRange && periodDays === p.days
                ? 'btn-primary text-sm'
                : 'btn-secondary text-sm'
            }
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setUseCustomRange(true)}
          className={useCustomRange ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
        >
          Personalizado
        </button>
        {useCustomRange && (
          <>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="input text-sm"
            />
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="input text-sm"
            />
          </>
        )}
      </div>
      <div className="flex items-center gap-4 flex-wrap print:hidden text-sm">
        <label className="flex items-center gap-1.5">
          Idioma:
          <select
            value={effectiveLang}
            onChange={(e) => setLang(e.target.value)}
            className="input text-sm py-1"
          >
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={includeStalled}
            onChange={(e) => setIncludeStalled(e.target.checked)}
          />
          Incluir «Sin cambios»
        </label>
      </div>
      <p className="text-xs text-gray-400 print:hidden">
        El texto es editable: tocá cualquier línea y corregila antes de descargar. Cambiar período,
        idioma u opciones regenera el borrador (y descarta lo editado).
      </p>

      {noData ? (
        <p className="text-sm text-gray-500 p-4">Sin datos en el período elegido.</p>
      ) : (
        <div
          id="client-report-root"
          className="bg-white rounded-xl shadow-sm p-6 sm:p-8"
          key={regenKey}
        >
          <style>{`
            .editable:empty::before { content: attr(data-ph); color: #9ca3af; }
            [contenteditable].editable:hover, [contenteditable].editable:focus {
              outline: 1px dashed #a5b4fc; outline-offset: 2px; border-radius: 2px;
            }
            details.client-chart summary::marker { color: #6366f1; }
            @media print { details.client-chart { display: none } }
          `}</style>

          <header className="text-center mb-5">
            <span className="inline-block bg-primary-600 text-white text-xs font-bold uppercase tracking-widest px-3.5 py-1 rounded-full">
              {t('badge')}
            </span>
            <Editable
              as="h1"
              html={escapeHtml(t('heroTitle', { name: firstName }))}
              className="text-3xl font-extrabold tracking-tight mt-3 text-gray-900"
            />
            <p className="text-sm text-gray-500 mt-1">
              {fmtLong(report.period.from)} – {fmtLong(report.period.to)}
              {coachProfile?.name ? ` · Coach: ${coachProfile.name}` : ''}
            </p>
          </header>

          <div className="bg-primary-50 border border-primary-100 rounded-xl px-5 py-4 text-center mb-4">
            <Editable
              html={escapeHtml(t('heroText'))}
              className="text-base font-medium text-gray-800"
            />
          </div>

          {/* Lo mejor del período */}
          <section>
            <SectionH2>{t('sectionBest')}</SectionH2>
            <ul className="space-y-0">
              {points.map((p) => (
                <li
                  key={`${regenKey}-${p.id}`}
                  className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-b-0"
                >
                  <span className="text-xl leading-6">{p.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <Editable html={pointHtml(p)} className="text-[15px] text-gray-800" />
                    {pointChart(p)}
                  </div>
                  <button
                    onClick={() =>
                      setRemoved({ key: regenKey, ids: new Set([...removedIds, p.id]) })
                    }
                    className="print:hidden text-gray-300 hover:text-red-500 mt-1"
                    title="Sacar este punto"
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* Bienestar (pedido de Anto) */}
          {content.wellbeing.length > 0 && (
            <section>
              <SectionH2>{t('sectionWellbeing')}</SectionH2>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
                {content.wellbeing.map((w) => (
                  <div key={w.key} className="flex items-baseline justify-between text-sm">
                    <span className="text-gray-600">
                      {tGlobal(`wellbeing.${WELLBEING_I18N[w.key] || w.key}`)}
                    </span>
                    <span>
                      <b className="text-gray-800">{w.avg}</b>
                      {w.prevAvg != null && (
                        <span className="text-xs text-gray-400">
                          {' '}
                          ({t('wellbeingBefore', { value: w.prevAvg })})
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                {t('wellbeingAvgNote', { n: content.wellbeingN })}
              </p>
            </section>
          )}

          {/* Próximos objetivos — los escribe la coach; vacío = no sale */}
          <section data-optional-section>
            <SectionH2>{t('sectionGoals')}</SectionH2>
            <div className="flex gap-3 flex-wrap">
              {[0, 1, 2].map((i) => (
                <div
                  key={`${regenKey}-goal-${i}`}
                  data-optional
                  className="flex-1 min-w-[140px] border border-gray-200 rounded-xl p-3 text-center text-sm"
                >
                  <span className="block text-2xl mb-1">🎯</span>
                  <Editable html="" placeholder="Escribí un objetivo…" className="text-gray-800" />
                </div>
              ))}
            </div>
          </section>

          {/* Mensaje de la coach — su voz, no se traduce */}
          <section data-optional-section>
            <SectionH2>{t('sectionCoach')}</SectionH2>
            <div data-optional>
              <Editable
                html=""
                placeholder="Escribí acá tu mensaje para cerrar el período…"
                className="text-[15px] text-gray-800 min-h-[3rem]"
              />
              {coachProfile?.name && (
                <p className="font-bold mt-2 text-gray-900">— {coachProfile.name}</p>
              )}
            </div>
          </section>

          {/* Próximo desafío */}
          <section data-optional-section>
            <div className="mt-6 border-2 border-dashed border-primary-400 rounded-xl px-5 py-4 text-center">
              <div className="text-xs uppercase tracking-widest text-primary-600 font-bold">
                {t('challengeLabel')}
              </div>
              <div data-optional>
                <Editable
                  html=""
                  placeholder="Ej.: 🏋️ Sentadilla: 105 kg"
                  className="text-2xl font-extrabold mt-1 text-gray-900"
                />
              </div>
            </div>
          </section>

          <footer className="mt-7 text-center text-xs text-gray-400">
            {coachProfile?.name ? t('preparedBy', { name: coachProfile.name }) : ''}
          </footer>
        </div>
      )}
    </div>
  )
}
