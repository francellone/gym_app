// Un mensaje del chat. Si es de la coach y lo mira la coach, tiene el menú
// para guardarlo (nota privada, plan, día) y las etiquetas de lo guardado.

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  MoreVertical,
  Lock,
  Pin,
  Dumbbell,
  CalendarDays,
  Pencil,
  Copy,
  Reply,
  X,
  CornerDownRight,
} from 'lucide-react'
import { linkKindOf } from '../chatModel'
import { linkLabel } from '../chatText'

function contextLabel(t, note, labels, fmtDate) {
  const ex = note.exercise_id ? labels.exercises.get(note.exercise_id)?.name : null
  const date = note.note_date ? fmtDate(note.note_date) : null
  switch (note.context_type) {
    case 'workout_log':
      return ex
        ? date
          ? t('chat.context.logOn', { exercise: ex, date })
          : t('chat.context.exercise', { exercise: ex })
        : t('chat.context.log')
    case 'workout_block_log':
      return date ? t('chat.context.blockOn', { date }) : t('chat.context.block')
    case 'exercise':
      return ex ? t('chat.context.exercise', { exercise: ex }) : null
    case 'evaluation_test':
    case 'evaluation_result':
      return t('chat.context.evaluation')
    default:
      return null
  }
}

const LINK_ICON = { private: Lock, exercise: Dumbbell, plan_exercise: Pin, plan_day: CalendarDays }
const LINK_CLS = {
  private: 'bg-white border border-dashed border-texto3 text-texto2',
  exercise: 'bg-gray-100 border border-gray-300 text-gray-700',
  plan_exercise: 'bg-durazno-50 border border-durazno-200 text-primary-700',
  plan_day: 'bg-durazno-50 border border-durazno-200 text-primary-700',
}

export default function ChatMessage({
  item,
  viewerRole,
  labels,
  parent,
  timeLabel,
  fmtDate,
  canManage,
  onAction,
  onUnlink,
  onEdit,
}) {
  const { t } = useTranslation()
  const note = item.note
  const mine = note.author_role === viewerRole
  const isPrivate = note.visibility === 'coach_private'
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note.body)
  const [saving, setSaving] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menu) return undefined
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menu])

  const ctx = contextLabel(t, note, labels, fmtDate)
  const visibleLinks = item.links.filter(
    (l) => viewerRole === 'coach' || linkKindOf(l) !== 'private'
  )
  const ownCoachMsg = canManage && mine && viewerRole === 'coach' && !item.fromCopy

  let bubble = 'bg-white border border-gray-300 rounded-bl-md'
  if (mine) bubble = 'bg-durazno-100 rounded-br-md'
  if (isPrivate) bubble = 'bg-white border-[1.5px] border-dashed border-texto3 rounded-br-md'

  async function saveEdit() {
    const body = draft.trim()
    if (!body || body === note.body) {
      setEditing(false)
      return
    }
    setSaving(true)
    const ok = await onEdit?.(note, body)
    setSaving(false)
    if (ok !== false) setEditing(false)
  }

  function act(kind) {
    setMenu(false)
    if (kind === 'edit') {
      setDraft(note.body)
      setEditing(true)
      return
    }
    if (kind === 'copy') {
      try {
        navigator.clipboard?.writeText(note.body)
      } catch {
        /* sin portapapeles */
      }
      return
    }
    onAction?.(kind, note)
  }

  return (
    <div className={`flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
      <div
        className={`relative group max-w-[85%] sm:max-w-md flex items-start gap-1 ${mine ? 'flex-row-reverse' : ''}`}
      >
        <div className={`rounded-2xl px-3 py-2 text-sm text-tinta min-w-0 ${bubble}`}>
          {isPrivate && (
            <p className="text-[11px] font-bold text-texto2 flex items-center gap-1 mb-0.5">
              <Lock size={11} aria-hidden="true" />
              {item.fromCopy ? t('chat.privateFromMessage') : t('chat.privateNote')}
            </p>
          )}
          {ctx && (
            <p className="text-[11px] font-medium text-primary-700 flex items-center gap-1 mb-0.5 break-words">
              <Dumbbell size={11} aria-hidden="true" />
              {ctx}
            </p>
          )}
          {parent && (
            <p className="text-xs text-texto2 border-l-2 border-gray-300 pl-2 mb-1 line-clamp-2 break-words">
              <CornerDownRight size={11} className="inline mr-1" aria-hidden="true" />
              {parent.body}
            </p>
          )}
          {editing ? (
            <div className="flex flex-col gap-1.5 w-64 max-w-full">
              <textarea
                id={`chat-edit-${note.id}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                className="input text-sm"
              />
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  className="btn-secondary text-xs px-2 py-1"
                  onClick={() => setEditing(false)}
                >
                  {t('chat.cancel')}
                </button>
                <button
                  type="button"
                  className="btn-primary text-xs px-2 py-1"
                  disabled={saving}
                  onClick={saveEdit}
                >
                  {t('chat.save')}
                </button>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words">{note.body}</p>
          )}
          {timeLabel && (
            <p className="text-[10.5px] text-texto3 mt-0.5 text-right">
              {timeLabel}
              {note.updated_at && note.updated_at !== note.created_at && !isPrivate
                ? ` · ${t('chat.edited')}`
                : ''}
            </p>
          )}
        </div>

        {(ownCoachMsg || (canManage && !mine)) && !editing && (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenu((v) => !v)}
              className="p-1 rounded-full text-texto3 hover:text-tinta hover:bg-gray-100"
              aria-label={t('chat.moreActions')}
              aria-expanded={menu}
            >
              <MoreVertical size={16} />
            </button>
            {menu && (
              <div
                className={`absolute z-20 top-7 ${mine ? 'right-0' : 'left-0'} w-72 bg-white border border-gray-300 rounded-xl shadow-lg p-1.5`}
              >
                {!mine && (
                  <MenuItem
                    Icon={Reply}
                    title={t('chat.menu.reply')}
                    onClick={() => act('reply')}
                  />
                )}
                {ownCoachMsg && !isPrivate && (
                  <>
                    <MenuItem
                      Icon={Lock}
                      title={t('chat.menu.private')}
                      hint={t('chat.menu.privateHint')}
                      onClick={() => act('private')}
                    />
                    <MenuItem
                      Icon={Pin}
                      title={t('chat.menu.plan')}
                      hint={t('chat.menu.planHint')}
                      onClick={() => act('plan')}
                    />
                    <MenuItem
                      Icon={CalendarDays}
                      title={t('chat.menu.day')}
                      hint={t('chat.menu.dayHint')}
                      onClick={() => act('day')}
                    />
                  </>
                )}
                {ownCoachMsg && (
                  <MenuItem Icon={Pencil} title={t('chat.menu.edit')} onClick={() => act('edit')} />
                )}
                <MenuItem Icon={Copy} title={t('chat.menu.copy')} onClick={() => act('copy')} />
              </div>
            )}
          </div>
        )}
      </div>

      {visibleLinks.length > 0 && (
        <div
          className={`flex flex-wrap gap-1.5 max-w-[90%] ${mine ? 'justify-end' : 'justify-start'}`}
        >
          {visibleLinks.map((l) => {
            const kind = linkKindOf(l)
            const Icon = LINK_ICON[kind] || Pin
            return (
              <span
                key={l.id}
                className={`inline-flex items-center gap-1 text-[11px] font-medium rounded-lg px-2 py-0.5 ${LINK_CLS[kind] || ''}`}
              >
                <Icon size={11} aria-hidden="true" />
                <span className="break-words">{linkLabel(t, l, labels, viewerRole)}</span>
                {viewerRole === 'coach' && canManage && (
                  <button
                    type="button"
                    onClick={() => onUnlink?.(l)}
                    className="ml-0.5 rounded hover:bg-black/5"
                    aria-label={t('chat.link.remove')}
                    title={t('chat.link.remove')}
                  >
                    <X size={11} />
                  </button>
                )}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MenuItem({ Icon, title, hint, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-start gap-2.5 text-left px-2.5 py-2 rounded-lg hover:bg-durazno-50"
    >
      <Icon size={15} className="mt-0.5 text-texto2 flex-shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-tinta">{title}</span>
        {hint && <span className="block text-[11.5px] text-texto2">{hint}</span>}
      </span>
    </button>
  )
}
