import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, ChevronDown, X, Users } from 'lucide-react'
import { format } from 'date-fns'
import { dateLocale } from '@/i18n/dateLocale'
import useCoachCalendarData, {
  COACH_EVENT_KIND,
  STUDENT_DAY_STYLE,
  computeStudentDayStatus,
} from '../hooks/useCoachCalendarData'
import {
  agendaPhrase,
  CALENDAR_GROUPS,
  eventTitle,
  filterEventsByDate,
  FORM_UNANSWERED_WARN_DAYS,
} from '../calendarLogic'
import useCalendarVisibility from '../hooks/useCalendarVisibility'
import AvatarImage from '@/features/avatars/AvatarImage'
import { initialsOf } from '@/features/avatars/avatarUrls'

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
//   - Evaluaciones: la pendiente en su fecha agendada (roja si ya
//     pasó); la hecha en el día en que se hizo, con tilde.
//   - Tocar un día en modo todas lista quiénes entrenaron.
//   - Se sacó el modo comparación (2-3 personas con puntitos de
//     colores): no se entendía y lo cubre la lista de cumplimiento.
//
// 2026-09-27: la leyenda son interruptores por tema (Planes,
// Evaluaciones, Formularios, Pagos, La persona). Tocar uno lo apaga o
// lo enciende acá y en "Próximos 7 días"; queda guardado en el
// dispositivo. Formularios sin responder y respondidos arrancan
// apagados. Cada formulario / evaluación aparece una sola vez, según
// su estado.
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
    // El modo del plan vigente ESE día (historial completo, 2026-10-04).
    scheduleMode: data.modeByDate?.get(ymd) ?? data.scheduleMode,
    flexibleOverflowSet: data.flexibleOverflow,
    partialSet: data.partial,
  })
}

function listJoin(items, and) {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')}${and}${items[items.length - 1]}`
}

// Un día de la semana cualquiera (0 = domingo … 6 = sábado) para nombrarlo
// con date-fns en el idioma activo. 2024-01-07 fue domingo.
const weekdayDate = (d) => new Date(2024, 0, 7 + d)

export default function MonthlyCalendar({
  studentId = null,
  studentOptions = [],
  onSelectStudent = null,
} = {}) {
  const { t } = useTranslation()
  const today = useMemo(() => startOfDay(new Date()), [])
  const [monthAnchor, setMonthAnchor] = useState(today)
  const [openDay, setOpenDay] = useState(null) // YMD string

  const selectedIds = useMemo(() => (studentId ? [studentId] : []), [studentId])
  const {
    loading,
    eventsByDate: allEventsByDate,
    perStudentDays,
    trainedCountByDate,
    trainedNamesByDate,
    window,
  } = useCoachCalendarData(monthAnchor, selectedIds)
  const { hidden, toggle, reset, isDefault } = useCalendarVisibility()
  const eventsByDate = useMemo(
    () => filterEventsByDate(allEventsByDate, hidden, studentId),
    [allEventsByDate, hidden, studentId]
  )
  const showTrained = !hidden.has('trained')

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
        .filter((d) => d >= 0 && d <= 6)
        .map((d) => format(weekdayDate(d), 'EEEE', { locale: dateLocale() }))
      planText = t('coach.dashboard.calendar.summary.planDays', {
        days: listJoin(names, t('coach.dashboard.listAnd')),
      })
    } else if (a) {
      const spw = Number(a.plan?.sessions_per_week)
      planText =
        Number.isFinite(spw) && spw > 0
          ? t('coach.dashboard.calendar.summary.planPerWeek', { count: spw })
          : t('coach.dashboard.calendar.summary.planFree')
    } else {
      planText = t('coach.dashboard.calendar.summary.noPlan')
    }
    return { counts, planText }
  }, [mode, studentData, days, monthAnchor, today, t])

  const hasTrainedCounts = mode === 'aggregate' && trainedCountByDate?.size > 0 && showTrained

  return (
    <section className="card space-y-3">
      {/* ── Encabezado ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="eyebrow">{t('coach.dashboard.calendar.title')}</p>
          <p className="text-xl font-bold text-tinta capitalize leading-tight">
            {format(monthAnchor, 'LLLL yyyy', { locale: dateLocale() })}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {onSelectStudent && (
            <PersonPicker
              studentId={studentId}
              options={studentOptions}
              onChange={onSelectStudent}
            />
          )}
          <button
            onClick={goToday}
            className="h-9 px-3 rounded-full border border-linea text-sm font-medium text-primary-700 hover:bg-durazno-50"
          >
            {t('coach.dashboard.calendar.today')}
          </button>
          <button
            onClick={() => shiftMonth(-1)}
            className="w-9 h-9 grid place-items-center rounded-full border border-linea text-texto2 hover:bg-durazno-50"
            aria-label={t('coach.dashboard.calendar.prevMonth')}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => shiftMonth(1)}
            className="w-9 h-9 grid place-items-center rounded-full border border-linea text-texto2 hover:bg-durazno-50"
            aria-label={t('coach.dashboard.calendar.nextMonth')}
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
              {t('coach.dashboard.calendar.summary.done', { count: summary.counts.planned_done })}
            </span>
          )}
          {(summary.counts.planned_partial || 0) + (summary.counts.unplanned_partial || 0) > 0 && (
            <span className="pill-warn">
              {t('coach.dashboard.calendar.summary.partial', {
                count:
                  (summary.counts.planned_partial || 0) + (summary.counts.unplanned_partial || 0),
              })}
            </span>
          )}
          {summary.counts.planned_missed > 0 && (
            <span className="pill-bad">
              {t('coach.dashboard.calendar.summary.missed', {
                count: summary.counts.planned_missed,
              })}
            </span>
          )}
          {summary.counts.unplanned_done > 0 && (
            <span className="pill-neutral">
              {t('coach.dashboard.calendar.summary.extra', {
                count: summary.counts.unplanned_done,
              })}
            </span>
          )}
          <span className="text-[13px] text-texto2">{summary.planText}</span>
        </div>
      )}

      {/* ── Días de la semana ──────────────────────────────────── */}
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-wide text-texto3">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <div key={d} className="text-center sm:text-left sm:pl-2">
            {format(weekdayDate(d), 'EEE', { locale: dateLocale() })}
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
                mode === 'aggregate' && showTrained && day <= today
                  ? trainedCountByDate?.get(ymd) || 0
                  : 0
              }
              onClick={() => setOpenDay((prev) => (prev === ymd ? null : ymd))}
            />
          )
        })}
      </div>

      {loading && <p className="text-xs text-texto3 text-center">{t('common.loading')}</p>}

      {/* ── Detalle del día tocado ─────────────────────────────── */}
      {openDay && (
        <DayDetail
          ymd={openDay}
          events={eventsByDate.get(openDay) || []}
          mode={mode}
          status={mode === 'individual' ? dayStatus(studentData, openDay, today) : 'rest'}
          trainedNames={
            mode === 'aggregate' && showTrained ? trainedNamesByDate?.get(openDay) || [] : []
          }
          onClose={() => setOpenDay(null)}
        />
      )}

      <Legend
        mode={mode}
        eventsByDate={eventsByDate}
        summary={summary}
        hasTrainedCounts={hasTrainedCounts}
        hidden={hidden}
        onToggle={toggle}
        onReset={reset}
        isDefault={isDefault}
      />
    </section>
  )
}

// ─────────────────────────────────────────────────────────────
// EventTag — etiqueta con palabras (completa en compu, corta en teléfono)
// ─────────────────────────────────────────────────────────────
function EventTag({ ev, withName = true }) {
  const { t } = useTranslation()
  const cfg = COACH_EVENT_KIND[ev.type]
  if (!cfg) return null
  const cls = ev.late ? cfg.lateClass : cfg.tagClass
  const K = `coach.dashboard.calendar.kinds.${ev.type}.`
  // La actividad extra se nombra con su propio emoji ("⚽ Fútbol").
  const label = ev.type === 'activity' ? `${ev.emoji} ${eventTitle(ev, t)}` : t(K + 'label')
  const short = ev.type === 'activity' ? ev.emoji : t(K + 'short')
  const p = agendaPhrase(ev, t)
  const tooltip = [p.lead, p.name].filter(Boolean).join(' ') + (p.detail ? ` · ${p.detail}` : '')
  return (
    <span
      className={`block rounded-md px-0.5 sm:px-1.5 py-px sm:py-0.5 text-[9.5px] sm:text-[11.5px] leading-tight text-center sm:text-left truncate sm:whitespace-normal ${cls}`}
      title={tooltip}
    >
      <span className="hidden sm:inline">
        {label}
        {withName && ev.studentName ? ` · ${firstName(ev.studentName)}` : ''}
      </span>
      <span className="sm:hidden">{short}</span>
    </span>
  )
}

// ─────────────────────────────────────────────────────────────
// DayCell
// ─────────────────────────────────────────────────────────────
function DayCell({ day, inMonth, isToday, isOpen, events, status, trainedCount, onClick }) {
  const { t } = useTranslation()
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
          <span className="hidden sm:inline">{t(style.labelKey)}</span>
        </span>
      )}

      {shown.map((ev, i) => (
        <EventTag key={i} ev={ev} />
      ))}
      {rest > 0 && (
        <span className="text-[9.5px] sm:text-[11px] text-texto2 text-center sm:text-left leading-tight">
          {t('coach.dashboard.calendar.more', { count: rest })}
        </span>
      )}

      {trainedCount > 0 && (
        <span className="mt-auto text-[9.5px] sm:text-[11.5px] text-texto2 tabular-nums text-center sm:text-left leading-tight">
          <span className="hidden sm:inline">
            {t('coach.dashboard.calendar.trained', { count: trainedCount })}
          </span>
          <span className="sm:hidden">
            {t('coach.dashboard.calendar.trainedShort', { count: trainedCount })}
          </span>
        </span>
      )}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────
// DayDetail — lo que pasó ese día, escrito en frases
// ─────────────────────────────────────────────────────────────
function DayDetail({ ymd, events, mode, status, trainedNames = [], onClose }) {
  const { t } = useTranslation()
  const trainedCount = trainedNames.length
  const [y, m, d] = ymd.split('-').map(Number)
  const fmt = format(new Date(y, m - 1, d), t('coach.dashboard.calendar.dayDetailFormat'), {
    locale: dateLocale(),
  })
  const style = STUDENT_DAY_STYLE[status]

  return (
    <div className="rounded-recuadro bg-durazno-50 p-3 space-y-2">
      <div className="flex items-start justify-between">
        <p className="text-sm font-bold text-tinta first-letter:uppercase">{fmt}</p>
        <button
          onClick={onClose}
          className="p-0.5 text-texto3 hover:text-texto2"
          aria-label={t('coach.dashboard.calendar.closeDetail')}
        >
          <X size={16} />
        </button>
      </div>

      {mode === 'individual' && status !== 'rest' && (
        <p className={`text-sm font-medium ${style.textClass}`}>
          {style.icon} {t(style.labelKey)}
        </p>
      )}

      {mode === 'aggregate' && trainedCount > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm text-texto2">
            {t('coach.dashboard.calendar.trainedPeople', { count: trainedCount })}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {trainedNames.map((n, i) => (
              <li
                key={`${n}-${i}`}
                className="rounded-full bg-white border border-linea px-2.5 py-0.5 text-[13px] text-tinta"
              >
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}

      {events.length > 0 && (
        <ul className="space-y-1.5">
          {events.map((ev, i) => {
            const p = agendaPhrase(ev, t)
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
        trainedCount === 0 && (
          <p className="text-sm text-texto2">{t('coach.dashboard.calendar.nothing')}</p>
        )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Legend — interruptores por tema (2026-09-27)
// ------------------------------------------------------------
// Cada tipo de evento es un botón: encendido se ve como en el
// calendario; apagado, en blanco y tachado. Siempre se listan todos
// (para poder encender algo que este mes no aparece). Abajo, las
// referencias que no se apagan: "Atrasado" y los estados del día de
// una persona.
// ─────────────────────────────────────────────────────────────
const TRAINED_CHIP = {
  tagClass: 'bg-white border border-linea text-texto2',
}

function Legend({
  mode,
  eventsByDate,
  summary,
  hasTrainedCounts,
  hidden,
  onToggle,
  onReset,
  isDefault,
}) {
  const { t } = useTranslation()
  // Atrasado (rojo) y formulario demorado (ámbar) solo si aparecen.
  const { hasLate, hasLateForm } = useMemo(() => {
    let late = false
    let lateForm = false
    for (const arr of eventsByDate.values()) {
      for (const ev of arr) {
        if (!ev.late) continue
        if (ev.type === 'form_unanswered') lateForm = true
        else late = true
      }
    }
    return { hasLate: late, hasLateForm: lateForm }
  }, [eventsByDate])

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

  return (
    <div className="space-y-2 pt-2 border-t border-linea">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-texto2">{t('coach.dashboard.calendar.legendHint')}</p>
        {!isDefault && (
          <button
            onClick={onReset}
            className="text-xs font-medium text-primary-700 hover:underline flex-shrink-0"
          >
            {t('coach.dashboard.calendar.reset')}
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        {CALENDAR_GROUPS.map((g) => {
          const kinds = g.kinds.filter((k) => k !== 'trained' || mode === 'aggregate')
          if (kinds.length === 0) return null
          return (
            <div key={g.key} className="flex flex-wrap items-center gap-1.5">
              <span className="w-full sm:w-24 text-[11px] font-bold uppercase tracking-wide text-texto3">
                {t(`coach.dashboard.calendar.groups.${g.key}`)}
              </span>
              {kinds.map((k) => {
                const cfg = k === 'trained' ? TRAINED_CHIP : COACH_EVENT_KIND[k]
                const on = !hidden.has(k)
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => onToggle(k)}
                    aria-pressed={on}
                    className={[
                      'inline-block rounded-md px-1.5 py-0.5 text-[11.5px] transition-opacity',
                      on
                        ? cfg.tagClass
                        : 'bg-white border border-dashed border-linea text-texto3 line-through',
                    ].join(' ')}
                  >
                    {k === 'trained'
                      ? t('coach.dashboard.calendar.trainedChip')
                      : t(`coach.dashboard.calendar.kinds.${k}.legend`)}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      {(hasLate || hasLateForm || statuses.length > 0 || hasTrainedCounts) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-texto2">
          {hasLate && (
            <span className="inline-block rounded-md px-1.5 py-0.5 text-[11.5px] bg-red-100 text-red-700">
              {t('coach.dashboard.calendar.late')}
            </span>
          )}
          {hasLateForm && (
            <span className="inline-block rounded-md px-1.5 py-0.5 text-[11.5px] bg-amber-100 text-amber-800">
              {t('coach.dashboard.calendar.lateForm', { count: FORM_UNANSWERED_WARN_DAYS })}
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
                {t(st.labelKey)}
              </span>
            )
          })}
          {hasTrainedCounts && (
            <span>
              <span className="hidden sm:inline">
                {t('coach.dashboard.calendar.trainedExample')}
              </span>
              <span className="sm:hidden">{t('coach.dashboard.calendar.trainedExampleShort')}</span>
              {t('coach.dashboard.calendar.trainedLegend')}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// PersonPicker — a quién se le ve el calendario (2026-10-04)
// ─────────────────────────────────────────────────────────────
// Píldora con foto (o iniciales) y nombre; sin persona, ícono de grupo y
// "Todas las personas". Debajo hay un <select> nativo transparente que
// ocupa toda la píldora: la lista es la del sistema (cómoda en el
// teléfono, accesible) y la píldora es solo la cara visible. Con una
// persona elegida aparece una cruz para volver a todas.
function PersonPicker({ studentId, options = [], onChange }) {
  const { t } = useTranslation()
  const selected = studentId ? options.find((s) => s.id === studentId) || null : null
  return (
    <div className="relative flex-1 sm:flex-none min-w-0 flex items-center">
      <label
        className={[
          'relative flex-1 min-w-0 inline-flex items-center gap-2 h-9 rounded-full border pl-1 pr-8 text-sm transition-colors',
          'focus-within:ring-2 focus-within:ring-primary-200',
          selected
            ? 'bg-durazno-50 border-durazno-200 text-primary-700 font-semibold'
            : 'bg-white border-linea text-tinta hover:bg-durazno-50',
        ].join(' ')}
      >
        <span className="w-7 h-7 rounded-full bg-durazno-100 text-primary-700 text-[11px] font-bold grid place-items-center flex-shrink-0 overflow-hidden">
          {selected ? (
            <AvatarImage path={selected.avatar_url} alt="">
              {initialsOf(selected.name)}
            </AvatarImage>
          ) : (
            <Users size={15} />
          )}
        </span>
        <span className="truncate sm:max-w-[180px]">
          {selected ? selected.name : t('coach.dashboard.calendar.allPeople')}
        </span>
        <ChevronDown size={16} className="absolute right-2.5 pointer-events-none text-texto2" />
        <select
          value={studentId || ''}
          onChange={(e) => onChange(e.target.value || null)}
          aria-label={t('coach.dashboard.calendar.seeCalendarOf')}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        >
          <option value="">{t('coach.dashboard.calendar.allPeople')}</option>
          {options.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="ml-1 w-7 h-7 grid place-items-center rounded-full text-texto2 hover:bg-durazno-50 hover:text-primary-700 flex-shrink-0"
          aria-label={t('coach.dashboard.calendar.clearPerson')}
          title={t('coach.dashboard.calendar.clearPerson')}
        >
          <X size={15} />
        </button>
      )}
    </div>
  )
}
