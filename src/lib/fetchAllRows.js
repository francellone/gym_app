// ============================================================
// fetchAllRows
// ------------------------------------------------------------
// Supabase (PostgREST) devuelve COMO MÁXIMO 1000 filas por request,
// en silencio: sin error, sin aviso. Cualquier query que pueda superar
// eso y no pagine está leyendo un subconjunto arbitrario de la tabla.
// (Bug real 2026-08-27: la alerta "sin entrenar hace varios días"
// marcaba 22/23 alumnos porque el fetch de workout_logs traía 1000 de
// 1893 filas y a la mayoría le "desaparecían" los logs recientes.)
//
// Uso:
//   const rows = await fetchAllRows((from, to) =>
//     supabase.from('workout_logs').select('...').gte(...).range(from, to)
//   )
//
// `build` recibe (from, to) y debe devolver la query YA con .range()
// aplicado, construida de cero en cada llamada (los builders de
// supabase-js no son reutilizables entre requests). IMPORTANTE: la
// query debe tener un orden estable (.order(...)) para que las páginas
// no se solapen; si no trae uno, el caller es responsable.
// Lanza el error de la primera página que falle.
// ============================================================
export const SUPABASE_PAGE_SIZE = 1000

export async function fetchAllRows(build, { pageSize = SUPABASE_PAGE_SIZE, maxPages = 50 } = {}) {
  const rows = []
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) throw error
    const batch = data || []
    rows.push(...batch)
    if (batch.length < pageSize) return rows
  }
  // Tope de seguridad (50k filas por default): mejor cortar acá que
  // loopear infinito si el backend repite páginas.
  console.warn('[fetchAllRows] se alcanzó maxPages; resultado posiblemente incompleto')
  return rows
}
