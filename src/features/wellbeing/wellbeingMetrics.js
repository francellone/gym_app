// ============================================================
// wellbeingMetrics.js
// ------------------------------------------------------------
// Definición de las 6 métricas de wellbeing + helper de color.
// Módulo PURO (sin React, sin Supabase): lo consumen tanto el modal
// del alumno como la lógica de resumen para el coach
// (wellbeingSummaryLogic) y los tests, que no deberían arrastrar
// el árbol de imports de un componente sólo para leer las métricas.
//
// WellbeingModal re-exporta WELLBEING_METRICS y wellbeingColor para
// no romper los imports existentes.
// ============================================================

// ─────────────────────────────────────────────────────────────
// Definición de las 6 métricas
// positive: true  → 10 es óptimo (sueño, nutrición, hidratación, energía)
// positive: false → 10 es crítico (estrés, fatiga muscular)
// ─────────────────────────────────────────────────────────────
// `label`/`lowLabel`/`highLabel` quedan en español como fallback para las
// vistas del coach (StudentWellbeingTab) que no pasan por i18n.
// Las vistas del alumno (este modal, ProgressPage, WellbeingCard) usan
// `labelKey`/`lowLabelKey`/`highLabelKey` con t(...).
export const WELLBEING_METRICS = [
  {
    key: 'sleep_quality',
    label: 'Calidad de sueño',
    labelKey: 'wellbeing.sleepQuality',
    emoji: '😴',
    positive: true,
    lowLabel: 'Muy malo',
    lowLabelKey: 'wellbeing.sleepLow',
    highLabel: 'Excelente',
    highLabelKey: 'wellbeing.sleepHigh',
  },
  {
    key: 'nutrition_quality',
    label: 'Calidad de alimentación',
    labelKey: 'wellbeing.nutritionQuality',
    emoji: '🥗',
    positive: true,
    lowLabel: 'Muy mala',
    lowLabelKey: 'wellbeing.nutritionLow',
    highLabel: 'Excelente',
    highLabelKey: 'wellbeing.nutritionHigh',
  },
  {
    key: 'hydration_quality',
    label: 'Hidratación',
    labelKey: 'wellbeing.hydrationQuality',
    emoji: '💧',
    positive: true,
    lowLabel: 'Muy poca',
    lowLabelKey: 'wellbeing.hydrationLow',
    highLabel: 'Perfecta',
    highLabelKey: 'wellbeing.hydrationHigh',
  },
  {
    key: 'energy_level',
    label: 'Nivel de energía',
    labelKey: 'wellbeing.energyLevel',
    emoji: '⚡',
    positive: true,
    lowLabel: 'Sin energía',
    lowLabelKey: 'wellbeing.energyLow',
    highLabel: 'Muy energizado',
    highLabelKey: 'wellbeing.energyHigh',
  },
  {
    key: 'stress_level',
    label: 'Nivel de estrés',
    labelKey: 'wellbeing.stressLevel',
    emoji: '😓',
    positive: false,
    lowLabel: 'Sin estrés',
    lowLabelKey: 'wellbeing.stressLow',
    highLabel: 'Muy estresado',
    highLabelKey: 'wellbeing.stressHigh',
  },
  {
    key: 'muscle_fatigue',
    label: 'Dolor / fatiga muscular',
    labelKey: 'wellbeing.muscleFatigue',
    emoji: '🦵',
    positive: false,
    lowLabel: 'Sin fatiga',
    lowLabelKey: 'wellbeing.fatigueLow',
    highLabel: 'Muy fatigado',
    highLabelKey: 'wellbeing.fatigueHigh',
  },
]

// Devuelve clases de color según valor y tipo de métrica
export function wellbeingColor(value, positive) {
  if (!value) return 'bg-gray-100 text-gray-500'
  if (positive) {
    if (value >= 8) return 'bg-green-500 text-white'
    if (value >= 5) return 'bg-yellow-400 text-gray-800'
    return 'bg-red-400 text-white'
  } else {
    // Para estrés y fatiga: alto es malo
    if (value >= 8) return 'bg-red-500 text-white'
    if (value >= 5) return 'bg-orange-400 text-white'
    return 'bg-green-500 text-white'
  }
}

// Etiquetas cortas para vistas compactas del coach (tarjetas del panel,
// filas de la lista). Las largas de arriba no entran en un tile.
export const WELLBEING_SHORT_LABELS = {
  sleep_quality: 'Sueño',
  nutrition_quality: 'Alimentación',
  hydration_quality: 'Hidratación',
  energy_level: 'Energía',
  stress_level: 'Estrés',
  muscle_fatigue: 'Fatiga',
}
