// ============================================================
// chatModel.js — lógica pura del Chat (v75)
// ------------------------------------------------------------
// El chat coach↔persona se arma con:
//   - las notas del hilo (note_threads/notes) que NO son copias;
//   - los eventos (chat_events: día, semana, plan, marca, "no sabía");
//   - las copias guardadas desde un mensaje (notes.source_note_id), que no
//     se muestran como mensajes sino como etiquetas debajo del original.
// Sin React ni Supabase: lo usan las pantallas y los tests.
// ============================================================

export const QUESTION_VARIANTS = 6

/** Qué tipo de vinculación es una copia. */
export function linkKindOf(copy) {
  if (!copy) return null
  if (copy.visibility === 'coach_private') return 'private'
  if (copy.context_type === 'exercise') return 'exercise'
  if (copy.context_type === 'plan_exercise') return 'plan_exercise'
  if (copy.context_type === 'plan') return 'plan_day'
  return null
}

const LINK_ORDER = { plan_exercise: 0, plan_day: 1, exercise: 2, private: 3 }

/**
 * Arma la línea de tiempo ascendente.
 * @param {object} p
 * @param {Array} p.notes   notas del hilo (pueden venir copias mezcladas)
 * @param {Array} p.events  chat_events
 * @returns {Array<{type:'note'|'event', id, at, note?, event?, links: Array}>}
 */
export function buildTimeline({ notes = [], events = [] } = {}) {
  const live = notes.filter((n) => n && !n.deleted_at)
  const copiesBySource = new Map()
  for (const n of live) {
    if (!n.source_note_id) continue
    const list = copiesBySource.get(n.source_note_id) || []
    list.push(n)
    copiesBySource.set(n.source_note_id, list)
  }
  const items = []
  for (const n of live) {
    if (n.source_note_id) continue
    const links = (copiesBySource.get(n.id) || [])
      .slice()
      .sort((a, b) => (LINK_ORDER[linkKindOf(a)] ?? 9) - (LINK_ORDER[linkKindOf(b)] ?? 9))
    items.push({ type: 'note', id: n.id, at: n.created_at, note: n, links })
  }
  for (const e of events) {
    if (!e) continue
    items.push({ type: 'event', id: e.id, at: e.occurred_at || e.created_at, event: e, links: [] })
  }
  items.sort((a, b) => {
    const ta = Date.parse(a.at) || 0
    const tb = Date.parse(b.at) || 0
    if (ta !== tb) return ta - tb
    return String(a.id).localeCompare(String(b.id))
  })
  return items
}

/**
 * Filtra la línea de tiempo.
 * mode: 'all' | 'messages' | 'events' | 'plan' | 'private'
 * En 'private' devuelve las notas privadas escritas como tales y las copias
 * privadas (estas últimas se muestran como nota suelta, con su origen).
 */
export function filterTimeline(items, mode = 'all', { notes = [] } = {}) {
  if (mode === 'events') return items.filter((it) => it.type === 'event')
  if (mode === 'messages') {
    return items.filter((it) => it.type === 'note' && it.note.visibility !== 'coach_private')
  }
  if (mode === 'plan') {
    return items.filter(
      (it) => it.type === 'note' && it.links.some((l) => linkKindOf(l) !== 'private')
    )
  }
  if (mode === 'private') {
    const direct = items.filter(
      (it) => it.type === 'note' && it.note.visibility === 'coach_private'
    )
    const copies = notes
      .filter((n) => n && !n.deleted_at && n.source_note_id && n.visibility === 'coach_private')
      .map((n) => ({
        type: 'note',
        id: n.id,
        at: n.created_at,
        note: n,
        links: [],
        fromCopy: true,
      }))
    return [...direct, ...copies].sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0))
  }
  return items
}

/** Cuenta privadas (directas + copias) para el chip del filtro. */
export function countPrivate(notes = []) {
  return notes.filter((n) => n && !n.deleted_at && n.visibility === 'coach_private').length
}

/** 'day_b' → 'B' (null si no es un día). */
export function dayLetter(section) {
  const m = /^day_([a-z])$/i.exec(section || '')
  return m ? m[1].toUpperCase() : null
}

/** Fecha local YYYY-MM-DD de un timestamp o Date. */
export function localDateKey(value) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(dateKey, n) {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

/** Lunes de una semana ISO 'IYYY-Www'. */
export function isoWeekMonday(periodKey) {
  const m = /^(\d{4})-W(\d{2})$/.exec(periodKey || '')
  if (!m) return null
  const year = Number(m[1])
  const week = Number(m[2])
  // El 4 de enero siempre cae en la semana 1.
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const dow = jan4.getUTCDay() || 7
  const monday = new Date(jan4)
  monday.setUTCDate(jan4.getUTCDate() - dow + 1 + (week - 1) * 7)
  return monday.toISOString().slice(0, 10)
}

/** Lunes de la semana de un evento de semana completa. */
export function weekStartOfEvent(event) {
  const p = event?.payload || {}
  if (typeof p.week_start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.week_start)) {
    return p.week_start
  }
  return isoWeekMonday(p.period_key)
}

export const WELLBEING_KEYS = [
  'sleep_quality',
  'energy_level',
  'nutrition_quality',
  'hydration_quality',
  'stress_level',
  'muscle_fatigue',
]
const NEGATIVE = new Set(['stress_level', 'muscle_fatigue'])

function avgOf(logs, key) {
  const vals = logs.map((l) => Number(l?.[key])).filter((v) => Number.isFinite(v) && v > 0)
  if (!vals.length) return null
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
}

/**
 * Promedios de bienestar de la semana que empieza en weekStart, comparados
 * con la semana anterior.
 * @returns {{count:number, metrics:Array<{key, value, delta, better}>}|null}
 *   better: true si el cambio es bueno (en estrés y fatiga, bajar es bueno).
 */
export function weeklyWellbeing(logs = [], weekStart) {
  if (!weekStart) return null
  const end = addDays(weekStart, 7)
  const prevStart = addDays(weekStart, -7)
  const cur = logs.filter((l) => l?.date >= weekStart && l.date < end)
  if (!cur.length) return null
  const prev = logs.filter((l) => l?.date >= prevStart && l.date < weekStart)
  const metrics = []
  for (const key of WELLBEING_KEYS) {
    const value = avgOf(cur, key)
    if (value == null) continue
    const before = avgOf(prev, key)
    const delta = before == null ? null : Math.round((value - before) * 10) / 10
    let better = null
    if (delta != null && delta !== 0) better = NEGATIVE.has(key) ? delta < 0 : delta > 0
    metrics.push({ key, value, delta, better })
  }
  return { count: cur.length, metrics }
}

/** Rango de fechas de bienestar que hace falta para los eventos de semana. */
export function wellbeingRangeFor(events = []) {
  const starts = events
    .filter((e) => e?.kind === 'week_complete')
    .map(weekStartOfEvent)
    .filter(Boolean)
    .sort()
  if (!starts.length) return null
  return { from: addDays(starts[0], -7), to: addDays(starts[starts.length - 1], 6) }
}

export function weekQuestionKey(event) {
  const v = Number(event?.payload?.variant)
  const idx = Number.isFinite(v) ? Math.abs(Math.trunc(v)) % QUESTION_VARIANTS : 0
  return `chat.weekQuestion.v${idx}`
}

// ── Detección de ejercicios en el texto ──────────────────────

/** minúsculas, sin acentos, solo letras/números separados por un espacio */
export function normalizeText(s) {
  return ` ${String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim()} `
}

const STOP = new Set([
  'con',
  'de',
  'del',
  'en',
  'la',
  'el',
  'a',
  'al',
  'y',
  'the',
  'with',
  'on',
  'of',
])

function sigTokens(norm) {
  return norm
    .trim()
    .split(' ')
    .filter((t) => t.length >= 3 && !STOP.has(t))
}

/**
 * Prepara el catálogo una vez: [{ id, name, norm, tokens }].
 * Acepta name_en además de name (ejercicios bilingües).
 */
export function prepareCatalog(exercises = []) {
  const out = []
  for (const ex of exercises) {
    if (!ex?.id) continue
    for (const name of [ex.name, ex.name_en]) {
      if (!name) continue
      const norm = normalizeText(name)
      if (norm.trim().length < 4) continue
      out.push({ id: ex.id, name: ex.name || name, norm, tokens: sigTokens(norm) })
    }
  }
  return out
}

/**
 * Busca ejercicios del catálogo nombrados en el texto.
 * Coincidencia por nombre completo (sin acentos ni mayúsculas, palabras
 * enteras). Gana el nombre más largo.
 * @returns {{ match: {id,name}|null, alternatives: Array<{id,name}> }}
 */
export function detectExercise(text, prepared = [], { maxAlternatives = 3 } = {}) {
  const norm = normalizeText(text)
  if (norm.trim().length < 4) return { match: null, alternatives: [] }
  const hits = prepared.filter((c) => norm.includes(c.norm))
  if (!hits.length) return { match: null, alternatives: [] }
  hits.sort((a, b) => b.norm.length - a.norm.length)
  const best = hits[0]
  const seen = new Set([best.id])
  const alternatives = []
  // Otros nombres del texto que no son parte del elegido
  for (const h of hits.slice(1)) {
    if (seen.has(h.id) || best.norm.includes(h.norm)) continue
    seen.add(h.id)
    alternatives.push({ id: h.id, name: h.name })
  }
  // Variantes del mismo movimiento (comparten las dos primeras palabras)
  const head = best.tokens.slice(0, 2).join(' ')
  if (head.split(' ').length === 2) {
    for (const c of prepared) {
      if (alternatives.length >= maxAlternatives) break
      if (seen.has(c.id)) continue
      if (c.tokens.slice(0, 2).join(' ') === head) {
        seen.add(c.id)
        alternatives.push({ id: c.id, name: c.name })
      }
    }
  }
  return {
    match: { id: best.id, name: best.name },
    alternatives: alternatives.slice(0, maxAlternatives),
  }
}

/** Busca en el catálogo por texto libre (para el buscador del selector). */
export function searchCatalog(query, prepared = [], limit = 8) {
  const q = normalizeText(query).trim()
  if (!q) return []
  const words = q.split(' ')
  const seen = new Set()
  const out = []
  for (const c of prepared) {
    if (seen.has(c.id)) continue
    if (words.every((w) => c.norm.includes(` ${w}`) || c.norm.includes(w))) {
      seen.add(c.id)
      out.push({ id: c.id, name: c.name })
      if (out.length >= limit) break
    }
  }
  return out
}

// ── Lista de conversaciones ──────────────────────────────────

/** Ordena hilos por última novedad (más reciente primero). */
export function sortThreads(threads = []) {
  return threads.slice().sort((a, b) => {
    const ta = Date.parse(a.last_message_at || a.created_at) || 0
    const tb = Date.parse(b.last_message_at || b.created_at) || 0
    return tb - ta
  })
}

/**
 * Último elemento visible de cada hilo para la vista previa de la lista.
 * Recibe notas (sin copias, sin privadas) y eventos de varios hilos.
 */
export function lastItemByThread({ notes = [], events = [] } = {}) {
  const map = new Map()
  const consider = (threadId, item) => {
    const prev = map.get(threadId)
    if (!prev || (Date.parse(item.at) || 0) > (Date.parse(prev.at) || 0)) map.set(threadId, item)
  }
  for (const n of notes) {
    if (!n || n.deleted_at || n.source_note_id || n.visibility === 'coach_private') continue
    consider(n.thread_id, { type: 'note', at: n.created_at, note: n })
  }
  for (const e of events) {
    if (!e) continue
    consider(e.thread_id, { type: 'event', at: e.occurred_at || e.created_at, event: e })
  }
  return map
}

// ── A qué va el próximo mensaje / pendientes ────────────────

export const PENDING_DAYS = 14
export const PRESELECT_HOURS = 48
const ASSOCIATED = new Set([
  'workout_log',
  'workout_block_log',
  'exercise',
  'plan_exercise',
  'plan',
  'evaluation_test',
  'evaluation_result',
])

function liveConversation(notes) {
  return notes
    .filter((n) => n && !n.deleted_at && !n.source_note_id && n.visibility !== 'coach_private')
    .sort((a, b) => (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0))
}

/**
 * ¿Ya tuvo respuesta del otro lado? Cuenta como respondido si hay, después,
 * una nota del otro lado que lo cita (parent_note_id) o que habla del mismo
 * registro/ejercicio (mismo context_type + context_id): la coach muchas
 * veces contesta desde Entrenar o desde la tabla de progreso, sin "Responder".
 */
export function isAnswered(note, notes) {
  const t = Date.parse(note.created_at) || 0
  return notes.some(
    (n) =>
      n &&
      n.id !== note.id &&
      !n.deleted_at &&
      !n.source_note_id &&
      n.author_role !== note.author_role &&
      (Date.parse(n.created_at) || 0) > t &&
      (n.parent_note_id === note.id ||
        (note.context_type !== 'free' &&
          n.context_type === note.context_type &&
          n.context_id === note.context_id))
  )
}

/**
 * Comentarios asociados del OTRO lado, sin responder, de los últimos 14 días,
 * más nuevos primero. Los marcados "Listo" (reply_dismissed_at) no cuentan.
 */
export function pendingFor(
  notes = [],
  viewerRole,
  { now = Date.now(), days = PENDING_DAYS, limit } = {}
) {
  const live = liveConversation(notes)
  const since = now - days * 86400000
  const out = live
    .filter(
      (n) =>
        n.author_role !== viewerRole &&
        ASSOCIATED.has(n.context_type) &&
        !n.reply_dismissed_at &&
        (Date.parse(n.created_at) || 0) >= since &&
        !isAnswered(n, live)
    )
    .reverse()
  return limit ? out.slice(0, limit) : out
}

/**
 * Respuesta que viene marcada sola (solo la coach): el comentario pendiente
 * tiene que ser lo último que pasó en la conversación y tener menos de 48 h.
 * Asociar al lugar equivocado es peor que dejarlo suelto.
 */
export function preselectTarget(notes = [], viewerRole, { now = Date.now() } = {}) {
  if (viewerRole !== 'coach') return null
  const live = liveConversation(notes)
  const last = live[live.length - 1]
  if (!last || last.author_role === viewerRole) return null
  if (now - (Date.parse(last.created_at) || 0) > PRESELECT_HOURS * 3600000) return null
  return pendingFor(live, viewerRole, { now }).some((p) => p.id === last.id) ? last : null
}
