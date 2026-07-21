# Biblioteca de ejercicios bilingüe — para revisión de Anto

Ejecutado 2026-07-13 según `docs/handoff-exercises-en-backfill.md`.
Backup: tabla `exercises_backup_20260713` (borrar cuando Anto valide).

## Qué se hizo

- **318/318 ejercicios** tienen ahora `i18n.en.name`.
- **306** tienen nota técnica en español (`technique_notes`) **y** en inglés
  (`i18n.en.technique_notes`). Los 12 restantes no tenían ningún texto (BICI FIJA,
  DIPS, Kettlebell Swing, weight pancake, SINGLE HOP PLATE, etc.).
- **`description` quedó vacía en toda la tabla**: todo lo que había ahí era "cómo se
  hace", no "qué es" → se movió a `technique_notes` (si estaba en español) o a
  `i18n.en.technique_notes` (si estaba en inglés). Ningún ejercicio perdió texto.
- Los pares espejados (desc EN + nota ES) se respetaron: la versión inglesa de Anto
  pasó tal cual a `i18n.en.technique_notes`, sin retraducir.
- `video_url`, tags y defaults: intactos.

**Todas las traducciones generadas son borradores.** El español es el canónico; el
alumno EN solo ve la traducción.

## Nombres que cambiaron (17)

Eran los "X / Y" bilingües: se dejó la mitad española como nombre canónico y la
inglesa en `i18n.en.name`. El resto de los nombres quedó **igual que antes** (los
nombres en inglés muy instalados como jerga de gym —Leg Press, TRX Row, Pallof
Press, Chin Ups— se conservaron como canónico y como `en.name`).

| Antes                                                                       | Ahora (canónico)                      | `en.name`                           |
| --------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------- |
| Hinge hip / Bisagra cadera                                                  | Bisagra de cadera                     | Hip Hinge                           |
| Hamstring Curl / Camilla de isquios                                         | Camilla de isquios                    | Hamstring Curl                      |
| Walking treadmill / Caminar Cinta                                           | Caminar Cinta                         | Walking Treadmill                   |
| Carpa / Upward Dog to Downward Dog                                          | Carpa                                 | Upward Dog to Downward Dog          |
| Running TreadMill / Correr cinta                                            | Correr cinta                          | Running Treadmill                   |
| Stability /Estabilidad                                                      | Estabilidad                           | Stability                           |
| Hip Flexibility/ Flexibilidad cadera                                        | Flexibilidad de cadera                | Hip Flexibility                     |
| FROG WINDMILL / Molino Con Aductor                                          | Molino Con Aductor                    | Frog Windmill                       |
| Shoulder Mobility /Movilidad de hombro                                      | Movilidad de hombro                   | Shoulder Mobility                   |
| Shoulder press w mini band / press de hombro con mini banda                 | Press de hombro con mini banda        | Shoulder Press w/ Mini Band         |
| Seated Cable Row / Remo en maquina                                          | Remo en máquina                       | Seated Cable Row                    |
| Vertical Jump / Salto Vertical                                              | Salto Vertical                        | Vertical Jump                       |
| SQUAT / SENTADILLA                                                          | SENTADILLA                            | Squat                               |
| Sentadilla con salto y mancuernas / Dumbbell Jump Squat                     | Sentadilla con salto y mancuernas     | Dumbbell Jump Squat                 |
| Barbell Sumo Squat (From the Floor) / Sentadilla sumo con barra desde suelo | Sentadilla sumo con barra desde suelo | Barbell Sumo Squat (From the Floor) |
| ANKLE / TOBILLO                                                             | TOBILLO                               | Ankle                               |
| light jog treadmill / trote suave cinta                                     | Trote suave en cinta                  | Light Jog Treadmill                 |

## Casos dudosos (que decida Anto)

1. **"Sentadilla sumo con barra desde suelo"**: la nota en español estaba incompleta
   (solo "Posición inicial", sin "Ejecución"). Se completó traduciendo la parte que
   faltaba de la versión inglesa. Revisar que diga lo que quiere.
2. **Dos ejercicios se llaman ahora "TOBILLO"**: el que ya se llamaba así (nota corta:
   "tiro rodilla lo más adelante posible") y el ex "ANKLE / TOBILLO" (protocolo de
   evaluación con medición en cm). Conviene renombrar uno, p. ej. "TOBILLO (evaluación)".
3. **"1/2 Kneel Lateral Bound"**: era el único caso viejo con la nota en inglés en
   `description`. Se generó la nota en español a partir de ella.
4. **Traducciones de nombres inventadas** donde no hay jerga establecida — revisar si le
   suenan: Ajuste Colgada → _Hanging Scapular Shrug_; Chinito → _Deep Squat Hold_;
   Ruedita → _Ab Wheel Rollout_; Triple Amenaza → _Triple Threat_; Peso Muerto Cabra →
   _Goat Belly Deadlift_; Reloj en suelo → _Floor Clock_; Camilla cuádriceps →
   _Leg Extension Machine_; Estrella con conos → _Star Drill with Cones_.
5. **Duplicados de ejercicios** (mismo ejercicio cargado 2-3 veces con distinta
   capitalización: Chinito/CHINITO, Jefferson x3, Lift/LIFT…). No se tocaron; si quiere
   limpiarlos es otra tarea (hay que remapear `plan_exercises`).
