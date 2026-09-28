#!/usr/bin/env node
// ============================================================
// Busca texto visible hardcodeado (en español) en componentes.
// Uso: node scripts/find-hardcoded-es.mjs [dir-o-archivo ...] [--list] [--json]
// Cuenta:
//   - texto JSX (<p>Hola</p>)
//   - strings en atributos visibles (placeholder, title, aria-label, alt, label)
//   - strings que terminan renderizados: {'texto'}, cond ? 'a' : 'b' dentro de JSX
//   - alert()/confirm()/window.confirm() con string o template
// Ignora: comentarios, className/style/keys, imports, console.*, t('...'),
// y strings sin letras. Es heurístico: sirve para medir y encontrar, no es ley.
// ============================================================
import fs from 'node:fs'
import path from 'node:path'
import { parse } from '@babel/parser'
import traverseMod from '@babel/traverse'
const traverse = traverseMod.default || traverseMod

const args = process.argv.slice(2)
const LIST = args.includes('--list')
const JSON_OUT = args.includes('--json')
const targets = args.filter((a) => !a.startsWith('--'))
const VISIBLE_ATTRS = new Set(['placeholder', 'title', 'aria-label', 'alt', 'label', 'tooltip', 'emptyText', 'confirmLabel', 'cancelLabel', 'subtitle', 'description', 'helper', 'hint'])
const HAS_WORD = /[A-Za-zÁÉÍÓÚáéíóúÑñ]{2,}/
const SKIP_VALUE = /^(https?:|\/|#|rgb\(var\(|[a-z0-9_.-]+$|[A-Z0-9_]+$)/ // rutas, ids, claves, colores del tema

function walk(p, out) {
  const st = fs.statSync(p)
  if (st.isDirectory()) {
    for (const f of fs.readdirSync(p)) walk(path.join(p, f), out)
  } else if (/\.(jsx|js)$/.test(p) && !/\.test\.(jsx|js)$/.test(p)) out.push(p)
  return out
}

const I18N_KEY = /^[a-zA-Z][\w]*(\.[\w…]+)+\.?…?$/ // workout.x, coach.plans.title, prefijo.…
const UNITS_ONLY = /^[\s…·%()0-9+\-×x/:]*(kg|cm|min|seg|km|m|s|reps?|lbs?|RM|PSE|RPE)?[\s…·%()0-9+\-×x/:]*$/i

function isVisibleString(v) {
  const s = v.trim()
  if (!s || !HAS_WORD.test(s)) return false
  if (SKIP_VALUE.test(s)) return false
  if (I18N_KEY.test(s) || UNITS_ONLY.test(s)) return false
  if (/^[yMdHhmsEaLQ'\s:/.,-]+$/.test(s)) return false // formatos de fecha
  if (/(^|\s)(bg|text|border|flex|grid|w|h|p[xytrbl]?|m[xytrbl]?|rounded|gap|items|justify)-/.test(s)) return false // clases
  if (s === 'GymCoach') return false
  return true
}

function scanFile(file) {
  const code = fs.readFileSync(file, 'utf8')
  let ast
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['jsx'] })
  } catch {
    return []
  }
  const hits = []
  const add = (node, text, kind) => hits.push({ file, line: node.loc?.start.line, kind, text: text.trim().slice(0, 90) })
  traverse(ast, {
    JSXText(p) {
      if (isVisibleString(p.node.value)) add(p.node, p.node.value, 'jsx-text')
    },
    JSXAttribute(p) {
      const name = p.node.name?.name
      if (!VISIBLE_ATTRS.has(name)) return
      const v = p.node.value
      if (v?.type === 'StringLiteral' && isVisibleString(v.value)) add(v, v.value, `attr:${name}`)
    },
    StringLiteral(p) {
      if (!isVisibleString(p.node.value)) return
      // Solo strings que caen dentro de un JSXExpressionContainer (render)
      const inJsxExpr = p.findParent((q) => q.isJSXExpressionContainer())
      if (!inJsxExpr) return
      if (p.parentPath.isJSXAttribute()) return
      const call = p.findParent((q) => q.isCallExpression())
      if (call && inJsxExpr.isAncestor?.(call) === false) {
        /* noop */
      }
      // Ignorar argumentos de t(), className helpers, comparaciones
      const parentCall = p.parentPath.isCallExpression() ? p.parentPath.node.callee : null
      if (parentCall && (parentCall.name === 't' || parentCall.property?.name === 't')) return
      if (p.parentPath.isBinaryExpression()) return
      if (p.parentPath.isObjectProperty() && p.parentPath.node.key === p.node) return
      const attr = p.findParent((q) => q.isJSXAttribute())
      if (attr && !VISIBLE_ATTRS.has(attr.node.name?.name)) return
      add(p.node, p.node.value, 'jsx-expr')
    },
    TemplateLiteral(p) {
      const inJsxExpr = p.findParent((q) => q.isJSXExpressionContainer())
      const attr = p.findParent((q) => q.isJSXAttribute())
      if (attr && !VISIBLE_ATTRS.has(attr.node.name?.name)) return
      const txt = p.node.quasis.map((q) => q.value.cooked).join('…')
      if (!isVisibleString(txt)) return
      const call = p.parentPath.isCallExpression() ? p.parentPath.node.callee : null
      const isAlert = call && ['alert', 'confirm'].includes(call.name || call.property?.name)
      if (inJsxExpr || isAlert) add(p.node, txt, isAlert ? 'alert' : 'jsx-template')
    },
    CallExpression(p) {
      const c = p.node.callee
      const name = c.name || c.property?.name
      if (!['alert', 'confirm'].includes(name)) return
      const a = p.node.arguments[0]
      if (a?.type === 'StringLiteral' && isVisibleString(a.value)) add(a, a.value, 'alert')
    },
  })
  return hits
}

const files = (targets.length ? targets : ['src']).flatMap((t) => walk(t, []))
const all = files.flatMap(scanFile)
if (JSON_OUT) {
  console.log(JSON.stringify(all, null, 2))
} else {
  const byFile = new Map()
  for (const h of all) byFile.set(h.file, (byFile.get(h.file) || 0) + 1)
  const rows = [...byFile.entries()].sort((a, b) => b[1] - a[1])
  if (LIST) for (const h of all) console.log(`${h.file}:${h.line}  [${h.kind}]  ${h.text}`)
  else for (const [f, n] of rows) console.log(String(n).padStart(4), f)
  console.log(`TOTAL ${all.length} en ${rows.length} archivos`)
}
