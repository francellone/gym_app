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

export function displayValue(field, value) {
  if (!value && value !== 0) return '—'
  if (field === 'gender') return GENDER_LABELS[value] || value
  if (field === 'level') return LEVEL_LABELS[value] || value
  return String(value)
}
