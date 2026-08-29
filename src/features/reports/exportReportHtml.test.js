// Tests del export HTML autocontenido — jsdom, sin red.
import { describe, it, expect } from 'vitest'
import { buildExportHtml, stripNonExport, collectPageCss, SORT_SCRIPT } from './exportReportHtml'

describe('stripNonExport', () => {
  it('elimina los controles print:hidden y deja el contenido', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="print:hidden"><button>Descargar</button></div>
      <section><h2>Constancia semanal</h2><svg><rect /></svg></section>
    `
    stripNonExport(root)
    expect(root.querySelector('button')).toBeNull()
    expect(root.querySelector('svg')).not.toBeNull()
    expect(root.textContent).toContain('Constancia semanal')
  })
})

describe('buildExportHtml', () => {
  const html = buildExportHtml({
    bodyHtml: '<section id="x">contenido & gráficos</section>',
    css: '.card{background:#fff}',
    title: 'Informe — Cata <test>',
  })
  it('documento completo, offline: doctype, css embebido, sin src externos', () => {
    expect(html).toMatch(/^<!doctype html>/)
    expect(html).toContain('.card{background:#fff}')
    expect(html).toContain('<section id="x">')
    expect(html).not.toMatch(/src="http/)
    expect(html).not.toMatch(/href="http/)
  })
  it('escapa el título y trae botón de imprimir + script de orden', () => {
    expect(html).toContain('Informe — Cata &lt;test&gt;')
    expect(html).toContain('window.print()')
    expect(html).toContain('data-export-sortable')
  })
})

describe('SORT_SCRIPT (corre sobre el DOM exportado)', () => {
  it('ordena la tabla por columna numérica y invierte al repetir', () => {
    document.body.innerHTML = `
      <table data-export-sortable="true">
        <thead><tr><th>Ejercicio</th><th>Máx.</th></tr></thead>
        <tbody>
          <tr><td>Press</td><td>30</td></tr>
          <tr><td>Sentadilla</td><td>62,5</td></tr>
          <tr><td>Remo</td><td>8</td></tr>
        </tbody>
      </table>`
    eval(SORT_SCRIPT)
    const th = document.querySelectorAll('th')[1]
    const values = () =>
      [...document.querySelectorAll('tbody tr td:nth-child(2)')].map((t) => t.textContent)
    th.click()
    expect(values()).toEqual(['8', '30', '62,5'])
    th.click()
    expect(values()).toEqual(['62,5', '30', '8'])
  })
})

describe('collectPageCss', () => {
  it('junta reglas de las hojas del documento', () => {
    const style = document.createElement('style')
    style.textContent = '.export-test-rule{color:red}'
    document.head.appendChild(style)
    expect(collectPageCss(document)).toContain('.export-test-rule')
    style.remove()
  })
})
