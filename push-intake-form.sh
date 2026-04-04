#!/bin/bash
# ============================================================
# push-intake-form.sh
# Agrega el módulo intake-form al repo y hace push a GitHub.
# No elimina ni modifica archivos existentes.
# ============================================================

set -e  # Detener si hay algún error

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

echo ""
echo "📁 Directorio: $REPO_DIR"
echo "🌿 Rama actual: $(git branch --show-current)"
echo ""

# ── 1. Verificar que la carpeta existe ─────────────────────
if [ ! -d "intake-form" ]; then
  echo "❌ No se encontró la carpeta intake-form/"
  echo "   Asegurate de que esté en: $REPO_DIR/intake-form/"
  exit 1
fi

echo "✅ Carpeta intake-form/ encontrada"
echo ""

# ── 2. Mostrar archivos que se van a agregar ───────────────
echo "📄 Archivos a commitear:"
echo ""
find intake-form -type f | sort | while read f; do
  echo "   + $f"
done
echo ""

# ── 3. Staging solo de intake-form/ ───────────────────────
git add intake-form/

# ── 4. Verificar que hay algo para commitear ───────────────
if git diff --cached --quiet; then
  echo "ℹ️  No hay cambios nuevos en intake-form/ para commitear."
  echo "   (puede que ya estén pusheados)"
  exit 0
fi

# ── 5. Commit ──────────────────────────────────────────────
git commit -m "$(cat <<'EOF'
feat: add intake-form module (student intake system)

New standalone module in intake-form/ with:
- schema/: default form config (7 modules, 4 templates, question types)
- supabase/: DB migration with 4 tables + RLS + profile processor
- components/coach/: FormBuilder, ModuleCard, QuestionEditor, TemplateManager, IntroEditor
- components/student/: FormRenderer (step-by-step) + QuestionField (all input types)
- components/shared/: conditional logic engine + validation

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"

echo ""
echo "✅ Commit creado"
echo ""

# ── 6. Push ────────────────────────────────────────────────
echo "🚀 Haciendo push a origin/$(git branch --show-current)..."
git push origin "$(git branch --show-current)"

echo ""
echo "✅ ¡Push exitoso!"
echo "🔗 https://github.com/francellone/gym_app/tree/$(git branch --show-current)/intake-form"
echo ""
