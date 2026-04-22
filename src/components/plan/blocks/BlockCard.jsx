import { useState } from 'react'
import {
  ChevronDown, ChevronUp, Trash2, ArrowUp, ArrowDown,
} from 'lucide-react'
import {
  BLOCK_TYPES, blockDisplayTitle, blockTypeIcon,
} from '../../../utils/planHelpers'

import StrengthBlockEditor from './StrengthBlockEditor'
import AerobicBlockEditor from './AerobicBlockEditor'
import CircuitBlockEditor from './CircuitBlockEditor'

/**
 * Card wrapper para un bloque. Header colapsable + delegación al
 * editor correspondiente según block_type.
 */
export default function BlockCard({
  block,
  blockIndexInSection,    // orden dentro de la sección (para default open del primero)
  strengthIndexInSection, // índice cuántico entre bloques de fuerza en la sección
  onUpdate,               // (patch) => void
  onUpdateExercises,      // (nextExercises) => void
  onRemove,               // () => void
  onMove,                 // (direction: -1 | 1) => void
  canMoveUp,
  canMoveDown,
  exercises = [],
  exerciseTags = [],
  tagAssignments = [],
  defaultOpen = false,
}) {
  const [open, setOpen] = useState(defaultOpen || blockIndexInSection === 0)
  const meta = BLOCK_TYPES[block.block_type] || BLOCK_TYPES.strength
  const title = blockDisplayTitle(block, strengthIndexInSection)

  const exCount = block.exercises?.length || 0

  return (
    <div className="rounded-2xl border-2 border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 border-b border-gray-100">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex-1 flex items-center gap-2 text-left"
        >
          <span className="text-lg flex-shrink-0">{blockTypeIcon(block.block_type)}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {title}
            </p>
            <p className="text-[11px] text-gray-400">
              {meta.label}
              {exCount > 0 && ` · ${exCount} ejercicio${exCount !== 1 ? 's' : ''}`}
            </p>
          </div>
          {open
            ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0" />
            : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />
          }
        </button>

        {/* Reorder */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={() => onMove(-1)}
            disabled={!canMoveUp}
            className="p-1 text-gray-400 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
            title="Subir"
          >
            <ArrowUp size={14} />
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={!canMoveDown}
            className="p-1 text-gray-400 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
            title="Bajar"
          >
            <ArrowDown size={14} />
          </button>
          <button
            onClick={onRemove}
            className="p-1 text-red-400 hover:bg-red-50 rounded"
            title="Eliminar bloque"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Body */}
      {open && (
        <div className="p-3 space-y-3">
          {/* Título opcional del bloque */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Título del bloque (opcional)</label>
            <input
              className="input text-sm"
              placeholder={`Ej: ${meta.label} principal`}
              value={block.title || ''}
              onChange={e => onUpdate({ title: e.target.value })}
            />
          </div>

          {block.block_type === 'strength' && (
            <StrengthBlockEditor
              block={block}
              onUpdate={onUpdate}
              onUpdateExercises={onUpdateExercises}
              exercises={exercises}
              exerciseTags={exerciseTags}
              tagAssignments={tagAssignments}
            />
          )}

          {block.block_type === 'aerobic' && (
            <AerobicBlockEditor
              block={block}
              onUpdate={onUpdate}
              onUpdateExercises={onUpdateExercises}
              exercises={exercises}
              exerciseTags={exerciseTags}
              tagAssignments={tagAssignments}
            />
          )}

          {block.block_type === 'circuit' && (
            <CircuitBlockEditor
              block={block}
              onUpdate={onUpdate}
              onUpdateExercises={onUpdateExercises}
              exercises={exercises}
              exerciseTags={exerciseTags}
              tagAssignments={tagAssignments}
            />
          )}

          {/* Notas técnicas del bloque */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Notas técnicas del bloque</label>
            <textarea
              className="input text-sm resize-none"
              rows={2}
              placeholder="Observaciones para el alumno..."
              value={block.notes || ''}
              onChange={e => onUpdate({ notes: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  )
}
