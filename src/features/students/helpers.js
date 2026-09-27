/**
 * Labels y helpers compartidos entre tabs del detalle de alumno.
 * Separados para evitar duplicación entre StudentInfoTab y StudentHistoryTab.
 */

export const FIELD_LABELS = {
  name: 'Nombre',
  weight_kg: 'Peso (kg)',
  height_cm: 'Altura (cm)',
  birth_date: 'Fecha de nacimiento',
  gender: 'Sexo',
  goal: 'Objetivo',
  weekly_frequency: 'Frecuencia semanal',
  level: 'Nivel',
  observations: 'Observaciones',
  coach_notes: 'Notas privadas',
  target_weight_kg: 'Peso objetivo',
  dni: 'DNI',
  // Salud (handoff 2.6 — CHECK profiles_lesiones_requires_detail)
  tiene_lesiones: 'Tiene lesiones',
  descripcion_lesiones: 'Descripción de lesiones',
  patologias: 'Patologías',
  // Doc 46: idioma de la UI de la vista del alumno
  language: 'Idioma de la app',
  // v33: modalidad de uso (online / híbrido / solo coach)
  modality: 'Modalidad',
  // v40: estado del perfil (activo/inactivo) para gestión del coach
  active: 'Estado',
}

// Opciones canónicas de patologías. Coincide con el catálogo del intake
// (default-form.js) para que coach y alumno vean el mismo set.
export const PATOLOGIAS_OPTIONS = [
  'Hipertensión',
  'Diabetes tipo 1',
  'Diabetes tipo 2',
  'Obesidad',
  'Problemas cardíacos',
  'Problemas respiratorios',
  'Problemas articulares',
  'Ninguna',
]

// i18n: el valor canónico (español) es lo que se guarda; para mostrarlo se
// traduce con la clave de la vista de la persona (profile.pathologyOptions.*).
export const PATOLOGIA_KEYS = {
  Hipertensión: 'hypertension',
  'Diabetes tipo 1': 'diabetes1',
  'Diabetes tipo 2': 'diabetes2',
  Obesidad: 'obesity',
  'Problemas cardíacos': 'heartProblems',
  'Problemas respiratorios': 'respiratoryProblems',
  'Problemas articulares': 'jointProblems',
  Ninguna: 'none',
}

export function patologiaLabel(value, t) {
  const k = PATOLOGIA_KEYS[value]
  return k && t ? t(`profile.pathologyOptions.${k}`) : value
}

export const LEVEL_LABELS = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
}

export const GENDER_LABELS = {
  male: 'Masculino',
  female: 'Femenino',
  other: 'Otro',
}

// Doc 46: idioma de la UI del alumno (profiles.language). Labels en español
// porque el panel del coach queda en español a propósito.
export const LANGUAGE_LABELS = {
  es: 'Español',
  en: 'Inglés',
}

// v33: modalidad de uso del alumno (profiles.modality). Valores canónicos
// en la BD (CHECK modality IN (...)); labels en español para el panel coach.
export const MODALITY_LABELS = {
  online: 'Online (usa la app)',
  hybrid: 'Híbrido (presencial + app)',
  coach_only: 'Solo coach (el coach registra todo)',
}

// Sin `t`: español (así se guarda en student_edit_history, que es un
// registro histórico: NO pasarle `t` al armar old_value/new_value).
// Con `t`: para mostrar en el idioma de la coach.
export function displayValue(field, value, t) {
  if (t) return displayValueT(field, value, t)
  // 'active' va antes del early-return porque false es un valor válido
  // y null/undefined cuentan como activo (default true en la BD).
  if (field === 'active') {
    return value === false || value === 'false' ? 'Inactivo' : 'Activo'
  }
  if (value === null || value === undefined || value === '') return '—'
  if (field === 'gender') return GENDER_LABELS[value] || value
  if (field === 'level') return LEVEL_LABELS[value] || value
  if (field === 'language') return LANGUAGE_LABELS[value] || value
  if (field === 'modality') return MODALITY_LABELS[value] || value
  if (field === 'tiene_lesiones') {
    if (value === true || value === 'true') return 'Sí'
    if (value === false || value === 'false') return 'No'
    return '—'
  }
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '—'
  if (value === 0) return '0'
  if (!value) return '—'
  return String(value)
}

const LABEL_MAPS = {
  gender: GENDER_LABELS,
  level: LEVEL_LABELS,
  language: LANGUAGE_LABELS,
  modality: MODALITY_LABELS,
}

function displayValueT(field, value, t) {
  if (field === 'active') {
    return value === false || value === 'false'
      ? t('coach.students.activeStatus.inactive')
      : t('coach.students.activeStatus.active')
  }
  if (value === null || value === undefined || value === '') return '—'
  if (LABEL_MAPS[field]) {
    return LABEL_MAPS[field][value] ? t(`coach.students.${field}Options.${value}`) : value
  }
  if (field === 'tiene_lesiones') {
    if (value === true || value === 'true') return t('common.yes')
    if (value === false || value === 'false') return t('common.no')
    return '—'
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '—'
    return field === 'patologias'
      ? value.map((v) => patologiaLabel(v, t)).join(', ')
      : value.join(', ')
  }
  if (value === 0) return '0'
  if (!value) return '—'
  return String(value)
}

// Evalúa si los datos de salud del alumno satisfacen el CHECK del back
// (profiles_lesiones_requires_detail). Si retorna mensaje no-null, el front
// debe bloquear el guardado y mostrarlo (sin esperar al rebote del back).
export function validateLesionesConsistency(
  { tiene_lesiones, descripcion_lesiones, patologias },
  t
) {
  if (tiene_lesiones !== true && tiene_lesiones !== 'true') return null
  const desc = (descripcion_lesiones || '').trim()
  if (desc) return null
  const pats = Array.isArray(patologias) ? patologias : []
  const hasRealPat = pats.length > 0 && pats.some((p) => p !== 'Ninguna')
  if (hasRealPat) return null
  if (t) return t('coach.students.info.injuriesDetailError')
  return 'Si marcaste que tenés lesiones, completá la descripción o seleccioná al menos una patología.'
}

// Traduce un error de Supabase a un mensaje amigable cuando es el CHECK
// de lesiones. Para cualquier otro error, devuelve null y el caller maneja.
export function lesionesCheckErrorMessage(error, t) {
  if (!error) return null
  const code = error.code || error?.details?.code
  const msg = error.message || ''
  if (code === '23514' && /profiles_lesiones_requires_detail/i.test(msg)) {
    if (t) return t('coach.students.info.injuriesDetailError')
    return 'Si marcaste que tenés lesiones, completá la descripción o seleccioná al menos una patología.'
  }
  return null
}

// ─────────────────────────────────────────────────────────────
// v40: estado activo/inactivo del perfil (profiles.active)
// ─────────────────────────────────────────────────────────────

// null/undefined cuentan como activo (la columna tiene default true).
export function isProfileActive(profile) {
  return profile?.active !== false
}

/**
 * Filtra/ordena la lista de alumnos según el filtro de estado.
 * activeFilter: 'active' (default) | 'inactive' | 'all'
 * En 'all' los activos van primero; el sort es estable, así que se
 * preserva el orden alfabético que ya trae el fetch.
 */
export function filterByActiveStatus(students, activeFilter) {
  const list = students || []
  if (activeFilter === 'inactive') return list.filter((s) => !isProfileActive(s))
  if (activeFilter === 'all') {
    return [...list].sort((a, b) => Number(isProfileActive(b)) - Number(isProfileActive(a)))
  }
  return list.filter((s) => isProfileActive(s))
}
