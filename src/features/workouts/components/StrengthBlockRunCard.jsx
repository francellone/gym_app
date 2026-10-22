import { useState, useEffect, useRef } from 'react'
import { readExpanded, writeExpanded } from '../workoutViewState'
import { useTranslation } from 'react-i18next'
import {
  CheckCircle2,
  Circle,
  ChevronUp,
  ChevronDown,
  Info,
  Link2,
  MinusCircle,
  Timer,
} from 'lucide-react'
import ExerciseCard from './ExerciseCard'
import { onLogEditRequest, requestLogEdit } from '@/features/milestones/editRequest'
import { groupStrengthExercises, blockResolution } from '../helpers'
import { isLogDone, isLogResolved, isLogSkipped } from '../completionRules'
import {
  allResolved,
  firstPending,
  nextPendingAfter,
  onBlockOpenRequest,
  requestBlockOpen,
  scrollIntoViewSoon,
} from '../guidedFlow'

// ============================================================
// Bloque STRENGTH colapsable (wrapper con header rico)
// ============================================================
// Card colapsable que agrupa los ejercicios de un bloque de fuerza.
// Header muestra título + progreso (X/Y hechos + %); body es la lista
// de ExerciseCard. Los bloques aerobic y circuit tienen sus propios
// run cards (AerobicBlockRunCard, CircuitBlockRunCard).
export default function StrengthBlockRunCard({
  block,
  strengthIndexInSection,
  logs,
  saveLog,
  deleteLog,
  // Q1 — preview "Última vez" + chat del ejercicio
  lastLogByExercise,
  previewNoteByExercise,
  noteCountByExercise,
  onOpenChat,
  // F4 — passthrough para draft local en ExerciseCard
  studentId = null,
  loggedDate = null,
  // doc 48 — último cambio de objetivo del coach por plan_exercise.id
  prescriptionByEx = {},
  // %RM (v39) — mapa de 1RM de la persona, para derivar los kilos
  oneRmMap = null,
  coachMode = false,
  // Etapa 4 celebraciones — máximo previo por exercise_id (aviso al cargar)
  bestRefByExercise = null,
  // Bloque guiado: id del bloque que sigue en el día (null si es el último).
  nextBlockId = null,
}) {
  const { t } = useTranslation()
  const rootRef = useRef(null)
  const [expanded, setExpanded] = useState(() => readExpanded({ blockId: block.id, loggedDate }))
  // Bloque guiado: qué tarjeta abrir. `seq` sube en cada pedido para que la
  // misma tarjeta pueda volver a abrirse.
  const [openReq, setOpenReq] = useState({ id: null, seq: 0 })
  // Solución 1 (2026-10-19): un grupo (A1/A2/…) con todo resuelto se muestra
  // como una fila de resumen. Acá van los grupos resueltos que la persona
  // abrió a mano para ver o corregir. No se persiste: al corregir un dato el
  // grupo se vuelve a cerrar, y al reabrir la app arranca cerrado (decisión
  // de Franco).
  const [openGroups, setOpenGroups] = useState(() => new Set())

  const exercises = (block.plan_exercises || [])
    .slice()
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
  // Agrupar supersets (A1/A2/…) para mostrar la pausa a nivel grupo.
  const items = groupStrengthExercises(exercises)
  const groupKeyOf = (id) => {
    for (const [idx, item] of items.entries()) {
      if (item.type === 'group' && item.exercises.some((ex) => ex.id === id)) {
        return `${item.letter}-${idx}`
      }
    }
    return null
  }
  const groupIsResolved = (item) => item.exercises.every((ex) => isLogResolved(logs?.[ex.id]))
  const closeGroup = (key) =>
    setOpenGroups((prev) => {
      if (!key || !prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  const openGroup = (key) =>
    setOpenGroups((prev) => (prev.has(key) ? prev : new Set(prev).add(key)))

  // Etapa 4: si piden corregir un ejercicio de este bloque y está cerrado,
  // se abre y se re-emite el pedido para que la tarjeta (recién montada) lo
  // tome. Si ya está abierto, la tarjeta lo atiende sola.
  useEffect(
    () =>
      onLogEditRequest((id) => {
        if (!(block.plan_exercises || []).some((ex) => ex.id === id)) return
        // Si el ejercicio está dentro de un grupo resumido, también se abre
        // el grupo (si no, la tarjeta no está montada para atender el pedido).
        const key = groupKeyOf(id)
        const idx = key ? Number(key.split('-').pop()) : -1
        const hiddenInGroup = key && !openGroups.has(key) && groupIsResolved(items[idx])
        if (expanded && !hiddenInGroup) return
        setExpanded(true)
        if (hiddenInGroup) openGroup(key)
        setTimeout(() => requestLogEdit(id), 60)
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expanded, block.plan_exercises, openGroups, logs]
  )

  // Persistir/restaurar si el bloque quedó desplegado, para volver al mismo
  // lugar tras la recarga en frío al reabrir la app (scope por bloque + día).
  useEffect(() => {
    writeExpanded({ blockId: block.id, loggedDate, expanded })
  }, [block.id, loggedDate, expanded])

  const orderedIds = exercises.map((ex) => ex.id)
  const resolvedIds = () => new Set(orderedIds.filter((id) => isLogResolved(logs?.[id])))

  // Bloque guiado: la persona resolvió un ejercicio que estaba pendiente →
  // se abre el siguiente de abajo; si el bloque quedó completo, se pliega y
  // se abre el bloque que sigue.
  function handleResolved(id, { wasResolved } = {}) {
    // Corregir (o resolver) un ejercicio de un grupo abierto a mano lo vuelve
    // a cerrar en su fila de resumen.
    closeGroup(groupKeyOf(id))
    if (wasResolved) return
    const done = resolvedIds()
    done.add(id)
    const next = nextPendingAfter(orderedIds, done, id)
    if (next) {
      setOpenReq((r) => ({ id: next, seq: r.seq + 1 }))
      return
    }
    if (allResolved(orderedIds, done)) {
      setExpanded(false)
      if (nextBlockId) setTimeout(() => requestBlockOpen(nextBlockId), 150)
    }
  }

  // Otro bloque terminó y pide abrir este: se despliega con su primer
  // pendiente abierto (la tarjeta se trae sola a la vista).
  useEffect(
    () =>
      onBlockOpenRequest((id) => {
        if (id !== block.id) return
        setExpanded(true)
        const first = firstPending(
          (block.plan_exercises || [])
            .slice()
            .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
            .map((ex) => ex.id),
          new Set(
            (block.plan_exercises || []).map((ex) => ex.id).filter((x) => isLogResolved(logs?.[x]))
          )
        )
        if (first) setOpenReq((r) => ({ id: first, seq: r.seq + 1 }))
        else scrollIntoViewSoon(() => rootRef.current)
      }),
    [block.id, block.plan_exercises, logs]
  )

  const total = exercises.length
  // v54: hechos / omitidos con la regla única (un omitido no es un hecho).
  const resolution = blockResolution(block, logs, {})
  const done = resolution.done
  const skipped = resolution.skipped
  const completed = total > 0 && done === total

  // Título del bloque:
  //   - Si el coach le puso título, ese.
  //   - Si hay varios strength en la sección, "Fuerza A/B/C…" (letras).
  //   - Si es el único strength de la sección, simplemente "Fuerza".
  // (El nombre de la sección "Activación" / "Principal Día A" lo da el h2 de arriba.)
  function titleFor() {
    if (block.title) return block.title
    if (strengthIndexInSection > 0) {
      const letter =
        ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'][strengthIndexInSection] ||
        strengthIndexInSection + 1
      return t('workout.strengthLetter', { letter })
    }
    return t('workout.strength')
  }

  const title = titleFor()

  // Render de un ExerciseCard. `restScope`:
  //   'group' → no muestra la pausa por ejercicio (la muestra el pie del grupo)
  //   'set'   → muestra la pausa como "entre series" (ejercicio suelto)
  function renderCard(ex, restScope) {
    return (
      <ExerciseCard
        key={ex.id}
        planEx={ex}
        log={logs[ex.id]}
        onSaveLog={saveLog}
        onDeleteLog={deleteLog}
        suggestedSets={ex.suggested_sets}
        restScope={restScope}
        // Q1 — preview "Última vez" + chat del ejercicio
        lastLog={lastLogByExercise?.get?.(ex.exercise_id) || null}
        previewNote={previewNoteByExercise?.get?.(ex.exercise_id) || null}
        noteCount={noteCountByExercise?.get?.(ex.exercise_id) || 0}
        onOpenChat={onOpenChat}
        // F4 — draft local
        studentId={studentId}
        loggedDate={loggedDate}
        // doc 48 — cambio de objetivo del coach para este ejercicio
        prescriptionChange={prescriptionByEx?.[ex.id] || null}
        // %RM — kilos derivados del máximo de la persona
        oneRmMap={oneRmMap}
        coachMode={coachMode}
        bestReference={bestRefByExercise?.get?.(ex.exercise_id) ?? null}
        openSignal={openReq.id === ex.id ? openReq.seq : 0}
        onResolved={handleResolved}
        dense
      />
    )
  }

  return (
    <div
      ref={rootRef}
      className={`scroll-mt-20 rounded-2xl border transition-all overflow-hidden ${
        completed ? 'border-green-200 bg-white' : 'border-linea bg-white'
      }`}
    >
      {/* Header colapsable */}
      <button
        type="button"
        onClick={() => {
          const opening = !expanded
          setExpanded(opening)
          // Bloque guiado: al abrirlo, el primer pendiente ya viene abierto.
          if (opening) {
            const first = firstPending(orderedIds, resolvedIds())
            if (first) setOpenReq((r) => ({ id: first, seq: r.seq + 1 }))
          }
        }}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <div className="flex-shrink-0">
          {completed ? (
            <CheckCircle2 size={24} className="text-green-500" />
          ) : (
            <Circle size={24} className="text-gray-300" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base">💪</span>
            <p
              className={`font-semibold text-sm break-words ${completed ? 'text-green-800' : 'text-gray-900'}`}
            >
              {title}
            </p>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {t('workout.doneOfTotal', { done, total })}
            {total > 0 && (
              <span className="ml-2 text-gray-400">· {Math.round((done / total) * 100)}%</span>
            )}
            {skipped > 0 && (
              <span className="ml-2 text-amber-600">
                · {t('workout.skippedCount', { count: skipped })}
              </span>
            )}
          </p>
        </div>
        {/* Mini progress bar */}
        {total > 0 && !expanded && (
          <div className="hidden sm:block w-14 h-1.5 bg-gray-200 rounded-full overflow-hidden flex-shrink-0">
            <div
              className={`h-full ${completed ? 'bg-green-600' : 'bg-durazno-300'} transition-all`}
              style={{ width: `${(done / total) * 100}%` }}
            />
          </div>
        )}
        {expanded ? (
          <ChevronUp size={18} className="text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronDown size={18} className="text-gray-400 flex-shrink-0" />
        )}
      </button>

      {/* Body: lista de ejercicios (agrupando supersets A1/A2/…) */}
      {expanded && (
        <div className="border-t border-gray-100 p-3 space-y-2 bg-gray-50/50">
          {/* 2026-10-22: la nota del bloque se escribía en el armador pero en
              fuerza no se mostraba (aeróbico y circuito sí). */}
          {block.notes && (
            <div className="bg-durazno-50 rounded-xl p-3 flex gap-2">
              <Info size={15} className="text-primary-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-tinta leading-relaxed whitespace-pre-wrap break-words">
                {block.notes}
              </p>
            </div>
          )}
          {exercises.length === 0 && (
            <p className="text-xs text-gray-400 italic text-center py-3">
              {t('workout.blockNoExercises')}
            </p>
          )}
          {items.map((item, idx) =>
            item.type === 'group' ? (
              groupIsResolved(item) && !openGroups.has(`${item.letter}-${idx}`) ? (
                <GroupSummaryRow
                  key={`grp-${item.letter}-${idx}`}
                  item={item}
                  logs={logs}
                  onOpen={() => openGroup(`${item.letter}-${idx}`)}
                />
              ) : (
                <div
                  key={`grp-${item.letter}-${idx}`}
                  className="rounded-2xl border border-primary-100 bg-primary-50/40 p-2 space-y-2"
                >
                  {groupIsResolved(item) ? (
                    <button
                      type="button"
                      onClick={() => closeGroup(`${item.letter}-${idx}`)}
                      className="w-full flex items-center gap-1.5 px-1 pt-0.5 min-h-8 text-left"
                    >
                      <Link2 size={14} className="text-primary-600 flex-shrink-0" />
                      <span className="flex-1 text-xs font-medium text-primary-700">
                        {t('workout.supersetHeader', { letter: item.letter })}
                      </span>
                      <ChevronUp size={16} className="text-gray-400 flex-shrink-0" />
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 px-1 pt-0.5">
                      <Link2 size={14} className="text-primary-600 flex-shrink-0" />
                      <span className="text-xs font-medium text-primary-700">
                        {t('workout.supersetHeader', { letter: item.letter })}
                      </span>
                    </div>
                  )}
                  {item.exercises.map((ex) => renderCard(ex, 'group'))}
                  {item.restTime && (
                    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl border border-dashed border-primary-200 bg-white">
                      <Timer size={14} className="text-primary-600 flex-shrink-0" />
                      <span className="text-xs text-gray-700">
                        {t('workout.groupRestPrefix')}{' '}
                        <strong className="font-medium">{item.restTime}</strong>{' '}
                        {t('workout.groupRestSuffix')}
                      </span>
                    </div>
                  )}
                </div>
              )
            ) : (
              renderCard(item.exercise, 'set')
            )
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Fila de resumen de un grupo resuelto (Solución 1, 2026-10-19)
// ------------------------------------------------------------
// "✓ Bloque A · 4/4 hechos · PSE 8–9". En ámbar si hubo algo sin hacer.
// Tocarla abre el grupo con sus filas densas para ver o corregir.
// ============================================================
function GroupSummaryRow({ item, logs, onOpen }) {
  const { t } = useTranslation()
  const total = item.exercises.length
  const done = item.exercises.filter((ex) => isLogDone(logs?.[ex.id])).length
  const skipped = item.exercises.filter(
    (ex) => isLogSkipped(logs?.[ex.id]) && !isLogDone(logs?.[ex.id])
  ).length
  const pses = item.exercises
    .map((ex) => Number(logs?.[ex.id]?.perceived_difficulty))
    .filter((n) => Number.isFinite(n) && n > 0)
  const pseText =
    pses.length === 0
      ? null
      : Math.min(...pses) === Math.max(...pses)
        ? t('workout.pseValue', { value: pses[0] })
        : t('workout.pseValue', { value: `${Math.min(...pses)}–${Math.max(...pses)}` })
  const partial = skipped > 0
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`scroll-mt-20 w-full flex items-center gap-3 min-h-[52px] px-3 py-2 rounded-2xl border text-left ${
        partial ? 'border-amber-200 bg-amber-50/60' : 'border-green-200 bg-green-50/60'
      }`}
    >
      {partial ? (
        <MinusCircle size={22} className="text-amber-500 flex-shrink-0" />
      ) : (
        <CheckCircle2 size={22} className="text-green-500 flex-shrink-0" />
      )}
      <span className="flex-1 min-w-0">
        <span
          className={`block text-sm font-semibold break-words ${partial ? 'text-amber-800' : 'text-green-800'}`}
        >
          {t('workout.groupSummary', { letter: item.letter, done, total })}
          {partial && ` · ${t('workout.skippedCount', { count: skipped })}`}
        </span>
        <span className="block text-xs text-gray-500 mt-0.5">
          {pseText && `${pseText} · `}
          {t('workout.groupTapToReview')}
        </span>
      </span>
      <span className="flex gap-1 flex-shrink-0" aria-hidden="true">
        {item.exercises.map((ex) => (
          <i
            key={ex.id}
            className={`block w-2 h-2 rounded-full ${
              isLogDone(logs?.[ex.id]) ? 'bg-green-500' : 'bg-amber-400'
            }`}
          />
        ))}
      </span>
      <ChevronDown size={18} className="text-gray-400 flex-shrink-0" />
    </button>
  )
}
