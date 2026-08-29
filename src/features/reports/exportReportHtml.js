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
 * Secciones plegables en el archivo: todo <section> con un <h2> directo se
 * convierte en <details open><summary>…</summary>…</details>. Interacción
 * nativa del navegador: cero JS, funciona offline e imprime abierto.
 */
export function makeCollapsible(root) {
  root.querySelectorAll('section').forEach((section) => {
    const h2 = Array.from(section.children).find((c) => c.tagName === 'H2')
    if (!h2) return
    const doc = section.ownerDocument
    const details = doc.createElement('details')
    details.open = true
    if (section.id) details.id = section.id
    details.className = section.className
    const summary = doc.createElement('summary')
    summary.appendChild(h2)
    details.appendChild(summary)
    while (section.firstChild) details.appendChild(section.firstChild)
    section.replaceWith(details)
  })
  return root
}

/**
 * Índice con anclas al principio del archivo, armado con los títulos de
 * sección presentes (el informe es modular: el índice también).
 */
export function buildToc(root) {
  const doc = root.ownerDocument
  const entries = []
  root.querySelectorAll('section, details').forEach((sec) => {
    const h2 = sec.querySelector(':scope > h2, :scope > summary > h2')
    if (!h2) return
    const text = h2.textContent.trim()
    if (!sec.id) {
      sec.id =
        'sec-' +
        text
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
    }
    entries.push({ id: sec.id, text })
  })
  if (entries.length < 2) return root
  const nav = doc.createElement('nav')
  nav.className = 'export-toc'
  nav.innerHTML =
    '<b>Contenido:</b> ' + entries.map((e) => `<a href="#${e.id}">${e.text}</a>`).join(' · ')
  const header = root.querySelector('header')
  if (header) header.after(nav)
  else root.prepend(nav)
  return root
}

/**
 * Tooltips nativos offline: inyecta <title> en las marcas de los SVG que
 * Recharts dejó renderizados. Posicional a propósito — los grupos
 * .recharts-bar y .recharts-bar-rectangle salen en el orden de los datos
 * (Recharts crea el grupo aunque el valor sea 0), y para las líneas el
 * caller pasa solo los puntos que existen (connectNulls saltea los null).
 *
 * @param {Element} root
 * @param {Array<{selector:string, bars?:string[][], dots?:string[][]}>} specs
 *   bars[i][j] = título de la barra j de la serie i; dots ídem para las
 *   líneas (círculos de .recharts-line-dots).
 */
export function injectSvgTitles(root, specs = []) {
  const SVG_NS = 'http://www.w3.org/2000/svg'
  const doc = root.ownerDocument
  const put = (el, text) => {
    if (!el || text == null) return
    const t = doc.createElementNS(SVG_NS, 'title')
    t.textContent = text
    el.appendChild(t)
  }
  for (const spec of specs) {
    const scope = root.querySelector(spec.selector)
    if (!scope) continue
    if (spec.bars) {
      const groups = scope.querySelectorAll('.recharts-bar')
      spec.bars.forEach((titles, gi) => {
        const rects = groups[gi]?.querySelectorAll('.recharts-bar-rectangle') || []
        titles.forEach((title, ri) => put(rects[ri], title))
      })
    }
    if (spec.dots) {
      const groups = scope.querySelectorAll('.recharts-line')
      spec.dots.forEach((titles, gi) => {
        const dots = groups[gi]?.querySelectorAll('.recharts-line-dots circle') || []
        titles.forEach((title, di) => put(dots[di], title))
      })
    }
  }
  return root
}

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
.export-toc { font-size: 0.8rem; color: #6b7280; margin: 0.75rem 0; }
.export-toc a { color: #4f46e5; text-decoration: none; }
details.card > summary { cursor: pointer; list-style: none; }
details.card > summary::-webkit-details-marker { display: none; }
details.card > summary h2::after { content: ' ▾'; color: #9ca3af; font-size: 0.8em; }
details.card:not([open]) > summary h2::after { content: ' ▸'; }
@media print { .no-print { display: none } body { background: #fff } details:not([open]) { display: block } }
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
export function downloadReportHtml(rootEl, { studentName, from, to }, { svgTitleSpecs } = {}) {
  const clone = stripNonExport(rootEl.cloneNode(true))
  injectSvgTitles(clone, svgTitleSpecs || [])
  makeCollapsible(clone)
  buildToc(clone)
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
