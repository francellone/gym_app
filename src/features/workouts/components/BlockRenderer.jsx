import AerobicBlockRunCard from './AerobicBlockRunCard'
import CircuitBlockRunCard from './CircuitBlockRunCard'
import StrengthBlockRunCard from './StrengthBlockRunCard'

// ============================================================
// Render de un bloque (delegador al tipo)
// ============================================================
// Discrimina por `block.block_type`:
//   - 'aerobic' → AerobicBlockRunCard (un solo workout_block_log)
//   - 'circuit' → CircuitBlockRunCard (un block_log + N exercise_logs)
//   - 'strength' (default) → StrengthBlockRunCard (N ExerciseCard adentro)
//
// Props Q1 (preview "Última vez" + chat del ejercicio):
//   - lastLogByExercise        Map<exercise_id, workout_log>
//   - lastBlockLogByBlock      Map<plan_block_id, workout_block_log>
//   - lastCoachNoteByExercise  Map<exercise_id, note>
//   - noteCountByExercise      Map<exercise_id, number>
//   - onOpenChat               (exerciseId, exerciseName) => void
export default function BlockRenderer({
  block,
  strengthIndexInSection,
  logs,
  blockLog,
  saveLog,
  deleteLog,
  saveBlockLog,
  deleteBlockLog,
  // Q1
  lastLogByExercise,
  lastBlockLogByBlock,
  lastCoachNoteByExercise,
  noteCountByExercise,
  onOpenChat,
}) {
  if (block.block_type === 'aerobic') {
    return (
      <AerobicBlockRunCard
        block={block}
        blockLog={blockLog}
        onSaveLog={(data) => saveBlockLog(block.id, data)}
        onDeleteLog={() => deleteBlockLog(block.id)}
        lastBlockLog={lastBlockLogByBlock?.get?.(block.id) || null}
        lastCoachNoteByExercise={lastCoachNoteByExercise}
        noteCountByExercise={noteCountByExercise}
        onOpenChat={onOpenChat}
      />
    )
  }

  if (block.block_type === 'circuit') {
    // Logs por ejercicio del circuito
    const exLogsForBlock = {}
    for (const ex of block.plan_exercises || []) {
      if (logs[ex.id]) exLogsForBlock[ex.id] = logs[ex.id]
    }
    return (
      <CircuitBlockRunCard
        block={block}
        blockLog={blockLog}
        exerciseLogs={exLogsForBlock}
        onSaveBlockLog={(data) => saveBlockLog(block.id, data)}
        onSaveExerciseLog={saveLog}
        onDeleteBlockLog={() => deleteBlockLog(block.id)}
        lastBlockLog={lastBlockLogByBlock?.get?.(block.id) || null}
        lastLogByExercise={lastLogByExercise}
        lastCoachNoteByExercise={lastCoachNoteByExercise}
        noteCountByExercise={noteCountByExercise}
        onOpenChat={onOpenChat}
      />
    )
  }

  // Strength: card colapsable con lista de ExerciseCard adentro.
  return (
    <StrengthBlockRunCard
      block={block}
      strengthIndexInSection={strengthIndexInSection}
      logs={logs}
      saveLog={saveLog}
      deleteLog={deleteLog}
      lastLogByExercise={lastLogByExercise}
      lastCoachNoteByExercise={lastCoachNoteByExercise}
      noteCountByExercise={noteCountByExercise}
      onOpenChat={onOpenChat}
    />
  )
}
