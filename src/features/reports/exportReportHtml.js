// ============================================================
// Export del informe como HTML autocontenido
// ------------------------------------------------------------
// Decisión cerrada (2026-08-29): el archivo descargable se arma
// SERIALIZANDO lo que la pantalla ya renderizó — incluidos los SVG que
// Recharts dejó en el DOM. PROHIBIDO reimplementar gráficos acá: una sola
// implementación por gráfico o la pantalla y el archivo divergen en
// silencio (ver memoria del proyecto: informe-progreso-alumno-sin-ia).
//
// Qué lleva el archivo:
//   - el HTML del informe tal cual se ve (sin los controles `print:hidden`);
//   - TODO el CSS de la app embebido (Tailwind compilado; ~decenas de KB,
//     el precio de que abra idéntico y offline en cualquier navegador);
//   - un botón Imprimir/PDF propio + print CSS;
//   - tabla por ejercicio ordenable con ~30 líneas de JS vanilla
//     (interacción sobre contenido estático: no duplica lógica de la app).
// ============================================================

/** Junta el CSS de todas las hojas de la página (Tailwind compilado incluido). */
export function collectPageCss(doc = document) {
  const chunks = []
  for (const sheet of doc.styleSheets) {
    try {
      for (const rule of sheet.cssRules) chunks.push(rule.cssText)
    } catch {
      // Hoja cross-origin (no debería haber): se ignora.
    }
  }
  return chunks.join('\n')
}

/** Saca del clon todo lo marcado print:hidden (controles, botones). */
export function stripNonExport(root) {
  root.querySelectorAll('*').forEach((el) => {
    if (el.classList && el.classList.contains('print:hidden')) el.remove()
  })
  return root
}

// Orden por click en los encabezados de tablas [data-export-sortable].
// Numérico si la columna parsea como número (soporta "+12%", "32,5"),
// alfabético si no. Click repetido invierte.
export const SORT_SCRIPT = `
(function () {
  document.querySelectorAll('table[data-export-sortable]').forEach(function (table) {
    var dir = {}
    table.querySelectorAll('thead th').forEach(function (th, col) {
      th.style.cursor = 'pointer'
      th.title = 'Ordenar'
      th.addEventListener('click', function () {
        var tbody = table.querySelector('tbody')
        var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'))
        dir[col] = dir[col] === 'asc' ? 'desc' : 'asc'
        var sign = dir[col] === 'asc' ? 1 : -1
        rows.sort(function (a, b) {
          var ta = (a.children[col] || {}).textContent || ''
          var tb = (b.children[col] || {}).textContent || ''
          var na = parseFloat(ta.replace(/[^0-9.,-]/g, '').replace(',', '.'))
          var nb = parseFloat(tb.replace(/[^0-9.,-]/g, '').replace(',', '.'))
          if (!isNaN(na) && !isNaN(nb)) return (na - nb) * sign
          return ta.localeCompare(tb) * sign
        })
        rows.forEach(function (r) { tbody.appendChild(r) })
      })
    })
  })
})()
`

/**
 * Documento HTML completo y autocontenido.
 * @param {Object} args
 * @param {string} args.bodyHtml - innerHTML del informe ya limpio
 * @param {string} args.css - CSS embebido
 * @param {string} args.title - título del documento
 * @returns {string}
 */
export function buildExportHtml({ bodyHtml, css, title }) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
${css}
/* Ajustes propios del archivo exportado */
body { background: #f9fafb; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.export-shell { max-width: 48rem; margin: 0 auto; padding: 1rem; }
.recharts-wrapper svg { max-width: 100%; }
.no-print { position: fixed; top: 12px; right: 12px; }
@media print { .no-print { display: none } body { background: #fff } }
</style>
</head>
<body>
<button class="no-print btn-secondary" onclick="window.print()">Imprimir / PDF</button>
<div class="export-shell">
${bodyHtml}
</div>
<script>
${SORT_SCRIPT}
</script>
</body>
</html>`
}

function escapeHtml(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
}

function slug(s) {
  return String(s || 'informe')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Arma y descarga el archivo desde el nodo ya renderizado.
 * @param {HTMLElement} rootEl - contenedor del informe (#report-root)
 * @param {{studentName:string, from:string, to:string}} meta
 */
export function downloadReportHtml(rootEl, { studentName, from, to }) {
  const clone = stripNonExport(rootEl.cloneNode(true))
  const title = `Informe de progreso — ${studentName}`
  const html = buildExportHtml({
    bodyHtml: clone.innerHTML,
    css: collectPageCss(rootEl.ownerDocument),
    title,
  })
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = rootEl.ownerDocument.createElement('a')
  a.href = url
  a.download = `informe-${slug(studentName)}-${from}-a-${to}.html`
  a.click()
  URL.revokeObjectURL(url)
}
