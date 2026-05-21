import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Search, X, CalendarDays, UserPlus } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import useCoachCalendarData, {
  COACH_EVENT_KIND,
  STUDENT_DAY_STYLE,
  computeStudentDayStatus,
} from '../hooks/useCoachCalendarData'
import { DAYS_OF_WEEK } from '@/features/plans/assignmentHelpers'

// ============================================================
// MonthlyCalendar
// ------------------------------------------------------------
// Calendario mensual del dashboard del coach.
//
// Tres modos de visualización (decididos con el coach):
//   1) Agregado (sin alumnos seleccionados):
//        Solo eventos del coach: inicios de plan, vencimientos,
//        pagos, cumpleaños. El calendario queda limpio.
//   2) Individual (1 alumno seleccionado):
//        Eventos + estado del día de entrenamiento del alumno
//          (cumplido / no asistió / próximo / día extra).
//   3) Comparación (2-3 alumnos seleccionados):
//        Eventos + un dot de color por alumno en los días que
//        entrenó. Se bloquea seleccionar un cuarto.
//
// El componente es self-contained: maneja su propio estado de
// mes, selección y día abierto. El padre solo lo monta.
// ============================================================

const MAX_COMPARISON = 3
// Paleta para el modo comparación. Se asigna por orden de selección.
// Se evita rojo puro: coral si llegamos al 3er alumno.
const COMPARISON_PALETTE = [
  { dotClass: 'bg-blue-500',   ringClass: 'ring-blue-300',   chipClass: 'bg-blue-100   text-blue-700   border-blue-300' },
  { dotClass: 'bg-purple-500', ringClass: 'ring-purple-300', chipClass: 'bg-purple-100 text-purple-700 border-purple-300' },
  { dotClass: 'bg-teal-500',   ringClass: 'ring-teal-300',   chipClass: 'bg-teal-100   text-teal-700   border-teal-300' },
]

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

function sameYMD(a, b) {
  return toYMD(a) === toYMD(b)
}

export default function MonthlyCalendar() {
  const today = useMemo(() => startOfDay(new Date()), [])
  const [monthAnchor, setMonthAnchor] = useState(today)
  const [selectedIds, setSelectedIds] = useState([])
  const [openDay, setOpenDay] = useState(null) // YMD string
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const {
    loading,
    students,
    selectedStudents,
    eventsByDate,
    perStudentDays,
    window,
  } = useCoachCalendarData(monthAnchor, selectedIds)

  // Mapa rápido id → color asignado en el modo comparación
  const studentColors = useMemo(() => {
    const map = new Map()
    selectedIds.forEach((id, i) => {
      map.set(id, COMPARISON_PALETTE[i % COMPARISON_PALETTE.length])
    })
    return map
  }, [selectedIds])

  const mode = selectedIds.length === 0
    ? 'aggregate'
    : selectedIds.length === 1
      ? 'individual'
      : 'comparison'

  function goPrev() { setMonthAnchor(d => { const x = new Date(d); x.setMonth(x.getMonth() - 1); return x }) }
  function goNext() { setMonthAnchor(d => { const x = new Date(d); x.setMonth(x.getMonth() + 1); return x }) }
  function goToday() { setMonthAnchor(today); setOpenDay(toYMD(today)) }

  function toggleStudent(id) {
    setSelectedIds(curr => {
      if (curr.includes(id)) return curr.filter(x => x !== id)
      if (curr.length >= MAX_COMPARISON) return curr
      return [...curr, id]
    })
    setOpenDay(null)
  }

  // Filtrado de búsqueda
  const filteredStudents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return students
    return students.filter(s => (s.name || '').toLowerCase().includes(q))
  }, [students, searchTerm])

  // Estructura del grid: 6 filas x 7 columnas a partir del lunes inicial.
  const weeks = useMemo(() => {
    const out = []
    let cursor = startOfDay(window.start)
    const end = startOfDay(window.end)
    while (cursor <= end) {
      const week = []
      for (let i = 0; i < 7; i++) {
        week.push(cursor)
        cursor = addDays(cursor, 1)
      }
      out.push(week)
    }
    return out
  }, [window])

  // Statuses efectivamente presentes en el mes, en modo individual.
  // Sirve para que la leyenda no muestre "No asistió" / "Día extra"
  // cuando ninguno aparece (común en alumnos en modo flexible).
  const presentIndividualStatuses = useMemo(() => {
    if (mode !== 'individual') return new Set()
    const sid = selectedIds[0]
    const data = perStudentDays.get(sid)
    if (!data) return new Set()
    const set = new Set()
    for (const day of weeks.flat()) {
      if (day.getMonth() !== monthAnchor.getMonth()) continue
      const ymd = toYMD(day)
      const s = computeStudentDayStatus(ymd, data.expected, data.completed, today, {
        scheduleMode: data.scheduleMode,
        flexibleOverflowSet: data.flexibleOverflow,
      })
      if (s !== 'rest') set.add(s)
    }
    return set
  }, [mode, selectedIds, perStudentDays, weeks, monthAnchor, today])

  return (
    <div className="card p-3 space-y-3">
      {/* ── Header: nav del mes + botón Hoy ───────────────────── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={goPrev}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
            aria-label="Mes anterior"
          >
            <ChevronLeft size={18} />
          </button>
          <h3 className="font-semibold text-gray-900 capitalize text-sm sm:text-base min-w-[110px] text-center">
            {format(monthAnchor, "LLLL yyyy", { locale: es })}
          </h3>
          <button
            onClick={goNext}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
            aria-label="Mes siguiente"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={goToday}
            className="text-xs font-medium text-primary-600 hover:bg-primary-50 px-2 py-1 rounded-lg"
          >
            Hoy
          </button>
          {selectedIds.length < MAX_COMPARISON && (
            <button
              onClick={() => setSearchOpen(v => !v)}
              className={[
                'inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg transition-colors',
                searchOpen
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
              ].join(' ')}
              aria-label={selectedIds.length === 0 ? 'Filtrar por alumno' : 'Agregar otro alumno'}
              aria-expanded={searchOpen}
            >
              <UserPlus size={14} />
              <span className="hidden sm:inline">
                {selectedIds.length === 0 ? 'Filtrar alumno' : 'Agregar alumno'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* ── Filtro de alumnos: chips seleccionados + buscador ── */}
      {(selectedIds.length > 0 || searchOpen) && (
        <div className="space-y-2">
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {selectedStudents.map(s => {
                const color = studentColors.get(s.id) || COMPARISON_PALETTE[0]
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleStudent(s.id)}
                    className={`inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full border text-xs font-medium ${color.chipClass}`}
                  >
                    <span className={`w-2 h-2 rounded-full ${color.dotClass}`} />
                    <span className="truncate max-w-[120px]">{s.name}</span>
                    <X size={12} />
                  </button>
                )
              })}
              {selectedIds.length >= MAX_COMPARISON && (
                <span className="text-[10px] text-gray-400">
                  Máx. {MAX_COMPARISON} en comparación
                </span>
              )}
            </div>
          )}

          {searchOpen && (
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar alumno por nombre…"
                className="input pl-8 pr-8 text-sm"
                autoFocus
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label="Limpiar búsqueda"
                >
                  <X size={14} />
                </button>
              )}

              {/* Lista de alumnos: visible apenas se abre el buscador
                  (no exige tipear). Si el coach escribe, se filtra. */}
              {filteredStudents.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-auto">
                  {filteredStudents.slice(0, 12).map(s => {
                    const isSel = selectedIds.includes(s.id)
                    const isMax = !isSel && selectedIds.length >= MAX_COMPARISON
                    return (
                      <button
                        key={s.id}
                        onClick={() => {
                          if (isMax) return
                          toggleStudent(s.id)
                          setSearchTerm('')
                          // Si después de seleccionar llegamos al máximo,
                          // cerramos el panel automáticamente para devolver
                          // foco al calendario.
                          if (selectedIds.length + 1 >= MAX_COMPARISON) {
                            setSearchOpen(false)
                          }
                        }}
                        disabled={isMax}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-gray-50 ${
                          isMax ? 'opacity-40 cursor-not-allowed' : ''
                        } ${isSel ? 'bg-primary-50 text-primary-700' : 'text-gray-700'}`}
                      >
                        <span className="truncate">{s.name}</span>
                        {isSel && <span className="text-[10px]">Seleccionado</span>}
                      </button>
                    )
                  })}
                  {filteredStudents.length > 12 && (
                    <div className="px-3 py-1.5 text-[10px] text-gray-400 border-t border-gray-100">
                      Mostrando 12 de {filteredStudents.length}. Tipeá para afinar.
                    </div>
                  )}
                </div>
              )}
              {filteredStudents.length === 0 && searchTerm && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs text-gray-500 text-center">
                  No hay alumnos que coincidan con "{searchTerm}".
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Encabezado de días ───────────────────────────────── */}
      <div className="grid grid-cols-7 gap-1 text-[10px] text-gray-400 font-medium uppercase">
        {[1, 2, 3, 4, 5, 6, 0].map(d => (
          <div key={d} className="text-center">{DAYS_OF_WEEK[d].short}</div>
        ))}
      </div>

      {/* ── Grid del calendario ──────────────────────────────── */}
      <div className="grid grid-cols-7 gap-1">
        {weeks.flat().map(day => {
          const ymd = toYMD(day)
          const inMonth = day.getMonth() === monthAnchor.getMonth()
          const isToday = sameYMD(day, today)
          const isOpen = openDay === ymd
          const events = eventsByDate.get(ymd) || []

          return (
            <DayCell
              key={ymd}
              day={day}
              ymd={ymd}
              inMonth={inMonth}
              isToday={isToday}
              isOpen={isOpen}
              events={events}
              mode={mode}
              today={today}
              perStudentDays={perStudentDays}
              selectedIds={selectedIds}
              studentColors={studentColors}
              onClick={() => setOpenDay(prev => prev === ymd ? null : ymd)}
            />
          )
        })}
      </div>

      {/* ── Hint para modo agregado (educar al coach sobre el filtro) ── */}
      {mode === 'aggregate' && students.length > 0 && !loading && (
        <p className="text-[11px] text-gray-500 leading-snug">
          Seleccioná un alumno para ver sus días de entrenamiento.
        </p>
      )}

      {/* ── Panel de detalle del día abierto ──────────────────── */}
      {openDay && (
        <DayDetail
          ymd={openDay}
          events={eventsByDate.get(openDay) || []}
          mode={mode}
          selectedStudents={selectedStudents}
          studentColors={studentColors}
          perStudentDays={perStudentDays}
          today={today}
          onClose={() => setOpenDay(null)}
        />
      )}

      {/* ── Empty state cuando no hay nada que mostrar ─────────── */}
      {loading ? (
        <p className="text-xs text-gray-400 text-center py-2">Cargando…</p>
      ) : eventsByDate.size === 0 && mode === 'aggregate' && (
        <div className="text-center py-3 text-gray-400">
          <CalendarDays size={20} className="mx-auto mb-1 opacity-60" />
          <p className="text-xs">Sin eventos este mes</p>
        </div>
      )}

      {/* ── Leyenda según el modo ─────────────────────────────── */}
      <Legend
        mode={mode}
        eventsByDate={eventsByDate}
        presentIndividualStatuses={presentIndividualStatuses}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// DayCell
// ─────────────────────────────────────────────────────────────
function DayCell({
  day, ymd, inMonth, isToday, isOpen, events, mode,
  today, perStudentDays, selectedIds, studentColors, onClick,
}) {
  // Estado del día por modo
  let bgClass = 'bg-white hover:bg-gray-50'
  let textClass = inMonth ? 'text-gray-900' : 'text-gray-300'
  let leftRingClass = ''

  // En modo individual coloreamos el fondo según el estado de entrenamiento
  if (mode === 'individual' && inMonth) {
    const sid = selectedIds[0]
    const data = perStudentDays.get(sid)
    if (data) {
      const status = computeStudentDayStatus(ymd, data.expected, data.completed, today, {
        scheduleMode: data.scheduleMode,
        flexibleOverflowSet: data.flexibleOverflow,
      })
      const style = STUDENT_DAY_STYLE[status]
      if (status === 'planned_done')   bgClass = 'bg-emerald-50 hover:bg-emerald-100'
      else if (status === 'planned_missed') bgClass = 'bg-rose-50 hover:bg-rose-100'
      else if (status === 'planned_future') bgClass = 'bg-slate-50 hover:bg-slate-100'
      else if (status === 'unplanned_done') bgClass = 'bg-blue-50 hover:bg-blue-100'
      // Marca a la izquierda con el color del status (refuerzo visual).
      if (status !== 'rest') {
        leftRingClass = `${style.dotClass}`
      }
    }
  }

  return (
    <button
      onClick={onClick}
      className={[
        'relative aspect-square min-h-[44px] sm:min-h-[56px] p-1 rounded-lg border text-left transition-all overflow-hidden',
        bgClass,
        isOpen ? 'border-primary-400 ring-2 ring-primary-200' : 'border-gray-100',
        !inMonth ? 'opacity-50' : '',
      ].join(' ')}
    >
      {/* Banda izquierda (modo individual) */}
      {leftRingClass && (
        <span className={`absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full ${leftRingClass}`} />
      )}

      {/* Número del día (con resaltado de hoy) */}
      <div className="flex items-start justify-between">
        <span className={[
          'text-[11px] sm:text-xs font-semibold leading-none',
          textClass,
          isToday ? 'bg-primary-600 text-white rounded-full w-5 h-5 flex items-center justify-center' : '',
        ].join(' ')}>
          {day.getDate()}
        </span>

        {/* Modo individual: ícono de status arriba a la derecha */}
        {mode === 'individual' && inMonth && (() => {
          const sid = selectedIds[0]
          const data = perStudentDays.get(sid)
          if (!data) return null
          const status = computeStudentDayStatus(ymd, data.expected, data.completed, today, {
            scheduleMode: data.scheduleMode,
            flexibleOverflowSet: data.flexibleOverflow,
          })
          if (status === 'rest') return null
          const style = STUDENT_DAY_STYLE[status]
          return (
            <span className={`text-[10px] leading-none font-bold ${
              status === 'planned_done' ? 'text-emerald-700' :
              status === 'planned_missed' ? 'text-rose-700' :
              status === 'unplanned_done' ? 'text-blue-700' : 'text-slate-500'
            }`}>
              {style.icon}
            </span>
          )
        })()}
      </div>

      {/* Comparación: dots por alumno que entrenó */}
      {mode === 'comparison' && inMonth && (
        <div className="absolute bottom-1 left-1 right-1 flex gap-0.5 flex-wrap">
          {selectedIds.map(sid => {
            const data = perStudentDays.get(sid)
            const trained = data?.completed?.has(ymd)
            if (!trained) return null
            const c = studentColors.get(sid)
            return <span key={sid} className={`w-1.5 h-1.5 rounded-full ${c?.dotClass || 'bg-gray-400'}`} />
          })}
        </div>
      )}

      {/* Eventos del coach: dots a la derecha del número o abajo */}
      {events.length > 0 && (
        <div className={`absolute ${mode === 'comparison' ? 'top-5' : 'bottom-1'} left-1 right-1 flex gap-0.5 flex-wrap`}>
          {events.slice(0, 4).map((ev, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${COACH_EVENT_KIND[ev.type]?.dotClass || 'bg-gray-300'}`}
              title={ev.title}
            />
          ))}
          {events.length > 4 && (
            <span className="text-[8px] text-gray-400 leading-none">+{events.length - 4}</span>
          )}
        </div>
      )}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────
// DayDetail
// ─────────────────────────────────────────────────────────────
function DayDetail({
  ymd, events, mode, selectedStudents, studentColors, perStudentDays, today, onClose,
}) {
  const date = (() => {
    const [y, m, d] = ymd.split('-').map(Number)
    return new Date(y, m - 1, d)
  })()
  const fmt = format(date, "EEEE d 'de' LLLL", { locale: es })

  // Agrupar eventos por tipo para legibilidad
  const grouped = events.reduce((acc, ev) => {
    if (!acc[ev.type]) acc[ev.type] = []
    acc[ev.type].push(ev)
    return acc
  }, {})

  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50">
      <div className="flex items-start justify-between">
        <p className="text-sm font-semibold text-gray-900 capitalize">{fmt}</p>
        <button
          onClick={onClose}
          className="p-0.5 text-gray-400 hover:text-gray-600"
          aria-label="Cerrar detalle"
        >
          <X size={14} />
        </button>
      </div>

      {/* Eventos del coach */}
      {Object.entries(grouped).length > 0 && (
        <div className="space-y-1.5">
          {Object.entries(grouped).map(([type, arr]) => {
            const cfg = COACH_EVENT_KIND[type]
            return (
              <div key={type} className="flex items-start gap-2">
                <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${cfg?.dotClass || 'bg-gray-300'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-[11px] font-medium uppercase tracking-wide ${cfg?.textClass || 'text-gray-500'}`}>
                    {cfg?.label || type}
                  </p>
                  <ul className="text-xs text-gray-700 mt-0.5 space-y-0.5">
                    {arr.map((ev, i) => (
                      <li key={i} className="truncate">
                        {ev.studentName ? <span className="font-medium">{ev.studentName}</span> : null}
                        {ev.studentName && ev.planTitle ? <span className="text-gray-500"> · {ev.planTitle}</span> : null}
                        {!ev.studentName ? ev.title : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Estado por alumno (modos individual / comparación) */}
      {mode !== 'aggregate' && selectedStudents.length > 0 && (
        <div className="border-t border-gray-200 pt-2 space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Entrenamiento del día
          </p>
          {selectedStudents.map(s => {
            const data = perStudentDays.get(s.id)
            const status = data
              ? computeStudentDayStatus(ymd, data.expected, data.completed, today, {
                  scheduleMode: data.scheduleMode,
                  flexibleOverflowSet: data.flexibleOverflow,
                })
              : 'rest'
            const style = STUDENT_DAY_STYLE[status]
            const color = studentColors.get(s.id)
            return (
              <div key={s.id} className="flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color?.dotClass || 'bg-gray-300'}`} />
                <span className="font-medium text-gray-700 truncate">{s.name}</span>
                <span className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded ${
                  status === 'planned_done' ? 'bg-emerald-100 text-emerald-700' :
                  status === 'planned_missed' ? 'bg-rose-100 text-rose-700' :
                  status === 'planned_future' ? 'bg-slate-100 text-slate-600' :
                  status === 'unplanned_done' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-400'
                }`}>
                  {style.label}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {events.length === 0 && (mode === 'aggregate' || selectedStudents.length === 0) && (
        <p className="text-xs text-gray-400 text-center py-2">Sin eventos en este día</p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Legend
// ─────────────────────────────────────────────────────────────
function Legend({ mode, eventsByDate, presentIndividualStatuses }) {
  // Solo mostramos los tipos de evento PRESENTES en el mes para no
  // ensuciar de más en meses tranquilos.
  const presentTypes = useMemo(() => {
    const set = new Set()
    for (const arr of eventsByDate.values()) {
      for (const ev of arr) set.add(ev.type)
    }
    return [...set]
  }, [eventsByDate])

  // En modo individual mostramos sólo los chips de status que
  // efectivamente aparecen este mes. Esto evita mostrar "No asistió"
  // a alumnos en modo flexible (donde el status no aplica) y "Día
  // extra" cuando no hay ninguno.
  const showCumplido    = mode === 'individual' && presentIndividualStatuses?.has('planned_done')
  const showNoAsistio   = mode === 'individual' && presentIndividualStatuses?.has('planned_missed')
  const showDiaExtra    = mode === 'individual' && presentIndividualStatuses?.has('unplanned_done')
  const showProximo     = mode === 'individual' && presentIndividualStatuses?.has('planned_future')

  const hasIndividualChips = showCumplido || showNoAsistio || showDiaExtra || showProximo

  if (presentTypes.length === 0 && !hasIndividualChips) return null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] text-gray-500 pt-1 border-t border-gray-100">
      {presentTypes.map(type => {
        const cfg = COACH_EVENT_KIND[type]
        if (!cfg) return null
        return (
          <span key={type} className="inline-flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass}`} />
            {cfg.label}
          </span>
        )
      })}
      {showCumplido && (
        <span className="inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Cumplido
        </span>
      )}
      {showNoAsistio && (
        <span className="inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> No asistió
        </span>
      )}
      {showProximo && (
        <span className="inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> Próximo
        </span>
      )}
      {showDiaExtra && (
        <span className="inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> Día extra
        </span>
      )}
    </div>
  )
}
