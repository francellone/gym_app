// ============================================================
// Informe de progreso — vista del coach
// ------------------------------------------------------------
// Ruta: /coach/students/:id/informe
//
// Consume fetchReportData UNA vez (historia completa del alumno) y recalcula
// buildReport en memoria al cambiar el período: cambiar de 4 a 12 semanas no
// refetchea nada.
//
// Esta pantalla es la fuente del export HTML descargable (etapa siguiente):
// el export serializa el SVG que Recharts deja acá renderizado — por eso los
// gráficos viven en esta página y en ningún otro lado (UNA implementación).
// Todo lo que no debe salir en el export/impresión lleva `print:hidden`.
//
// Colores (identidad durazno): naranja #ea580c para el período, gris cálido #e3d8cf para
// el período anterior — "anterior" es SIEMPRE gris en todos los gráficos —,
// marrón #76675d PSE, naranja #ea580c Borg). Un eje por gráfico.
// ============================================================
import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format, subDays } from 'date-fns'
import { useTranslation, Trans } from 'react-i18next'
import { dateLocale } from '@/i18n/dateLocale'
import {
  ArrowLeft,
  Download,
  Printer,
  Trophy,
  TrendingUp,
  PauseCircle,
  Flame,
  CalendarCheck,
  ClipboardCheck,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  ComposedChart,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { buildReport, UNTAGGED_KEY } from '../reportEngine'
import { fetchReportData } from '../fetchReportData'
import { downloadReportHtml } from '../exportReportHtml'

const PERIODS = [
  { weeks: 4, days: 28 },
  { weeks: 8, days: 56 },
  { weeks: 12, days: 84 },
]

const fmtShort = (d) => format(new Date(`${d}T00:00:00`), 'dd/MM')

// Resumen de omisiones en el idioma del panel ("3 omitidos: 2 por tiempo y 1
// por molestia"). Misma lógica que describeSkips de completionRules, que
// devuelve español fijo.
function describeSkipsT(summary, t) {
  const n = summary?.skipped || 0
  if (n === 0) return ''
  const by = summary.byReason || {}
  const parts = []
  if (by.unclear) parts.push(t('coach.reports.coach.entries.byUnclear', { count: by.unclear }))
  if (by.time) parts.push(t('coach.reports.coach.entries.byTime', { count: by.time }))
  if (by.discomfort)
    parts.push(t('coach.reports.coach.entries.byDiscomfort', { count: by.discomfort }))
  if (by.other) parts.push(t('coach.reports.coach.entries.byOther', { count: by.other }))
  if (by.choice) parts.push(t('coach.reports.coach.entries.byChoice', { count: by.choice }))
  if (by.unknown) parts.push(t('coach.reports.coach.entries.byUnknown', { count: by.unknown }))
  const joined =
    parts.length <= 1
      ? parts.join('')
      : parts.slice(0, -1).join(t('coach.reports.coach.entries.listSeparator')) +
        t('coach.reports.coach.entries.lastSeparator') +
        parts.at(-1)
  const head = t('coach.reports.coach.entries.skipped', { count: n })
  return joined ? `${head}: ${joined}` : head
}

// Delta período vs anterior, como texto neutro (sin juicio de valor: subir
// estrés no es "mejor" — el juicio lo pone la coach en el preview).
function Delta({ now, prev, unit = '' }) {
  const { t } = useTranslation()
  if (prev == null || now == null) return null
  const diff = Math.round((now - prev) * 10) / 10
  if (diff === 0)
    return <span className="text-xs text-gray-400">{t('coach.reports.coach.delta.same')}</span>
  return (
    <span className={`text-xs ${diff > 0 ? 'text-emerald-600' : 'text-gray-500'}`}>
      {t('coach.reports.coach.delta.vsPrevious', {
        arrow: diff > 0 ? '↑' : '↓',
        value: Math.abs(diff),
        unit,
      })}
    </span>
  )
}

function StatCard({ label, value, sub, children }) {
  return (
    <div className="card text-center">
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      {children}
    </div>
  )
}

function SectionTitle({ icon: Icon, children }) {
  return (
    <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 mb-3">
      {Icon && <Icon size={18} className="text-primary-600" />}
      {children}
    </h2>
  )
}

export default function CoachReportPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile: coachProfile } = useAuth()
  const { t, i18n } = useTranslation()
  const fmtDay = (d) =>
    format(new Date(`${d}T00:00:00`), t('dates.dayMonthLong'), { locale: dateLocale() })
  const unitOf = (metric) =>
    t(`coach.reports.coach.units.${metric === 'weight' ? 'weight' : 'reps'}`)

  const [student, setStudent] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [periodDays, setPeriodDays] = useState(28)
  const [useCustomRange, setUseCustomRange] = useState(false)
  const [customFrom, setCustomFrom] = useState(() => format(subDays(new Date(), 27), 'yyyy-MM-dd'))
  const [customTo, setCustomTo] = useState(() => format(new Date(), 'yyyy-MM-dd'))

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [{ data: profile }, reportData] = await Promise.all([
          supabase.from('profiles').select('id, name, modality').eq('id', id).maybeSingle(),
          fetchReportData(supabase, id),
        ])
        if (!alive) return
        setStudent(profile)
        setData(reportData)
      } catch (e) {
        if (alive) setError({ message: e.message }) // sin mensaje → texto genérico al render
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

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">{t('coach.reports.common.loading')}</div>
  }
  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-600">
          {error.message || t('coach.reports.common.loadError')}
        </p>
        <button onClick={() => navigate(-1)} className="btn-secondary mt-3 text-sm">
          {t('coach.reports.common.back')}
        </button>
      </div>
    )
  }
  if (!report) return null

  const m = report.modules
  const noData = !m.attendance && !m.mainWork && !m.activation && !m.blocks

  // dataKeys estables; el texto visible va en `name` de cada serie.
  const patternRows = report.mainWork.byPattern.map((p) => ({
    name: p.pattern === UNTAGGED_KEY ? t('coach.reports.coach.patterns.untagged') : p.pattern,
    now: p.series,
    prev: p.prevSeries ?? 0,
  }))

  const effortRows = (() => {
    const byWeek = new Map()
    for (const w of report.effort.pseWeekly)
      byWeek.set(w.week, { week: fmtShort(w.week), pse: w.avg })
    for (const w of report.effort.borgWeekly) {
      if (!byWeek.has(w.week)) byWeek.set(w.week, { week: fmtShort(w.week) })
      byWeek.get(w.week).borg = w.avg
    }
    return [...byWeek.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, v]) => v)
  })()

  const attendanceRows = report.attendance.weekly.map((w) => ({
    week: fmtShort(w.week),
    full: w.fullDays,
    partial: w.partialDays,
    expected: w.expected,
  }))
  const hasExpected = report.attendance.compliancePct != null
  const hasPartialDays = report.attendance.partialDays > 0

  // Tooltips nativos del archivo exportado: mismas filas que dibujan los
  // charts, en el mismo orden (posicional). Las líneas con connectNulls
  // saltean los null, por eso se filtra igual acá.
  const svgTitleSpecs = [
    {
      selector: '#sec-constancia',
      bars: [
        attendanceRows.map((r) =>
          t('coach.reports.coach.attendance.tipFull', { week: r.week, count: r.full })
        ),
        attendanceRows.map((r) =>
          t('coach.reports.coach.attendance.tipPartial', { week: r.week, count: r.partial })
        ),
      ],
    },
    {
      selector: '#sec-patrones',
      bars: [
        patternRows.map((r) =>
          t('coach.reports.coach.patterns.tipNow', { name: r.name, count: r.now })
        ),
        patternRows.map((r) =>
          t('coach.reports.coach.patterns.tipPrev', { name: r.name, count: r.prev })
        ),
      ],
    },
    {
      selector: '#sec-esfuerzo',
      dots: [
        effortRows
          .filter((r) => r.pse != null)
          .map((r) => t('coach.reports.coach.effort.tipPse', { week: r.week, value: r.pse })),
        effortRows
          .filter((r) => r.borg != null)
          .map((r) => t('coach.reports.coach.effort.tipBorg', { week: r.week, value: r.borg })),
      ],
    },
  ]

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6" id="report-root">
      {/* Barra de acciones — no sale en la impresión/export */}
      <div className="flex items-center justify-between print:hidden">
        <button
          onClick={() => navigate(`/coach/students/${id}?tab=progress`)}
          className="btn-ghost flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft size={16} /> {t('coach.reports.common.back')}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/coach/students/${id}/informe-cliente`)}
            className="btn-ghost text-sm"
            title={t('coach.reports.coach.clientVersionTitle')}
          >
            {t('coach.reports.coach.clientVersion')}
          </button>
          <button
            onClick={() => window.print()}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <Printer size={16} /> {t('coach.reports.common.print')}
          </button>
          <button
            onClick={() =>
              downloadReportHtml(
                document.getElementById('report-root'),
                {
                  studentName: student?.name || 'alumno', // solo arma el nombre del archivo
                  from: report.period.from,
                  to: report.period.to,
                },
                {
                  svgTitleSpecs,
                  lang: i18n.language === 'en' ? 'en' : 'es',
                  title: t('coach.reports.export.coachTitle', { name: student?.name || '' }),
                  labels: {
                    print: t('coach.reports.export.print'),
                    sort: t('coach.reports.export.sort'),
                    toc: t('coach.reports.export.toc'),
                  },
                }
              )
            }
            className="btn-primary flex items-center gap-1.5 text-sm"
          >
            <Download size={16} /> {t('coach.reports.common.download')}
          </button>
        </div>
      </div>

      {/* Selector de período — tampoco sale */}
      <div className="flex items-center gap-2 flex-wrap print:hidden">
        {PERIODS.map((p) => (
          <button
            key={p.days}
            onClick={() => {
              setUseCustomRange(false)
              setPeriodDays(p.days)
            }}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              !useCustomRange && periodDays === p.days
                ? 'bg-white text-gray-900 shadow-sm font-medium'
                : 'text-gray-500'
            }`}
          >
            {t('coach.reports.common.weeks', { count: p.weeks })}
          </button>
        ))}
        <button
          onClick={() => setUseCustomRange(true)}
          className={`px-3 py-1.5 rounded-lg text-sm ${
            useCustomRange ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500'
          }`}
        >
          {t('coach.reports.common.custom')}
        </button>
        {useCustomRange && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="input text-sm"
            />
            <span className="text-gray-400 text-sm">→</span>
            <input
              type="date"
              value={customTo}
              min={customFrom}
              onChange={(e) => setCustomTo(e.target.value)}
              className="input text-sm"
            />
          </div>
        )}
      </div>

      {/* Encabezado del informe */}
      <header>
        <h1 className="text-xl font-bold text-gray-900">{t('coach.reports.coach.title')}</h1>
        <p className="text-sm text-gray-600">
          {student?.name || t('coach.reports.common.personFallback')} · {fmtDay(report.period.from)}{' '}
          — {fmtDay(report.period.to)}
          {student?.modality &&
            student.modality !== 'online' &&
            ` · ${t(`coach.reports.coach.modality.${student.modality}`, { defaultValue: student.modality })}`}
        </p>
        {coachProfile?.name && (
          <p className="text-xs text-gray-400 mt-0.5">
            {t('coach.reports.coach.preparedBy', { name: coachProfile.name })}
          </p>
        )}
      </header>

      {noData && (
        <div className="card text-sm text-gray-500">{t('coach.reports.coach.noData')}</div>
      )}

      {/* Resumen */}
      {m.attendance && (
        <section>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label={t('coach.reports.coach.stats.daysTrained')}
              value={report.attendance.daysTrained}
              sub={
                hasPartialDays
                  ? t('coach.reports.coach.stats.fullAndPartial', {
                      full: report.attendance.fullDays,
                      partial: report.attendance.partialDays,
                    })
                  : t('coach.reports.coach.stats.perWeek', {
                      value: report.attendance.sessionsPerWeek,
                    })
              }
            >
              <Delta now={report.attendance.daysTrained} prev={report.attendance.prevDaysTrained} />
              {report.attendance.bestStreak > 1 && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {t('coach.reports.coach.stats.bestStreak', {
                    count: report.attendance.bestStreak,
                  })}
                </p>
              )}
            </StatCard>
            {hasExpected ? (
              <StatCard
                label={t('coach.reports.coach.stats.compliance')}
                value={`${report.attendance.compliancePct}%`}
                sub={t('coach.reports.coach.stats.complianceSub', {
                  done: report.attendance.daysTrained,
                  expected: report.attendance.expectedDays,
                })}
              >
                <Delta
                  now={report.attendance.compliancePct}
                  prev={report.attendance.prevCompliancePct}
                  unit="%"
                />
              </StatCard>
            ) : (
              <StatCard
                label={t('coach.reports.coach.stats.daysPerWeek')}
                value={report.attendance.sessionsPerWeek}
              />
            )}
            {m.activation && (
              <StatCard
                label={t('coach.reports.coach.stats.activation')}
                value={`${report.activation.pctOfTrainedDays}%`}
                sub={t('coach.reports.coach.stats.activationSub')}
              />
            )}
            {m.mainWork && (
              <StatCard
                label={t('coach.reports.coach.stats.workSeries')}
                value={report.mainWork.seriesTotal}
              >
                <Delta now={report.mainWork.seriesTotal} prev={report.mainWork.prevSeriesTotal} />
              </StatCard>
            )}
          </div>
        </section>
      )}

      {/* Asistencia por semana */}
      {m.attendance && attendanceRows.length > 1 && (
        <section className="card" id="sec-constancia">
          <SectionTitle icon={CalendarCheck}>
            {t('coach.reports.coach.attendance.title')}
          </SectionTitle>
          <ResponsiveContainer width="100%" height={170}>
            <ComposedChart data={attendanceRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f0eb" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={24}
              />
              <Tooltip />
              {(hasExpected || hasPartialDays) && <Legend wrapperStyle={{ fontSize: 12 }} />}
              <Bar
                dataKey="full"
                name={t('coach.reports.coach.attendance.full')}
                stackId="dias"
                fill="#ea580c"
                maxBarSize={36}
              />
              <Bar
                dataKey="partial"
                name={t('coach.reports.coach.attendance.partial')}
                stackId="dias"
                fill="#fdba74"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
              />
              {hasExpected && (
                <Line
                  type="stepAfter"
                  dataKey="expected"
                  name={t('coach.reports.coach.attendance.expected')}
                  stroke="#a3958b"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          {hasExpected && (
            <p className="text-xs text-gray-400 mt-1">
              {t('coach.reports.coach.attendance.expectedNote')}
            </p>
          )}
        </section>
      )}

      {/* Cómo registró (v54): omisiones por motivo y tal cual / con ajustes.
          Solo en el informe de la coach, nunca en el de clientes. */}
      {m.entries && (
        <section className="card" id="sec-registro">
          <SectionTitle icon={ClipboardCheck}>
            {t('coach.reports.coach.entries.title')}
          </SectionTitle>
          <div className="space-y-3 text-sm text-gray-700">
            {report.entries.withMode > 0 && (
              <div>
                <p>
                  <Trans
                    i18nKey="coach.reports.coach.entries.split"
                    values={{
                      confirmed: report.entries.confirmedPct,
                      edited: 100 - report.entries.confirmedPct,
                    }}
                    components={{ b: <b className="tabular-nums" /> }}
                  />
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t('coach.reports.coach.entries.splitNote', { count: report.entries.withMode })}
                </p>
              </div>
            )}
            {report.entries.skipped > 0 ? (
              <div>
                <p>
                  <span className="pill-warn">{describeSkipsT(report.entries, t)}</span>
                </p>
                <ul className="mt-2 space-y-1">
                  {report.entries.skippedItems.slice(0, 10).map((it, i) => (
                    <li key={i} className="flex flex-wrap gap-x-2 text-[13px]">
                      <span className="tabular-nums text-gray-500 w-12">{fmtShort(it.date)}</span>
                      <span className="font-medium text-gray-800">
                        {it.name ||
                          t(`coach.reports.coach.entries.fallbackName.${it.kind || 'exercise'}`)}
                      </span>
                      <span className="text-gray-500">
                        {it.reason
                          ? t(`workout.skipReasonCoach.${it.reason}`, {
                              defaultValue: t('coach.reports.coach.entries.noReason'),
                            })
                          : t('coach.reports.coach.entries.noReason')}
                      </span>
                      {it.note && <span className="text-gray-500 italic">«{it.note}»</span>}
                    </li>
                  ))}
                </ul>
                {report.entries.skippedItems.length > 10 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {t('coach.reports.coach.entries.more', {
                      count: report.entries.skippedItems.length - 10,
                    })}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-gray-500">{t('coach.reports.coach.entries.noSkips')}</p>
            )}
          </div>
        </section>
      )}

      {/* Series por patrón de movimiento */}
      {m.mainWork && (
        <section className="card" id="sec-patrones">
          <SectionTitle icon={Flame}>{t('coach.reports.coach.patterns.title')}</SectionTitle>
          <p className="text-xs text-gray-400 -mt-2 mb-3">
            {t('coach.reports.coach.patterns.note')}
          </p>
          <ResponsiveContainer width="100%" height={Math.max(180, patternRows.length * 44)}>
            <BarChart data={patternRows} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f0eb" horizontal={false} />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={150}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="now"
                name={t('coach.reports.coach.patterns.thisPeriod')}
                fill="#ea580c"
                radius={[0, 4, 4, 0]}
                maxBarSize={16}
              />
              <Bar
                dataKey="prev"
                name={t('coach.reports.coach.patterns.previous')}
                fill="#e3d8cf"
                radius={[0, 4, 4, 0]}
                maxBarSize={16}
              />
            </BarChart>
          </ResponsiveContainer>
        </section>
      )}

      {/* Destacados */}
      {m.exercises &&
        (report.highlights.records.length > 0 ||
          report.highlights.topProgress.length > 0 ||
          report.highlights.stalled.length > 0) && (
          <section className="grid sm:grid-cols-3 gap-3">
            {report.highlights.records.length > 0 && (
              <div className="card">
                <SectionTitle icon={Trophy}>
                  {t('coach.reports.coach.highlights.records')}
                </SectionTitle>
                <ul className="space-y-1.5">
                  {report.highlights.records.map((e) => (
                    <li key={e.exerciseId} className="text-sm text-gray-700 break-words">
                      {e.name}:{' '}
                      <b>
                        {e.periodMax} {unitOf(e.metric)}
                      </b>{' '}
                      <span className="text-xs text-gray-400">
                        {t('coach.reports.coach.highlights.before', { value: e.historyMax })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.highlights.topProgress.length > 0 && (
              <div className="card">
                <SectionTitle icon={TrendingUp}>
                  {t('coach.reports.coach.highlights.topChange')}
                </SectionTitle>
                <ul className="space-y-1.5">
                  {report.highlights.topProgress.slice(0, 4).map((e) => (
                    <li key={e.exerciseId} className="text-sm text-gray-700 break-words">
                      {e.name}:{' '}
                      <b className={e.progression.pct >= 0 ? 'text-emerald-600' : 'text-gray-600'}>
                        {e.progression.pct > 0 ? '+' : ''}
                        {e.progression.pct}%
                      </b>{' '}
                      <span className="text-xs text-gray-400">
                        {e.progression.firstAvg} → {e.progression.lastAvg} {unitOf(e.metric)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.highlights.stalled.length > 0 && (
              <div className="card">
                <SectionTitle icon={PauseCircle}>
                  {t('coach.reports.coach.highlights.stalled')}
                </SectionTitle>
                <ul className="space-y-1.5">
                  {report.highlights.stalled.map((e) => (
                    <li key={e.exerciseId} className="text-sm text-gray-700 break-words">
                      {e.name}{' '}
                      <span className="text-xs text-gray-400">
                        {t('coach.reports.coach.highlights.stalledDetail', {
                          count: e.points.length,
                          value: e.periodMax,
                          unit: unitOf(e.metric),
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

      {/* Tabla por ejercicio */}
      {m.exercises && (
        <section className="card overflow-x-auto">
          <SectionTitle>{t('coach.reports.coach.table.title')}</SectionTitle>
          <table className="w-full text-sm" data-export-sortable="true">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="py-2 pr-2 font-medium">{t('coach.reports.coach.table.exercise')}</th>
                <th className="py-2 pr-2 font-medium">
                  {t('coach.reports.coach.table.measuredIn')}
                </th>
                <th className="py-2 pr-2 font-medium text-right">
                  {t('coach.reports.coach.table.logs')}
                </th>
                <th className="py-2 pr-2 font-medium text-right">
                  {t('coach.reports.coach.table.periodMax')}
                </th>
                <th className="py-2 pr-2 font-medium text-right">
                  {t('coach.reports.coach.table.startEnd')}
                </th>
                <th className="py-2 font-medium text-right">
                  {t('coach.reports.coach.table.change')}
                </th>
              </tr>
            </thead>
            <tbody>
              {report.exercises.map((e) => (
                <tr key={e.exerciseId} className="border-b border-gray-50">
                  <td className="py-2 pr-2 text-gray-800 break-words">
                    {e.name}
                    {e.isRecord && <Trophy size={13} className="inline ml-1 text-amber-500" />}
                  </td>
                  <td className="py-2 pr-2 text-gray-500">{unitOf(e.metric)}</td>
                  <td className="py-2 pr-2 text-right text-gray-500">{e.points.length}</td>
                  <td className="py-2 pr-2 text-right font-medium text-gray-800">{e.periodMax}</td>
                  <td className="py-2 pr-2 text-right text-gray-500">
                    {e.progression ? `${e.progression.firstAvg} → ${e.progression.lastAvg}` : '—'}
                  </td>
                  <td className="py-2 text-right">
                    {e.progression ? (
                      <span
                        className={
                          e.progression.pct > 0
                            ? 'text-emerald-600'
                            : e.progression.pct < 0
                              ? 'text-gray-500'
                              : 'text-gray-400'
                        }
                      >
                        {e.progression.pct > 0 ? '+' : ''}
                        {e.progression.pct}%
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Esfuerzo percibido */}
      {m.effort && effortRows.length > 1 && (
        <section className="card" id="sec-esfuerzo">
          <SectionTitle>{t('coach.reports.coach.effort.title')}</SectionTitle>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={effortRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f0eb" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis
                domain={[0, 10]}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={24}
              />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="pse"
                name={t('coach.reports.coach.effort.pse')}
                stroke="#76675d"
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="borg"
                name={t('coach.reports.coach.effort.borg')}
                stroke="#ea580c"
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-400 mt-1">
            {t('coach.reports.coach.effort.note')}
            {report.effort.pseAvg != null && (
              <>
                {' '}
                · {t('coach.reports.coach.effort.periodAvg')} <b>{report.effort.pseAvg}</b>
              </>
            )}
          </p>
        </section>
      )}

      {/* Bloques (aeróbico / circuito) */}
      {m.blocks && (
        <section className="card">
          <SectionTitle>{t('coach.reports.coach.blocks.title')}</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {report.blocks.map((b) => (
              <div key={b.blockType} className="text-sm text-gray-700">
                <b>
                  {t(`coach.reports.coach.blocks.types.${b.blockType}`, {
                    defaultValue: b.blockType,
                  })}
                </b>
                : {t('coach.reports.coach.blocks.count', { count: b.count })}
                {b.minutes > 0 && <span className="text-gray-500"> · {b.minutes} min</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Wellbeing */}
      {m.wellbeing && (
        <section className="card">
          <SectionTitle>{t('coach.reports.coach.wellbeing.title')}</SectionTitle>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
            {report.wellbeing.map((w) => (
              <div key={w.key} className="flex items-baseline justify-between text-sm">
                <span className="text-gray-600">
                  {t(`coach.reports.coach.wellbeing.labels.${w.key}`, { defaultValue: w.key })}
                </span>
                <span className="text-right">
                  <b className="text-gray-800">{w.avg}</b>
                  {w.prevAvg != null && (
                    <span className="text-xs text-gray-400">
                      {' '}
                      {t('coach.reports.coach.wellbeing.before', { value: w.prevAvg })}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {t('coach.reports.coach.wellbeing.note', { count: report.wellbeing[0]?.n ?? 0 })}
          </p>
        </section>
      )}

      <footer className="text-xs text-gray-300 text-center pb-6">
        {coachProfile?.name
          ? t('coach.reports.coach.footerPreparedBy', { name: coachProfile.name })
          : ''}
        {format(new Date(), t('dates.dayMonthYear'), { locale: dateLocale() })}
      </footer>
    </div>
  )
}
