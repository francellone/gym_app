// Tests del export HTML autocontenido — jsdom, sin red.
import { describe, it, expect } from 'vitest'
import {
  buildExportHtml,
  stripNonExport,
  collectPageCss,
  makeCollapsible,
  buildToc,
  injectSvgTitles,
  SORT_SCRIPT,
} from './exportReportHtml'

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

describe('makeCollapsible', () => {
  it('convierte secciones con h2 directo en details abiertos; deja el resto', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <section class="card" id="sec-x"><h2>Constancia</h2><p>chart</p></section>
      <section class="grid"><div class="card"><h2>Récords</h2></div></section>
    `
    makeCollapsible(root)
    const det = root.querySelector('details')
    expect(det).not.toBeNull()
    expect(det.id).toBe('sec-x')
    expect(det.open).toBe(true)
    expect(det.querySelector('summary h2').textContent).toBe('Constancia')
    expect(det.textContent).toContain('chart')
    // la sección grid (sin h2 directo) queda como estaba
    expect(root.querySelectorAll('section').length).toBe(1)
  })
})

describe('buildToc', () => {
  it('arma el índice con anclas y asigna ids faltantes', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <header><h1>Informe</h1></header>
      <section id="sec-a"><h2>Constancia semanal</h2></section>
      <section><h2>Por ejercicio</h2></section>
    `
    buildToc(root)
    const nav = root.querySelector('nav.export-toc')
    expect(nav).not.toBeNull()
    expect(nav.previousElementSibling.tagName).toBe('HEADER')
    const hrefs = [...nav.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['#sec-a', '#sec-por-ejercicio'])
  })

  it('con una sola sección no agrega índice', () => {
    const root = document.createElement('div')
    root.innerHTML = `<section><h2>Única</h2></section>`
    buildToc(root)
    expect(root.querySelector('nav')).toBeNull()
  })
})

describe('injectSvgTitles', () => {
  it('agrega <title> posicional a barras (incluida la de valor 0) y puntos', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <section id="sec-c">
        <svg>
          <g class="recharts-bar">
            <g class="recharts-bar-rectangle"><path /></g>
            <g class="recharts-bar-rectangle"></g>
          </g>
          <g class="recharts-bar">
            <g class="recharts-bar-rectangle"><path /></g>
            <g class="recharts-bar-rectangle"><path /></g>
          </g>
          <g class="recharts-line"><g class="recharts-line-dots"><circle /><circle /></g></g>
        </svg>
      </section>
    `
    injectSvgTitles(root, [
      {
        selector: '#sec-c',
        bars: [
          ['s0 b0', 's0 b1'],
          ['s1 b0', 's1 b1'],
        ],
        dots: [['d0', 'd1']],
      },
    ])
    const rects = root.querySelectorAll('.recharts-bar-rectangle')
    expect(rects[0].querySelector('title').textContent).toBe('s0 b0')
    expect(rects[1].querySelector('title').textContent).toBe('s0 b1') // barra vacía también
    expect(rects[3].querySelector('title').textContent).toBe('s1 b1')
    const dots = root.querySelectorAll('.recharts-line-dots circle')
    expect(dots[1].querySelector('title').textContent).toBe('d1')
  })

  it('selector inexistente no rompe', () => {
    const root = document.createElement('div')
    expect(() => injectSvgTitles(root, [{ selector: '#nada', bars: [['x']] }])).not.toThrow()
  })
})
