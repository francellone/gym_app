/**
 * NotesFilters
 *
 * Barra de filtros del panel de notas:
 *   - Chips temporales (Hoy / 7d / 30d / Custom)
 *   - Select de ejercicio
 *   - Select de grupo muscular
 *   - Chips de blockType (strength / aerobic / circuit)
 *   - Multi-select de tags (chips agregar/quitar)
 *   - Search por body
 *
 * Estado controlado: el padre maneja `value` y `onChange`.
 *
 * Props:
 *   value          objeto filters (ver lib/notes.js)
 *   onChange       (nextFilters) => void
 *   exercises      Exercise[] del backend (id, name, muscle_group)
 *   availableTags  string[] sugerencias
 */

import { useMemo, useState, useEffect } from 'react'
import { Filter, Search, Tag as TagIcon, X, Calendar } from 'lucide-react'

// ── Helpers de fechas ─────────────────────────────────────────
// Devolvemos ISO strings (created_at en notes es timestamptz).
function isoStartOfDay(daysAgo = 0) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (daysAgo > 0) d.setDate(d.getDate() - daysAgo)
  return d.toISOString()
}
function isoEndOfToday() {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

const TIME_PRESETS = [
  { key: 'today', label: 'Hoy',   from: () => isoStartOfDay(0),  to: () => isoEndOfToday() },
  { key: '7d',    label: '7 días', from: () => isoStartOfDay(7),  to: () => isoEndOfToday() },
  { key: '30d',   label: '30 días',from: () => isoStartOfDay(30), to: () => isoEndOfToday() },
]

const BLOCK_TYPE_PRESETS = [
  { key: 'strength', label: 'Fuerza' },
  { key: 'aerobic',  label: 'Aeróbico' },
  { key: 'circuit',  label: 'Circuito' },
]

// Comparar por YYYY-MM-DD evita drift de milisegundos entre el momento
// del click y el render siguiente. Si el día cambia (cruzar medianoche),
// el preset deja de matchear y se considera "custom".
function dateKey(iso) {
  if (!iso) return ''
  // ISO siempre empieza con YYYY-MM-DD si la fecha es válida.
  return String(iso).slice(0, 10)
}

function detectTimePreset(filters) {
  if (!filters.from && !filters.to) return null
  for (const p of TIME_PRESETS) {
    if (dateKey(filters.from) === dateKey(p.from()) &&
        dateKey(filters.to)   === dateKey(p.to())) {
      return p.key
    }
  }
  return 'custom'
}

export default function NotesFilters({ value = {}, onChange, exercises = [], availableTags = [] }) {
  const [customOpen, setCustomOpen] = useState(false)
  const [tagInput, setTagInput] = useState('')
  // Estado local del preset activo. Se setea explícitamente cuando el
  // usuario clickea un chip, así no dependemos de comparar timestamps
  // exactos contra `value.from/to` (que pueden re-generarse).
  const [activeTimeKey, setActiveTimeKey] = useState(() => detectTimePreset(value))

  // Cuando los filtros temporales se limpian desde afuera, resetear el chip activo.
  useEffect(() => {
    if (!value.from && !value.to && activeTimeKey !== null) {
      setActiveTimeKey(null)
    }
  }, [value.from, value.to, activeTimeKey])

  // Cambios atómicos
  const patch = (next) => onChange?.({ ...value, ...next })

  const activeTime = activeTimeKey ?? detectTimePreset(value)

  // ── Lista de grupos musculares única (a partir de exercises) ──
  const muscleGroups = useMemo(() => {
    const set = new Set()
    for (const ex of exercises) {
      if (ex.muscle_group) set.add(ex.muscle_group)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [exercises])

  // ── Tags actuales / sugerencias filtradas ─────────────────────
  const currentTags = Array.isArray(value.tags) ? value.tags : []
  const tagSuggestions = useMemo(() => {
    const q = tagInput.trim().toLowerCase()
    if (!q) return []
    return availableTags
      .filter(t => !currentTags.includes(t) && t.toLowerCase().includes(q))
      .slice(0, 6)
  }, [tagInput, availableTags, currentTags])

  function applyTimePreset(key) {
    if (key === activeTime) {
      // Toggle off
      setActiveTimeKey(null)
      patch({ from: undefined, to: undefined })
      setCustomOpen(false)
      return
    }
    if (key === 'custom') {
      setActiveTimeKey('custom')
      setCustomOpen(true)
      return
    }
    const preset = TIME_PRESETS.find(p => p.key === key)
    if (!preset) return
    setActiveTimeKey(key)
    patch({ from: preset.from(), to: preset.to() })
    setCustomOpen(false)
  }

  function applyCustomDate(field, dateStr) {
    if (!dateStr) {
      patch({ [field]: undefined })
      return
    }
    // Construir Date desde YYYY-MM-DD en zona local (no UTC midnight)
    // así "Desde 2026-05-09" arranca a las 00:00 locales del coach.
    const d = new Date(`${dateStr}T00:00:00`)
    if (field === 'to') d.setHours(23, 59, 59, 0) // ms a 0 para estabilidad
    setActiveTimeKey('custom')
    patch({ [field]: d.toISOString() })
  }

  function addTag(tag) {
    const t = (tag || '').trim()
    if (!t) return
    if (currentTags.includes(t)) return
    patch({ tags: [...currentTags, t] })
    setTagInput('')
  }

  function removeTag(tag) {
    patch({ tags: currentTags.filter(x => x !== tag) })
  }

  function clearAll() {
    setActiveTimeKey(null)
    onChange?.({})
    setCustomOpen(false)
    setTagInput('')
  }

  const hasActiveFilters =
    !!value.from || !!value.to || !!value.exerciseId || !!value.muscleGroup ||
    !!value.blockType || !!value.contextType || (currentTags.length > 0) || !!value.search

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="card space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-400" />
          <span className="text-sm font-semibold text-gray-700">Filtros</span>
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-primary-600 hover:text-primary-700 font-medium"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* ── Búsqueda ── */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          className="input pl-9 text-sm"
          placeholder="Buscar en el texto…"
          value={value.search || ''}
          onChange={e => patch({ search: e.target.value || undefined })}
        />
        {value.search && (
          <button
            type="button"
            onClick={() => patch({ search: undefined })}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
            aria-label="Limpiar búsqueda"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* ── Chips temporales ── */}
      <div>
        <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1.5">Fecha</p>
        <div className="flex flex-wrap gap-1.5">
          {TIME_PRESETS.map(p => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyTimePreset(p.key)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                activeTime === p.key
                  ? 'bg-primary-100 text-primary-700 border-primary-200'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => applyTimePreset('custom')}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors inline-flex items-center gap-1 ${
              activeTime === 'custom' || customOpen
                ? 'bg-primary-100 text-primary-700 border-primary-200'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Calendar size={11} /> Custom
          </button>
        </div>

        {customOpen && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <label className="label text-[11px]">Desde</label>
              <input
                type="date"
                className="input text-xs"
                onChange={e => applyCustomDate('from', e.target.value)}
              />
            </div>
            <div>
              <label className="label text-[11px]">Hasta</label>
              <input
                type="date"
                className="input text-xs"
                onChange={e => applyCustomDate('to', e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Ejercicio + Grupo muscular ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="label text-[11px]">Ejercicio</label>
          {/* Si hay >200 usamos input+datalist; sino select directo */}
          {exercises.length > 200 ? (
            <>
              <input
                list="notes-exercises-datalist"
                className="input text-xs"
                placeholder="Buscar ejercicio…"
                defaultValue={
                  value.exerciseId
                    ? (exercises.find(e => e.id === value.exerciseId)?.name || '')
                    : ''
                }
                onChange={e => {
                  const match = exercises.find(ex => ex.name === e.target.value)
                  patch({ exerciseId: match?.id || undefined })
                }}
              />
              <datalist id="notes-exercises-datalist">
                {exercises.map(ex => (
                  <option key={ex.id} value={ex.name} />
                ))}
              </datalist>
            </>
          ) : (
            <select
              className="input text-xs"
              value={value.exerciseId || ''}
              onChange={e => patch({ exerciseId: e.target.value || undefined })}
            >
              <option value="">Todos</option>
              {exercises.map(ex => (
                <option key={ex.id} value={ex.id}>{ex.name}</option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="label text-[11px]">Grupo muscular</label>
          <select
            className="input text-xs"
            value={value.muscleGroup || ''}
            onChange={e => patch({ muscleGroup: e.target.value || undefined })}
          >
            <option value="">Todos</option>
            {muscleGroups.map(mg => (
              <option key={mg} value={mg}>{mg}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── BlockType chips ── */}
      <div>
        <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1.5">Tipo de bloque</p>
        <div className="flex flex-wrap gap-1.5">
          {BLOCK_TYPE_PRESETS.map(b => (
            <button
              key={b.key}
              type="button"
              onClick={() =>
                patch({ blockType: value.blockType === b.key ? undefined : b.key })
              }
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                value.blockType === b.key
                  ? 'bg-primary-100 text-primary-700 border-primary-200'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tags ── */}
      <div>
        <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1.5 flex items-center gap-1">
          <TagIcon size={11} /> Tags
        </p>

        {currentTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {currentTags.map(t => (
              <span
                key={t}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 text-xs font-medium"
              >
                {t}
                <button
                  type="button"
                  onClick={() => removeTag(t)}
                  className="hover:text-primary-900"
                  aria-label={`Quitar tag ${t}`}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="relative">
          <input
            type="text"
            className="input text-xs"
            placeholder="Agregar tag…"
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTag(tagInput)
              }
            }}
          />
          {tagSuggestions.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-md max-h-40 overflow-y-auto">
              {tagSuggestions.map(s => (
                <button
                  type="button"
                  key={s}
                  onClick={() => addTag(s)}
                  className="block w-full text-left text-xs px-3 py-1.5 hover:bg-gray-50"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
