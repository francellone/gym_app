// Hojas del chat simplificado (2026-10-22):
// - ExercisePickerSheet: "¿Sobre qué ejercicio?" — ejercicios del plan activo
//   por día, con buscador y cuántos mensajes tiene cada uno.
// - ChatSearchSheet: lupa — ejercicios que aparecen en la conversación o una
//   palabra para filtrar.

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X, Dumbbell, MessageSquareText } from 'lucide-react'
import { normalizeText, dayLetter } from '../chatModel'

function Sheet({ titleId, title, hint, onClose, children }) {
  const { t } = useTranslation()
  return (
    <div
      className="fixed inset-0 z-50 bg-velo/40 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl p-4 pb-5 flex flex-col gap-2.5 max-h-[85dvh]"
      >
        <div className="flex items-center gap-2">
          <h2 id={titleId} className="flex-1 text-base font-bold text-tinta">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('chat.cancel')}
            className="w-9 h-9 flex items-center justify-center text-texto2"
          >
            <X size={18} />
          </button>
        </div>
        {hint && <p className="text-xs text-texto2 -mt-1">{hint}</p>}
        {children}
      </div>
    </div>
  )
}

function SearchBox({ id, value, onChange, placeholder }) {
  return (
    <div className="relative">
      <Search
        size={15}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-texto3"
        aria-hidden="true"
      />
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <input
        id={id}
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input pl-9 text-sm"
      />
    </div>
  )
}

const matches = (name, q) => !q || normalizeText(name).includes(normalizeText(q).trim())

export function ExercisePickerSheet({ groups, nameOf, counts, personName, onPick, onClose }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const shown = useMemo(
    () =>
      groups
        .map((g) => ({ ...g, items: g.items.filter((pe) => matches(nameOf(pe.exercise_id), q)) }))
        .filter((g) => g.items.length),
    [groups, q, nameOf]
  )
  return (
    <Sheet
      titleId="chat-ex-title"
      title={t('chat.picker.title')}
      hint={t('chat.picker.hint', { name: personName || t('chat.picker.thePerson') })}
      onClose={onClose}
    >
      <SearchBox
        id="chat-ex-search"
        value={q}
        onChange={setQ}
        placeholder={t('chat.picker.search')}
      />
      <div className="overflow-y-auto -mx-1 px-1">
        {groups.length === 0 && (
          <p className="text-sm text-texto2 py-4 text-center">{t('chat.picker.noPlan')}</p>
        )}
        {groups.length > 0 && shown.length === 0 && (
          <p className="text-sm text-texto2 py-4 text-center">{t('chat.picker.noMatch')}</p>
        )}
        {shown.map((g) => (
          <div key={`${g.plan.id}-${g.section}`}>
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-primary-800 pt-3 pb-1">
              {[
                g.plan.title,
                dayLetter(g.section) && t('chat.dayShort', { day: dayLetter(g.section) }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {g.items.map((pe) => {
              const n = counts.get(pe.exercise_id) || 0
              return (
                <button
                  key={pe.id}
                  type="button"
                  onClick={() => onPick({ pe, plan: g.plan, section: g.section })}
                  className="w-full min-h-[46px] flex items-center gap-2 border-b border-linea py-2 text-left text-[15px] text-tinta hover:bg-durazno-50/60"
                >
                  <span className="flex-1 min-w-0 break-words">{nameOf(pe.exercise_id)}</span>
                  {n > 0 && (
                    <span className="text-xs text-texto2 flex-shrink-0">
                      {t('chat.picker.messages', { count: n })}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </Sheet>
  )
}

export function ChatSearchSheet({ exercises, nameOf, onPickExercise, onSearchText, onClose }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const list = useMemo(
    () =>
      [...exercises.entries()]
        .map(([id, count]) => ({ id, count, name: nameOf(id) }))
        .filter((x) => x.name && matches(x.name, q))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    [exercises, q, nameOf]
  )
  return (
    <Sheet titleId="chat-search-title" title={t('chat.search.title')} onClose={onClose}>
      <SearchBox
        id="chat-search-input"
        value={q}
        onChange={setQ}
        placeholder={t('chat.search.placeholder')}
      />
      <div className="overflow-y-auto -mx-1 px-1">
        {q.trim() && (
          <button
            type="button"
            onClick={() => onSearchText(q.trim())}
            className="w-full min-h-[46px] flex items-center gap-2 border-b border-linea py-2 text-left text-sm text-tinta hover:bg-durazno-50/60"
          >
            <MessageSquareText size={15} className="text-texto2 flex-shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-0 break-words">
              {t('chat.search.inMessages', { q: q.trim() })}
            </span>
          </button>
        )}
        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-primary-800 pt-3 pb-1">
          {t('chat.search.exercises')}
        </p>
        {list.length === 0 && (
          <p className="text-sm text-texto2 py-3">{t('chat.search.noExercises')}</p>
        )}
        {list.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => onPickExercise(x.id)}
            className="w-full min-h-[46px] flex items-center gap-2 border-b border-linea py-2 text-left text-[15px] text-tinta hover:bg-durazno-50/60"
          >
            <Dumbbell size={14} className="text-primary-700 flex-shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-0 break-words">{x.name}</span>
            <span className="text-xs text-texto2 flex-shrink-0">
              {t('chat.picker.messages', { count: x.count })}
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}
