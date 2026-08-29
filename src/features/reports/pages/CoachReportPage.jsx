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
// Colores: los de la app (indigo #6366f1 para el período, gris #d1d5db para
// el período anterior — "anterior" es SIEMPRE gris en todos los gráficos —,
// violeta #8b5cf6 PSE, naranja #ea580c Borg). Un eje por gráfico.
// ============================================================
import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  ArrowLeft,
  Download,
  Printer,
  Trophy,
  TrendingUp,
  PauseCircle,
  Flame,
  CalendarCheck,
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
  { weeks: 4, days: 28, label: '4 semanas' },
  { weeks: 8, days: 56, label: '8 semanas' },
  { weeks: 12, days: 84, label: '12 semanas' },
]

const WELLBEING_LABELS = {
  sleep_quality: 'Sueño',
  nutrition_quality: 'Nutrición',
  hydration_quality: 'Hidratación',
  energy_level: 'Energía',
  stress_level: 'Estrés',
  muscle_fatigue: 'Fatiga muscular',
}

const BLOCK_TYPE_LABELS = { aerobic: 'Aeróbico', circuit: 'Circuito', strength: 'Fuerza' }

const fmtDay = (d) => format(new Date(`${d}T00:00:00`), "d 'de' MMMM", { locale: es })
const fmtShort = (d) => format(new Date(`${d}T00:00:00`), 'dd/MM')

// Delta período vs anterior, como texto neutro (sin juicio de valor: subir
// estrés no es "mejor" — el juicio lo pone la coach en el preview).
function Delta({ now, prev, unit = '' }) {
  if (prev == null || now == null) return null
  const diff = Math.round((now - prev) * 10) / 10
  if (diff === 0) return <span className="text-xs text-gray-400">= igual que antes</span>
  return (
    <span className={`text-xs ${diff > 0 ? 'text-emerald-600' : 'text-gray-500'}`}>
      {diff > 0 ? '↑' : '↓'} {Math.abs(diff)}
      {unit} vs período anterior
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

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Cargando informe…</div>
  }
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
  if (!report) return null

  const m = report.modules
  const noData = !m.attendance && !m.mainWork && !m.activation && !m.blocks

  const patternRows = report.mainWork.byPattern.map((p) => ({
    name: p.pattern === UNTAGGED_KEY ? 'Sin categoría' : p.pattern,
    'Este período': p.series,
    Anterior: p.prevSeries ?? 0,
  }))

  const effortRows = (() => {
    const byWeek = new Map()
    for (const w of report.effort.pseWeekly)
      byWeek.set(w.week, { week: fmtShort(w.week), PSE: w.avg })
    for (const w of report.effort.borgWeekly) {
      if (!byWeek.has(w.week)) byWeek.set(w.week, { week: fmtShort(w.week) })
      byWeek.get(w.week).Borg = w.avg
    }
    return [...byWeek.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, v]) => v)
  })()

  const attendanceRows = report.attendance.weekly.map((w) => ({
    week: fmtShort(w.week),
    Completos: w.fullDays,
    'Solo activación': w.partialDays,
    Previstos: w.expected,
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
        attendanceRows.map((r) => `Semana del ${r.week}: ${r.Completos} días completos`),
        attendanceRows.map((r) => `Semana del ${r.week}: ${r['Solo activación']} solo activación`),
      ],
    },
    {
      selector: '#sec-patrones',
      bars: [
        patternRows.map((r) => `${r.name}: ${r['Este período']} series`),
        patternRows.map((r) => `${r.name}: ${r.Anterior} series el período anterior`),
      ],
    },
    {
      selector: '#sec-esfuerzo',
      dots: [
        effortRows.filter((r) => r.PSE != null).map((r) => `Semana del ${r.week}: PSE ${r.PSE}`),
        effortRows.filter((r) => r.Borg != null).map((r) => `Semana del ${r.week}: Borg ${r.Borg}`),
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
            onClick={() =>
              downloadReportHtml(
                document.getElementById('report-root'),
                {
                  studentName: student?.name || 'alumno',
                  from: report.period.from,
                  to: report.period.to,
                },
                { svgTitleSpecs }
              )
            }
            className="btn-primary flex items-center gap-1.5 text-sm"
          >
            <Download size={16} /> Descargar
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
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setUseCustomRange(true)}
          className={`px-3 py-1.5 rounded-lg text-sm ${
            useCustomRange ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500'
          }`}
        >
          Personalizado
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
        <h1 className="text-xl font-bold text-gray-900">Informe de progreso</h1>
        <p className="text-sm text-gray-600">
          {student?.name || 'Alumno'} · {fmtDay(report.period.from)} — {fmtDay(report.period.to)}
          {student?.modality && student.modality !== 'online' && ` · ${student.modality}`}
        </p>
        {coachProfile?.name && (
          <p className="text-xs text-gray-400 mt-0.5">Preparado por {coachProfile.name}</p>
        )}
      </header>

      {noData && (
        <div className="card text-sm text-gray-500">
          No hay registros de entrenamiento en este período.
        </div>
      )}

      {/* Resumen */}
      {m.attendance && (
        <section>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Días entrenados"
              value={report.attendance.daysTrained}
              sub={
                hasPartialDays
                  ? `${report.attendance.fullDays} completos · ${report.attendance.partialDays} solo activación`
                  : `${report.attendance.sessionsPerWeek} por semana`
              }
            >
              <Delta now={report.attendance.daysTrained} prev={report.attendance.prevDaysTrained} />
              {report.attendance.bestStreak > 1 && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Mejor racha: {report.attendance.bestStreak} días seguidos
                </p>
              )}
            </StatCard>
            {hasExpected ? (
              <StatCard
                label="Cumplimiento del plan"
                value={`${report.attendance.compliancePct}%`}
                sub={`${report.attendance.daysTrained} de ${report.attendance.expectedDays} días previstos`}
              >
                <Delta
                  now={report.attendance.compliancePct}
                  prev={report.attendance.prevCompliancePct}
                  unit="%"
                />
              </StatCard>
            ) : (
              <StatCard label="Días por semana" value={report.attendance.sessionsPerWeek} />
            )}
            {m.activation && (
              <StatCard
                label="Activación"
                value={`${report.activation.pctOfTrainedDays}%`}
                sub="de los días que entrenó"
              />
            )}
            {m.mainWork && (
              <StatCard label="Series de trabajo" value={report.mainWork.seriesTotal}>
                <Delta now={report.mainWork.seriesTotal} prev={report.mainWork.prevSeriesTotal} />
              </StatCard>
            )}
          </div>
        </section>
      )}

      {/* Asistencia por semana */}
      {m.attendance && attendanceRows.length > 1 && (
        <section className="card" id="sec-constancia">
          <SectionTitle icon={CalendarCheck}>Constancia semanal</SectionTitle>
          <ResponsiveContainer width="100%" height={170}>
            <ComposedChart data={attendanceRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
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
              <Bar dataKey="Completos" stackId="dias" fill="#6366f1" maxBarSize={36} />
              <Bar
                dataKey="Solo activación"
                stackId="dias"
                fill="#a5b4fc"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
              />
              {hasExpected && (
                <Line
                  type="stepAfter"
                  dataKey="Previstos"
                  stroke="#9ca3af"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          {hasExpected && (
            <p className="text-xs text-gray-400 mt-1">
              La línea punteada es lo previsto por el plan vigente cada semana (cambia si el plan
              cambia).
            </p>
          )}
        </section>
      )}

      {/* Series por patrón de movimiento */}
      {m.mainWork && (
        <section className="card" id="sec-patrones">
          <SectionTitle icon={Flame}>Trabajo principal por patrón de movimiento</SectionTitle>
          <p className="text-xs text-gray-400 -mt-2 mb-3">
            Series realizadas (sin contar la activación). Un ejercicio puede aportar a más de un
            patrón.
          </p>
          <ResponsiveContainer width="100%" height={Math.max(180, patternRows.length * 44)}>
            <BarChart data={patternRows} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
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
              <Bar dataKey="Este período" fill="#6366f1" radius={[0, 4, 4, 0]} maxBarSize={16} />
              <Bar dataKey="Anterior" fill="#d1d5db" radius={[0, 4, 4, 0]} maxBarSize={16} />
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
                <SectionTitle icon={Trophy}>Récords</SectionTitle>
                <ul className="space-y-1.5">
                  {report.highlights.records.map((e) => (
                    <li key={e.exerciseId} className="text-sm text-gray-700 break-words">
                      {e.name}:{' '}
                      <b>
                        {e.periodMax} {e.metric === 'weight' ? 'kg' : 'reps'}
                      </b>{' '}
                      <span className="text-xs text-gray-400">(antes {e.historyMax})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.highlights.topProgress.length > 0 && (
              <div className="card">
                <SectionTitle icon={TrendingUp}>Mayor cambio</SectionTitle>
                <ul className="space-y-1.5">
                  {report.highlights.topProgress.slice(0, 4).map((e) => (
                    <li key={e.exerciseId} className="text-sm text-gray-700 break-words">
                      {e.name}:{' '}
                      <b className={e.progression.pct >= 0 ? 'text-emerald-600' : 'text-gray-600'}>
                        {e.progression.pct > 0 ? '+' : ''}
                        {e.progression.pct}%
                      </b>{' '}
                      <span className="text-xs text-gray-400">
                        {e.progression.firstAvg} → {e.progression.lastAvg}{' '}
                        {e.metric === 'weight' ? 'kg' : 'reps'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.highlights.stalled.length > 0 && (
              <div className="card">
                <SectionTitle icon={PauseCircle}>Sin cambios</SectionTitle>
                <ul className="space-y-1.5">
                  {report.highlights.stalled.map((e) => (
                    <li key={e.exerciseId} className="text-sm text-gray-700 break-words">
                      {e.name}{' '}
                      <span className="text-xs text-gray-400">
                        ({e.points.length} registros en {e.periodMax}{' '}
                        {e.metric === 'weight' ? 'kg' : 'reps'})
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
          <SectionTitle>Por ejercicio</SectionTitle>
          <table className="w-full text-sm" data-export-sortable="true">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="py-2 pr-2 font-medium">Ejercicio</th>
                <th className="py-2 pr-2 font-medium">Se mide en</th>
                <th className="py-2 pr-2 font-medium text-right">Registros</th>
                <th className="py-2 pr-2 font-medium text-right">Máx. período</th>
                <th className="py-2 pr-2 font-medium text-right">Inicio → Fin</th>
                <th className="py-2 font-medium text-right">Cambio</th>
              </tr>
            </thead>
            <tbody>
              {report.exercises.map((e) => (
                <tr key={e.exerciseId} className="border-b border-gray-50">
                  <td className="py-2 pr-2 text-gray-800 break-words">
                    {e.name}
                    {e.isRecord && <Trophy size={13} className="inline ml-1 text-amber-500" />}
                  </td>
                  <td className="py-2 pr-2 text-gray-500">
                    {e.metric === 'weight' ? 'kg' : 'reps'}
                  </td>
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
          <SectionTitle>Esfuerzo percibido por semana</SectionTitle>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={effortRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
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
                dataKey="PSE"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="Borg"
                stroke="#ea580c"
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-400 mt-1">
            PSE: promedio de lo que registró por ejercicio · Borg: intensidad de la sesión
            {report.effort.pseAvg != null && (
              <>
                {' '}
                · Promedio del período: <b>{report.effort.pseAvg}</b>
              </>
            )}
          </p>
        </section>
      )}

      {/* Bloques (aeróbico / circuito) */}
      {m.blocks && (
        <section className="card">
          <SectionTitle>Bloques aeróbicos y circuitos</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {report.blocks.map((b) => (
              <div key={b.blockType} className="text-sm text-gray-700">
                <b>{BLOCK_TYPE_LABELS[b.blockType] || b.blockType}</b>: {b.count} bloques
                {b.minutes > 0 && <span className="text-gray-500"> · {b.minutes} min</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Wellbeing */}
      {m.wellbeing && (
        <section className="card">
          <SectionTitle>Bienestar</SectionTitle>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
            {report.wellbeing.map((w) => (
              <div key={w.key} className="flex items-baseline justify-between text-sm">
                <span className="text-gray-600">{WELLBEING_LABELS[w.key] || w.key}</span>
                <span className="text-right">
                  <b className="text-gray-800">{w.avg}</b>
                  {w.prevAvg != null && (
                    <span className="text-xs text-gray-400"> (antes {w.prevAvg})</span>
                  )}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Promedios del período · {report.wellbeing[0]?.n ?? 0} registros
          </p>
        </section>
      )}

      <footer className="text-xs text-gray-300 text-center pb-6">
        {coachProfile?.name ? `Informe preparado por ${coachProfile.name} · ` : ''}
        {format(new Date(), "d 'de' MMMM yyyy", { locale: es })}
      </footer>
    </div>
  )
}
