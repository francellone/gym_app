# 47 — Plan de smoke: vista del alumno en inglés (doc 46)

**Fecha:** 2026-06-13
**Para:** el agente que corra el smoke en una sesión futura
**Contexto:** el i18n de la vista del alumno (doc 46, fases 1-3) ya está pusheado a `main` (commit `9e6db7f`) y deployado en prod. Falta validar en producción que la vista del alumno se ve correcta en inglés. El panel de la coach queda en español a propósito.

## Pre-flight (obligatorio antes de tocar nada)

1. Browser: usar **francellone** (hay 2 conectados; deviceId 5c324fc5-...). Ver `[[project_browser_francellone]]`.
2. Supabase MCP apuntando a **bvexjanqmfypmtgoapbt** (org gymorg).
3. Prod: **gym-appv2.vercel.app**. Confirmar que el deploy de `9e6db7f` terminó (Vercel) antes de empezar.

## Objetivo del smoke

Recorrer la vista del alumno con un usuario en `language='en'` y confirmar que NO queda texto en español (más allá de la deuda conocida en doc 46) y que nada se rompe de layout.

## Pasos

### 1. Crear el usuario de prueba en inglés
Dos caminos, elegir uno:

- **Vía UI de coach (preferido, valida también el selector de alta):** logueado como coach (Anto o el usuario de Franco), ir a Alumnos → Nuevo alumno. Completar con email y contraseña conocidos (ej. `smoke_en@test.com` / una pass que el agente fije y anote en el chat, NO en este doc). En el form elegir **Idioma de la app = Inglés**. Guardar. Marcarlo como test si se puede.
- **Vía SQL (más rápido si ya existe un alumno de prueba):** tomar un `profiles` con `is_test=true` (hay 4 al 2026-06-13, todos en 'es') y `update profiles set language='en' where id='<id>'`. Para entrar hay que tener su contraseña — pedirla a Franco o resetearla.

### 2. Cerrar sesión de coach y entrar como el alumno
- Desde el panel de coach: Perfil → Cerrar sesión (debe volver al login **en español**, porque al desloguear AuthContext resetea i18n a 'es' — verificar esto de paso).
- Loguearse con las credenciales del alumno de prueba en inglés.
- Al cargar el perfil, AuthContext hace `i18n.changeLanguage('en')` → toda la vista del alumno debe pasar a inglés.

### 3. Checklist de pantallas (todo en inglés)

- [ ] **Nav inferior**: Home / Today / Notes / Progress / History / Profile.
- [ ] **Dashboard**: saludo según hora (Good morning/afternoon/evening), racha ("N day streak"), "This week" + iniciales de días en inglés, "How many times you did each day", banners de formularios pendientes si los hay, "Today's workout", accesos "Progress"/"History".
- [ ] **Today's workout (rutina del día)**: títulos de bloques, cards de ejercicio (sets, reps, weight, rest), supersets ("Block X · no rest..."), warnings (PSE/barra), "Mark as completed", modal de desmarcar, modal de PSE diario, fecha del header en formato inglés.
- [ ] **Progress**: tabs, títulos de gráficos, leyendas/tooltips de recharts, heatmap de asistencia (iniciales M,T,W...), empty states, métricas de wellbeing.
- [ ] **History**: encabezados, resumen por sesión, "Last time / N days ago".
- [ ] **Notes**: composer, filtros, badges de contexto (Log/Assessment/etc.), tarjetas.
- [ ] **Wellbeing**: modal "How are you arriving today?", métricas, low/high labels.
- [ ] **Forms** (si hay alguno asignado): chrome (Back/Continue/Submit/progreso). Las preguntas en sí quedan en el idioma que las cargó la coach (es esperado).
- [ ] **Profile**: card "App language" con Español/English (el activo marcado), labels de datos, validaciones, cambiar contraseña, "Sign out".
- [ ] **Notificaciones** (campana): chrome en inglés; el texto de cada notif queda en el idioma en que se generó (esperado).

### 4. Edge cases a probar
- [ ] En Profile, tocar **Español** → toda la vista vuelve a español en vivo, sin recargar. Volver a English.
- [ ] Cerrar sesión estando en inglés → el login aparece en español.
- [ ] Un ejercicio con "última vez" registrada → debe decir "today/yesterday/N days ago" en inglés (fix de exerciseHistoryLogic).
- [ ] Forzar un error de guardado si es viable (ej. dato inválido) → el banner sale en inglés (fix de errorHelpers).

### 5. Limpieza post-smoke
- Si se creó un alumno nuevo solo para esto: desactivarlo/archivarlo o dejarlo marcado `is_test=true`.
- Si se flipeó un alumno de prueba existente a 'en': volverlo a `language='es'` salvo que Franco quiera dejarlo.
- Reportar a Franco: qué se vio bien, qué texto quedó en español (cruzar con la "Deuda restante" del doc 46 para distinguir bug nuevo de deuda conocida), cualquier layout roto por textos largos.

## Notas
- Deuda conocida (NO es bug): labels de `plans/helpers.js` (secciones, modos de peso, zonas aeróbicas), `PSE_OPTIONS` de `workouts/helpers.js`, y el texto de notificaciones viejas. Ver doc 46 "Deuda restante".
- Si aparece texto en español fuera de esa lista → es regresión, anotarlo con archivo/pantalla.
