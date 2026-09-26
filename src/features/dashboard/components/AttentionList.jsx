import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { groupAlertsByStudent } from '../alerts'

// ============================================================
// AttentionList — "Necesitan atención"
// ------------------------------------------------------------
// Rediseño 2026-09-26. Una fila por persona con todos sus motivos
// (antes: una tarjeta por tipo de alerta, con la misma persona
// repetida). La lógica de agrupado y orden vive en alerts.js
// (groupAlertsByStudent), testeada.
// La baja adherencia de la semana pasada (umbral 100 %) va en una
// línea discreta al pie, no como fila.
// ============================================================

const VISIBLE = 5
const PILL = { bad: 'pill-bad', warn: 'pill-warn', neutral: 'pill-neutral' }

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '·'
}

// Intercala nodos con ", " y " y " antes del último.
function joinNodes(nodes) {
  return nodes.flatMap((n, i) => {
    if (i === 0) return [n]
    return [i === nodes.length - 1 ? ' y ' : ', ', n]
  })
}

export default function AttentionList({ alerts, loading, studentId = null }) {
  const [expanded, setExpanded] = useState(false)

  const { rows, quiet } = useMemo(() => {
    const g = groupAlertsByStudent(alerts)
    if (!studentId) return g
    return {
      rows: g.rows.filter((r) => r.studentId === studentId),
      quiet: g.quiet.filter((q) => q.studentId === studentId),
    }
  }, [alerts, studentId])

  const shown = expanded ? rows : rows.slice(0, VISIBLE)
  const hidden = rows.length - shown.length

  return (
    <section className="card">
      <div className="flex items-center justify-between mb-1">
        <p className="eyebrow">Necesitan atención</p>
        {rows.length > 0 && <span className="pill-bad font-bold">{rows.length}</span>}
      </div>

      {loading ? (
        <p className="text-sm text-texto3 py-2">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-texto2 py-2">
          {studentId ? 'Nada que atender con esta persona.' : 'Nadie necesita atención ahora.'}
        </p>
      ) : (
        <div className="divide-y divide-linea">
          {shown.map((r) => (
            <Link
              key={r.studentId}
              to={`/coach/students/${r.studentId}?tab=progress`}
              className="flex items-center gap-3 py-3 group"
            >
              <span className="w-[38px] h-[38px] rounded-full bg-durazno-100 text-primary-700 text-[13px] font-bold grid place-items-center flex-shrink-0">
                {initials(r.name)}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-tinta group-hover:text-primary-700">
                  {r.name}
                </span>
                <span className="flex flex-wrap gap-1.5 mt-1">
                  {r.items.map((it, i) => (
                    <span key={i} className={PILL[it.tone]}>
                      {it.text}
                    </span>
                  ))}
                </span>
              </span>
              <ChevronRight size={18} className="text-texto3 flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}

      {(hidden > 0 || (expanded && rows.length > VISIBLE)) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-sm font-medium text-primary-700 hover:underline mt-1"
        >
          {expanded ? 'Ver menos' : `Ver ${hidden} más`}
        </button>
      )}

      {!loading && quiet.length > 0 && (
        <p className="text-[13px] text-texto2 pt-2.5 mt-2 border-t border-dashed border-gray-300">
          La semana pasada faltaron a alguna sesión:{' '}
          {joinNodes(
            quiet.map((q) => (
              <Link
                key={q.studentId}
                to={`/coach/students/${q.studentId}?tab=progress`}
                className="hover:text-primary-700 hover:underline"
              >
                {q.name.split(' ')[0]}
              </Link>
            ))
          )}
          .
        </p>
      )}
    </section>
  )
}
