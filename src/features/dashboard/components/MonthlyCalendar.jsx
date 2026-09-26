import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, X } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import useCoachCalendarData, {
  COACH_EVENT_KIND,
  STUDENT_DAY_STYLE,
  computeStudentDayStatus,
} from '../hooks/useCoachCalendarData'
import { agendaPhrase } from '../calendarLogic'
import { DAYS_OF_WEEK } from '@/features/plans/assignmentHelpers'

// ============================================================
// MonthlyCalendar
// ------------------------------------------------------------
// Calendario mensual del dashboard del coach.
//
// Rediseño 2026-09-26 ("los circulitos no dicen nada"):
//   - Cada día DICE las cosas con palabras: "Pago · Martín",
//     "Fin de plan · Tomás", "Evaluación · Lucía". En el teléfono,
//     palabra corta ("Pago", "Fin", "Eval.").
//   - Todas las personas: además, "5 entrenaron" en cada día pasado.
//   - Una persona elegida: el día entero se pinta según cómo le fue
//     (cumplido / parcial / no asistió / día extra / planificado),
//     con ícono y palabra.
//   - Se sacó el modo comparación (2-3 personas con puntitos de
//     colores): no se entendía y lo cubre la lista de cumplimiento.
//
// La persona elegida es la del filtro global del dashboard. El
// selector de acá arriba cambia ese mismo filtro (onSelectStudent).
// ============================================================

const MAX_TAGS = 3

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date, n) {
  const d = startOfDay(date)
  d.setDate(d.getDate() + n)
  return d
}

function toYMD(date) {
  const d = startOfDay(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const firstName = (name) => String(name || '').split(' ')[0]

function dayStatus(data, ymd, today) {
  if (!data) return 'rest'
  return computeStudentDayStatus(ymd, data.expected, data.completed, today, {
    scheduleMode: data.scheduleMode,
    flexibleOverflowSet: data.flexibleOverflow,
    partialSet: data.partial,
  })
}

function listJoin(items) {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

export default function MonthlyCalendar({
  studentId = null,
  studentOptions = [],
  onSelectStudent = null,
} = {}) {
  const today = useMemo(() => startOfDay(new Date()), [])
  const [monthAnchor, setMonthAnchor] = useState(today)
  const [openDay, setOpenDay] = useState(null) // YMD string

  const selectedIds = useMemo(() => (studentId ? [studentId] : []), [studentId])
  const { loading, eventsByDate, perStudentDays, trainedCountByDate, window } =
    useCoachCalendarData(monthAnchor, selectedIds)

  const mode = studentId ? 'individual' : 'aggregate'
  const studentData = studentId ? perStudentDays.get(studentId) : null

  function shiftMonth(delta) {
    setMonthAnchor((d) => {
      const x = new Date(d)
      x.setDate(1)
      x.setMonth(x.getMonth() + delta)
      return x
    })
    setOpenDay(null)
  }
  function goToday() {
    setMonthAnchor(today)
    setOpenDay(toYMD(today))
  }

  const days = useMemo(() => {
    const out = []
    let cursor = startOfDay(window.start)
    const end = startOfDay(window.end)
    while (cursor <= end) {
      out.push(cursor)
      cursor = addDays(cursor, 1)
    }
    return out
  }, [window])

  // Resumen del mes para una persona: cuántos días de cada estado
  // (solo días del mes, hasta hoy) + qué días tiene el plan.
  const summary = useMemo(() => {
    if (mode !== 'individual' || !studentData) return null
    const counts = {}
    for (const day of days) {
      if (day.getMonth() !== monthAnchor.getMonth()) continue
      const s = dayStatus(studentData, toYMD(day), today)
      if (s === 'rest') continue
      counts[s] = (counts[s] || 0) + 1
    }
    const a = studentData.assignment
    let planText = null
    if (a && studentData.scheduleMode === 'fixed' && (a.preferred_days || []).length > 0) {
      const names = [...a.preferred_days]
        .sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7))
        .map((d) => DAYS_OF_WEEK[d]?.label?.toLowerCase())
        .filter(Boolean)
      planText = `Plan: ${listJoin(names)}`
    } else if (a) {
      const spw = Number(a.plan?.sessions_per_week)
      planText =
        Number.isFinite(spw) && spw > 0
          ? `Plan: ${spw} por semana, en los días que elija`
          : 'Plan con días libres'
    } else {
      planText = 'Sin plan activo'
    }
    return { counts, planText }
  }, [mode, studentData, days, monthAnchor, today])

  const hasTrainedCounts = mode === 'aggregate' && trainedCountByDate?.size > 0

  return (
    <section className="card space-y-3">
      {/* ── Encabezado ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="eyebrow">Calendario</p>
          <p className="text-xl font-bold text-tinta capitalize leading-tight">
            {format(monthAnchor, 'LLLL yyyy', { locale: es })}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {onSelectStudent && (
            <label
              className={[
                'relative flex-1 sm:flex-none inline-flex items-center h-9 rounded-full border text-sm',
                studentId
                  ? 'bg-durazno-50 border-durazno-200 text-primary-700 font-medium'
                  : 'bg-white border-linea text-tinta',
              ].join(' ')}
            >
              <span className="sr-only">Ver el calendario de</span>
              <select
                value={studentId || ''}
                onChange={(e) => onSelectStudent(e.target.value || null)}
                className="appearance-none bg-transparent pl-3 pr-8 h-full w-full sm:w-auto sm:max-w-[220px] truncate focus:outline-none cursor-pointer"
              >
                <option value="">Todas las personas</option>
                {studentOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-2.5 pointer-events-none" />
            </label>
          )}
          <button
            onClick={goToday}
            className="h-9 px-3 rounded-full border border-linea text-sm font-medium text-primary-700 hover:bg-durazno-50"
          >
            Hoy
          </button>
          <button
            onClick={() => shiftMonth(-1)}
            className="w-9 h-9 grid place-items-center rounded-full border border-linea text-texto2 hover:bg-durazno-50"
            aria-label="Mes anterior"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => shiftMonth(1)}
            className="w-9 h-9 grid place-items-center rounded-full border border-linea text-texto2 hover:bg-durazno-50"
            aria-label="Mes siguiente"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* ── Resumen de la persona elegida ──────────────────────── */}
      {summary && (
        <div className="flex flex-wrap items-center gap-1.5">
          {summary.counts.planned_done > 0 && (
            <span className="pill-ok">
              {summary.counts.planned_done} cumplido{summary.counts.planned_done === 1 ? '' : 's'}
            </span>
          )}
          {(summary.counts.planned_partial || 0) + (summary.counts.unplanned_partial || 0) > 0 && (
            <span className="pill-warn">
              {(summary.counts.planned_partial || 0) + (summary.counts.unplanned_partial || 0)}{' '}
              parcial
              {(summary.counts.planned_partial || 0) + (summary.counts.unplanned_partial || 0) === 1
                ? ''
                : 'es'}
            </span>
          )}
          {summary.counts.planned_missed > 0 && (
            <span className="pill-bad">{summary.counts.planned_missed} no asistió</span>
          )}
          {summary.counts.unplanned_done > 0 && (
            <span className="pill-neutral">
              {summary.counts.unplanned_done} día{summary.counts.unplanned_done === 1 ? '' : 's'}{' '}
              extra
            </span>
          )}
          <span className="text-[13px] text-texto2">{summary.planText}</span>
        </div>
      )}

      {/* ── Días de la semana ──────────────────────────────────── */}
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-wide text-texto3">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <div key={d} className="text-center sm:text-left sm:pl-2">
            {DAYS_OF_WEEK[d].short}
          </div>
        ))}
      </div>

      {/* ── Grilla ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
        {days.map((day) => {
          const ymd = toYMD(day)
          return (
            <DayCell
              key={ymd}
              day={day}
              inMonth={day.getMonth() === monthAnchor.getMonth()}
              isToday={ymd === toYMD(today)}
              isOpen={openDay === ymd}
              events={eventsByDate.get(ymd) || []}
              status={mode === 'individual' ? dayStatus(studentData, ymd, today) : 'rest'}
              trainedCount={
                mode === 'aggregate' && day <= today ? trainedCountByDate?.get(ymd) || 0 : 0
              }
              onClick={() => setOpenDay((prev) => (prev === ymd ? null : ymd))}
            />
          )
        })}
      </div>

      {loading && <p className="text-xs text-texto3 text-center">Cargando…</p>}

      {/* ── Detalle del día tocado ─────────────────────────────── */}
      {openDay && (
        <DayDetail
          ymd={openDay}
          events={eventsByDate.get(openDay) || []}
          mode={mode}
          status={mode === 'individual' ? dayStatus(studentData, openDay, today) : 'rest'}
          trainedCount={mode === 'aggregate' ? trainedCountByDate?.get(openDay) || 0 : 0}
          onClose={() => setOpenDay(null)}
        />
      )}

      <Legend
        mode={mode}
        eventsByDate={eventsByDate}
        summary={summary}
        hasTrainedCounts={hasTrainedCounts}
      />
    </section>
  )
}

// ─────────────────────────────────────────────────────────────
// EventTag — etiqueta con palabras (completa en compu, corta en teléfono)
// ─────────────────────────────────────────────────────────────
function EventTag({ ev, withName = true }) {
  const cfg = COACH_EVENT_KIND[ev.type]
  if (!cfg) return null
  const cls = ev.late ? cfg.lateClass : cfg.tagClass
  return (
    <span
      className={`block rounded-md px-0.5 sm:px-1.5 py-px sm:py-0.5 text-[9.5px] sm:text-[11.5px] leading-tight text-center sm:text-left truncate sm:whitespace-normal ${cls}`}
      title={ev.title}
    >
      <span className="hidden sm:inline">
        {cfg.label}
        {withName && ev.studentName ? ` · ${firstName(ev.studentName)}` : ''}
      </span>
      <span className="sm:hidden">{cfg.short}</span>
    </span>
  )
}

// ─────────────────────────────────────────────────────────────
// DayCell
// ─────────────────────────────────────────────────────────────
function DayCell({ day, inMonth, isToday, isOpen, events, status, trainedCount, onClick }) {
  const style = STUDENT_DAY_STYLE[status]
  const painted = status !== 'rest' && inMonth
  const shown = events.slice(0, MAX_TAGS)
  const rest = events.length - shown.length

  return (
    <button
      onClick={onClick}
      className={[
        'min-w-0 min-h-[58px] sm:min-h-[96px] p-0.5 sm:p-1.5 rounded-lg sm:rounded-xl border text-left flex flex-col gap-0.5 sm:gap-1 transition-colors',
        painted
          ? style.cellClass
          : inMonth
            ? 'bg-white border-linea hover:bg-durazno-50'
            : 'bg-fondo border-linea',
        isToday ? '!border-2 !border-primary-600' : '',
        isOpen ? 'ring-2 ring-durazno-200' : '',
        !inMonth ? 'opacity-60' : '',
      ].join(' ')}
    >
      <span
        className={[
          'text-[11px] sm:text-[13px] font-bold tabular-nums leading-none text-center sm:text-left pt-0.5 sm:pt-0',
          isToday ? 'text-primary-700' : inMonth ? 'text-gray-700' : 'text-texto3',
        ].join(' ')}
      >
        {day.getDate()}
      </span>

      {painted && (
        <span
          className={`flex items-center justify-center sm:justify-start gap-1 text-xs font-medium ${style.textClass}`}
        >
          {style.icon && (
            <span className="text-base sm:text-sm font-bold leading-none">{style.icon}</span>
          )}
          <span className="hidden sm:inline">{style.label}</span>
        </span>
      )}

      {shown.map((ev, i) => (
        <EventTag key={i} ev={ev} />
      ))}
      {rest > 0 && (
        <span className="text-[9.5px] sm:text-[11px] text-texto2 text-center sm:text-left leading-tight">
          +{rest} más
        </span>
      )}

      {trainedCount > 0 && (
        <span className="mt-auto text-[9.5px] sm:text-[11.5px] text-texto2 tabular-nums text-center sm:text-left leading-tight">
          <span className="hidden sm:inline">{trainedCount} entrenaron</span>
          <span className="sm:hidden">{trainedCount} entr.</span>
        </span>
      )}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────
// DayDetail — lo que pasó ese día, escrito en frases
// ─────────────────────────────────────────────────────────────
function DayDetail({ ymd, events, mode, status, trainedCount, onClose }) {
  const [y, m, d] = ymd.split('-').map(Number)
  const fmt = format(new Date(y, m - 1, d), "EEEE d 'de' LLLL", { locale: es })
  const style = STUDENT_DAY_STYLE[status]

  return (
    <div className="rounded-recuadro bg-durazno-50 p-3 space-y-2">
      <div className="flex items-start justify-between">
        <p className="text-sm font-bold text-tinta first-letter:uppercase">{fmt}</p>
        <button
          onClick={onClose}
          className="p-0.5 text-texto3 hover:text-texto2"
          aria-label="Cerrar detalle"
        >
          <X size={16} />
        </button>
      </div>

      {mode === 'individual' && status !== 'rest' && (
        <p className={`text-sm font-medium ${style.textClass}`}>
          {style.icon} {style.label}
        </p>
      )}

      {mode === 'aggregate' && trainedCount > 0 && (
        <p className="text-sm text-texto2">
          {trainedCount} persona{trainedCount === 1 ? '' : 's'} registr
          {trainedCount === 1 ? 'ó' : 'aron'} entrenamiento.
        </p>
      )}

      {events.length > 0 && (
        <ul className="space-y-1.5">
          {events.map((ev, i) => {
            const p = agendaPhrase(ev)
            return (
              <li key={i} className="flex items-start gap-2 text-sm text-tinta">
                <span className="w-24 flex-shrink-0">
                  <EventTag ev={ev} withName={false} />
                </span>
                <span className="min-w-0">
                  {p.lead} <b className="font-bold">{p.name}</b>
                  {p.detail && <span className="block text-[13px] text-texto2">{p.detail}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {events.length === 0 &&
        !(mode === 'individual' && status !== 'rest') &&
        trainedCount === 0 && <p className="text-sm text-texto2">Nada anotado este día.</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Legend — solo lo que aparece este mes
// ─────────────────────────────────────────────────────────────
function Legend({ mode, eventsByDate, summary, hasTrainedCounts }) {
  const present = useMemo(() => {
    const set = new Set()
    for (const arr of eventsByDate.values()) {
      for (const ev of arr) set.add(ev.late ? `${ev.type}:late` : ev.type)
    }
    return set
  }, [eventsByDate])

  const kinds = Object.keys(COACH_EVENT_KIND).filter((k) => present.has(k))
  const hasLate = [...present].some((k) => k.endsWith(':late'))
  const statuses =
    mode === 'individual'
      ? [
          'planned_done',
          'planned_partial',
          'planned_missed',
          'unplanned_done',
          'planned_future',
        ].filter(
          (s) =>
            (summary?.counts?.[s] || 0) > 0 ||
            (s === 'planned_partial' && (summary?.counts?.unplanned_partial || 0) > 0)
        )
      : []

  if (kinds.length === 0 && !hasLate && statuses.length === 0 && !hasTrainedCounts) return null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-texto2 pt-2 border-t border-linea">
      {kinds.map((k) => (
        <span
          key={k}
          className={`inline-block rounded-md px-1.5 py-0.5 text-[11.5px] ${COACH_EVENT_KIND[k].tagClass}`}
        >
          {COACH_EVENT_KIND[k].label}
        </span>
      ))}
      {hasLate && (
        <span className="inline-block rounded-md px-1.5 py-0.5 text-[11.5px] bg-[#fee2e2] text-[#b91c1c]">
          Atrasado
        </span>
      )}
      {statuses.map((s) => {
        const st = STUDENT_DAY_STYLE[s]
        return (
          <span
            key={s}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${st.cellClass} ${st.textClass}`}
          >
            <b>{st.icon}</b>
            {st.label}
          </span>
        )
      })}
      {hasTrainedCounts && (
        <span>
          <span className="hidden sm:inline">“5 entrenaron”</span>
          <span className="sm:hidden">“5 entr.”</span>: personas que registraron entrenamiento ese
          día
        </span>
      )}
    </div>
  )
}
