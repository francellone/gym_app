# Fix bug — student no podía borrar notas en prod (RLS)

**Fecha:** 2026-05-21 (noche, después del cierre del Tier 3.2 documentado en `10_*` y `11_*`).
**Migración:** `20260521222957_fix_student_select_own_notes_any_state.sql` (entrada #23 en `01_changelog_back.md`).
**Commit del fix de front previo (no resolvió el bug, lo dejó visible):** `afb3ea7` del 21/05 PM.

---

## TL;DR

Desde el commit `5357945` ("refactor(notes): proper multi-coach support", 17/05) **ningún student logró borrar su propia nota en prod**. El fix del front del 21/05 PM (`afb3ea7` — `removeNoteLocally` + render de error fuera de `editing`) hacía visible el problema pero no lo resolvía: la causa raíz era de **RLS en la BD**, no del front.

El UPDATE de soft-delete (`update notes set deleted_at = now() where id = $1`) fallaba con `42501: new row violates row-level security policy for table "notes"` porque la policy SELECT del student exigía `deleted_at IS NULL` y Postgres aplica las USING de SELECT al NEW row durante `UPDATE ... RETURNING`.

Fix aplicado: policy SELECT adicional acotada al autor.

---

## Síntoma reportado

> "No puedo borrar notas de los comentarios. Son dos comentarios que hice yo que dicen prueba." — Franco, 21/05 noche, logueado como `francellone@gmail.com` (role=student en prod).

Notas afectadas concretas en el reporte:
- `4462fa6a-bba1-4c3b-a9f4-48423eb357bf` — `context_type=free`, body "Prueba\n Ja"
- `03766aa0-ef8e-447d-8ca5-d2c4f31911ad` — `context_type=exercise`, body "Prueva"

(ambas creadas el 21/05 PM, `author_id = d7a1ceb5-...`, `author_role=student`, `visibility=shared`, `deleted_at=NULL`)

---

## Investigación

### Paso 1 — descartar que sea el refactor de notas previo

El último commit en `main` (`afb3ea7`) ya era específico de borrar notas ("alumno no podía borrar su nota — RLS oculta el UPDATE de soft-delete del realtime, optimistic remove desde NoteCard + render del error fuera de editing"). Se verificó que el bundle deployado en prod (`/assets/index-CCOnTtM_.js`) sí contiene `removeNoteLocally` y `onDeleted`, por lo que el fix está vivo. **El bug remanente es otro.**

### Paso 2 — confirmar el rol y el dueño de la nota

```sql
select id, email, role from public.profiles
where email like '%franc%';
-- d7a1ceb5-... | francellone@gmail.com | student
```

Franco es student en prod (no coach). La nota es propia (`author_id = profile.id`). Aplica la policy `Student update own notes`, no `Coach update notes`.

### Paso 3 — reproducir el UPDATE con la identidad real

Se simuló la sesión de Franco vía `SET LOCAL request.jwt.claims` en una transacción con `ROLLBACK` (no toca data real):

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d7a1ceb5-80fa-4cb9-8477-126bb71f8081","role":"authenticated"}';
update public.notes set deleted_at = now() where id = '03766aa0-ef8e-447d-8ca5-d2c4f31911ad';
rollback;
```

Resultado: `ERROR 42501: new row violates row-level security policy for table "notes"`.

El mismo UPDATE como service_role (bypass RLS) funciona. → **Confirma: el bug es de RLS, no de triggers ni constraints.**

### Paso 4 — entender por qué el WITH CHECK explícito no aplica

La policy `Student update own notes` (UPDATE, permissive):
- USING: `(author_id = auth.uid()) AND (author_role = 'student')`
- WITH CHECK: `(author_id = auth.uid()) AND (author_role = 'student') AND (visibility = 'shared')`

El NEW row tras el UPDATE cumple las tres condiciones. **Pero igual falla.**

`EXPLAIN VERBOSE` del UPDATE muestra que el filtro efectivo NO es sólo el WITH CHECK del UPDATE policy. Postgres compone:

```
((USING_update_student) OR is_coach) AND ((USING_select_student) OR is_coach)
```

Es decir, también aplica el `USING` de la policy `Student read shared notes of own thread`:

```
(visibility = 'shared') AND (deleted_at IS NULL) AND (EXISTS thread con student_id = auth.uid())
```

Ese `deleted_at IS NULL` evaluado contra el **NEW row** (donde `deleted_at = now()`) es lo que falla.

### Paso 5 — confirmar por qué el coach sí podía borrar

La policy `Coach select all notes` no tiene cláusula sobre `deleted_at`:

```
USING: (EXISTS profile WHERE id=auth.uid() AND role='coach')
```

Por eso un coach borrando su propia nota pasa el USING de SELECT trivialmente. **El bug es asimétrico: sólo afecta a students.**

### Paso 6 — evidencia histórica del impacto

```sql
select id, author_role, deleted_at from public.notes
where author_role='student' and deleted_at is not null;
-- 3 filas, todas de Franco, todas con deleted_at del 17/05 con timestamps idénticos en pares.
```

Las 3 student-notes "borradas" en prod corresponden a smoke tests v25/v26 ejecutados con service_role (ver `09_*` / commits del 17/05). **Desde el 17/05 hasta el 21/05 PM, cero deletions reales vía UI.** El bug no es nuevo de esta semana — vive desde el commit `5357945`.

---

## Causa raíz

Postgres, durante `UPDATE … RETURNING` (Supabase JS dispara esto cada vez que se llama `.update(...).select(...).maybeSingle()`), aplica al NEW row la combinación lógica de las USING de **todas las policies aplicables**, no sólo el WITH CHECK del UPDATE. Por eso una policy SELECT restrictiva (con `deleted_at IS NULL`) bloquea un soft-delete que en principio sólo debería ser regulado por la policy UPDATE.

El bug no es de Postgres ni de Supabase — el comportamiento es por diseño. Es **nuestra modelización** de RLS la que no contemplaba el soft-delete del propio autor.

---

## Fix aplicado

Migración `20260521222957_fix_student_select_own_notes_any_state.sql`:

```sql
CREATE POLICY "Student select own notes any state"
  ON public.notes
  FOR SELECT
  TO authenticated
  USING (author_id = auth.uid() AND author_role = 'student');
```

Esta policy es **estrictamente** acotada al autor (`author_id = auth.uid() AND author_role = 'student'`), sin condición sobre `deleted_at`. Eso permite que el NEW row del soft-delete pase el chequeo de SELECT combinado.

**Por qué no expone notas borradas al alumno en la UI:** el front filtra `.is('deleted_at', null)` en las queries de lista (`notes/api.js`), así que la nota desaparece visualmente tras el soft-delete igual que antes. Lo único que cambia es que el RETURNING del `softDeleteNote` se completa sin error, y el `onDeleted?.(note.id)` que ya estaba en `NoteCard.jsx` (commit `afb3ea7`) sigue siendo el camino del optimistic remove para el caso en que realtime no emita el UPDATE.

---

## Verificación

Después de `apply_migration`, mismo test del paso 3:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d7a1ceb5-80fa-4cb9-8477-126bb71f8081","role":"authenticated"}';
update public.notes set deleted_at = now()
where id = '4462fa6a-bba1-4c3b-a9f4-48423eb357bf'
returning id, deleted_at;
rollback;
-- 4462fa6a-... | 2026-05-21 22:33:58.837236+00  ← devuelve la fila
```

Franco verificó manualmente en `gym-appv2.vercel.app` que las dos notas "prueba" desaparecen al apretar borrar.

---

## Alternativas descartadas

**B) Quitar `deleted_at IS NULL` del USING de la policy `Student read shared notes of own thread`.**
- Pro: menos policies activas.
- Con: cambia la visibilidad de notas soft-deleted **del coach** vistas por el student (hoy no las ve; con este cambio sí las vería hasta que el front las filtre). Más invasivo.

**C) RPC `delete_note(p_id)` con `SECURITY DEFINER`.**
- Pro: bypass de RLS contenido a una función auditada.
- Con: agrega superficie (otra RPC en `notes_*`), forks el flujo de cliente (`.update` para edit, `.rpc('delete_note')` para borrar), y deja la regla RLS "rota" para futuros casos similares. Más mantenimiento por un caso puntual.

**A elegida:** policy SELECT adicional. Sin condiciones nuevas en la lógica del front, sin nuevas RPCs.

---

## Lecciones (para el próximo agente)

1. **`UPDATE … RETURNING` + RLS de soft-delete = trampa silenciosa.** Si una policy SELECT tiene una condición que el NEW row de un UPDATE legítimo no satisface (típicamente filtros de "tombstone" como `deleted_at IS NULL` o `is_archived = false`), Postgres tira `42501` sobre el UPDATE aunque la policy UPDATE explícitamente no chequee esa columna. **Patrón a vigilar:** cualquier tabla que (a) tenga RLS, (b) use soft-delete, (c) tenga una SELECT policy filtrando por la columna de soft-delete, y (d) el front haga `.update(...).select(...)`. En el schema actual: `notes` (resuelto acá), revisar también `notifications` y `evaluation_results` si en algún momento agregamos soft-delete ahí.

2. **El handoff `10_*` decía "Tier 1 ~85%, falta solo `auth_leaked_password_protection` y revisar RPCs anon".** Esta noche apareció un bug de RLS que ningún handoff ni health check estaba mirando. **Moraleja:** los porcentajes de cobertura del Tier 1 son por advisor de Supabase, no por correctitud funcional. La cobertura real requiere smoke tests de RLS más exhaustivos. Pendiente para el Tier 1 verdadero: agregar a `supabase/tests/rls_smoke_tests.sql` un caso "student soft-deletes own note".

3. **Reproducir RLS sin loguearse vale oro.** El patrón `SET LOCAL request.jwt.claims = '{"sub":"<uid>","role":"authenticated"}'` dentro de una `BEGIN; … ROLLBACK;` permite simular cualquier user en el MCP de Supabase sin tocar data y sin pedirle al usuario que se loguee en el browser. Próxima vez que aparezca un "no puedo X en prod" donde X involucra una tabla con RLS, esta es la primera herramienta a sacar.

4. **El conteo de "deletions exitosos" en una tabla con soft-delete es un canary barato.** `select count(*) filter (where deleted_at is not null) from notes group by author_role, date_trunc('day', deleted_at)` mostró el cliff del 17/05 en 3 segundos. Si en el futuro reaparece una asimetría coach/student o un día sin deletions, levantar la mano antes de que el usuario lo note.

---

## Pendientes derivados

- **Smoke test de RLS para soft-delete student.** Agregar a `supabase/tests/rls_smoke_tests.sql` un caso que ejecute como student y verifique `update notes set deleted_at = now() … returning *` devuelve una fila (no error). Sugerido para el próximo Tier 1 batch.
- **Revisión de policies análogas en otras tablas.** `notifications` tiene `deleted_at` (advisor sí, real no, ver `02_*`). Verificar si las policies SELECT tienen filtros sobre columnas que se modifican en UPDATEs legítimos.
- **Migration #23 está aplicada en prod (`apply_migration` directo) pero la entrada `.sql` en el repo queda pendiente de commit.** El `git add` ya se hizo; falta `git commit` y `git push`. El estado en Supabase y en el repo van a converger en el push.

---

## Referencias

- Commit `afb3ea7` — fix de front del 21/05 PM (`removeNoteLocally`, `onDeleted`).
- Commit `5357945` — refactor multi-coach del 17/05 que introdujo el modelo de threads y la policy con `deleted_at IS NULL`.
- Handoff `10_handoff_proximo_agente_2026-05-21_pm.md` — estado del repo al cierre de Tier 3.2 (este fix llega después).
- Changelog `01_changelog_back.md` § Día 8 (entrada #23).
