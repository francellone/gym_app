// ============================================================
// Evaluation System Helpers
// ============================================================

export const EVAL_TYPES = [
  {
    key: 'movement_screen',
    label: 'Pantalla de Movimiento',
    description: 'Evaluación funcional por patrones (squat, hip hinge, push)',
    icon: '🔍',
    color: 'purple',
  },
  {
    key: 'strength_amrap',
    label: 'Fuerza / AMRAP',
    description: 'Récord de máximas repeticiones o peso máximo',
    icon: '💪',
    color: 'red',
  },
  {
    key: 'flexibility_rom',
    label: 'Flexibilidad / ROM',
    description: 'Rango de movimiento articular en grados',
    icon: '🤸',
    color: 'green',
  },
  {
    key: 'jump',
    label: 'Salto',
    description: 'Altura de salto vertical (cm)',
    icon: '⬆️',
    color: 'yellow',
  },
  {
    key: 'cardio_cooper',
    label: 'Test de Cooper',
    description: 'Distancia recorrida en 12 minutos (m)',
    icon: '🏃',
    color: 'blue',
  },
  {
    key: 'body_comp',
    label: 'Composición Corporal',
    description: 'Pliegues cutáneos y mediciones antropométricas',
    icon: '📏',
    color: 'orange',
  },
  {
    key: 'custom',
    label: 'Personalizado',
    description: 'Evaluación libre con campos personalizables',
    icon: '✏️',
    color: 'gray',
  },
]

// ---- Movement Screen ----------------------------------------
// Each pattern has criteria checked per side (I = Izquierda, D = Derecha)
// Value options per criterion: 'bien' | 'leve' | 'moderado' | 'severo' | null

export const MOVEMENT_SCREEN_PATTERNS = [
  {
    key: 'squat',
    label: 'Sentadilla',
    criteria: [
      { key: 'apoyo_pie', label: 'Apoyo de pie' },
      { key: 'movilidad_tobillo', label: 'Movilidad tobillo' },
      { key: 'estabilidad_rodilla', label: 'Estabilidad rodilla' },
      { key: 'movilidad_cadera', label: 'Movilidad cadera' },
      { key: 'estabilidad_lumbar', label: 'Estabilidad lumbar' },
      { key: 'movilidad_toracica', label: 'Movilidad torácica' },
    ],
  },
  {
    key: 'hip_hinge',
    label: 'Peso Muerto / Hip Hinge',
    criteria: [
      { key: 'apoyo_pie', label: 'Apoyo de pie' },
      { key: 'movilidad_tobillo', label: 'Movilidad tobillo' },
      { key: 'estabilidad_rodilla', label: 'Estabilidad rodilla' },
      { key: 'movilidad_cadera', label: 'Movilidad cadera' },
      { key: 'estabilidad_lumbar', label: 'Estabilidad lumbar' },
    ],
  },
  {
    key: 'push',
    label: 'Push Up / Empuje',
    criteria: [
      { key: 'estabilidad_escapulas', label: 'Estabilidad escápulas' },
      { key: 'estabilidad_codo', label: 'Estabilidad codo' },
      { key: 'movilidad_hombro', label: 'Movilidad hombro' },
      { key: 'estabilidad_lumbar', label: 'Estabilidad lumbar' },
      { key: 'movilidad_toracica', label: 'Movilidad torácica' },
    ],
  },
]

export const SCREEN_SCORES = [
  { value: 'bien', label: 'Bien', color: 'bg-green-100 text-green-700' },
  { value: 'leve', label: 'Leve', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'moderado', label: 'Mod.', color: 'bg-orange-100 text-orange-700' },
  { value: 'severo', label: 'Sev.', color: 'bg-red-100 text-red-700' },
]

// ---- Strength / AMRAP --------------------------------------
// results shape: { exercises: [{ name, reps, weight, date, notes }] }

// ---- Flexibility / ROM ------------------------------------
// results shape: { measurements: [{ zone, left_deg, right_deg, notes }] }
export const ROM_ZONES = [
  { key: 'flexion_cadera', label: 'Flexión de cadera' },
  { key: 'extension_cadera', label: 'Extensión de cadera' },
  { key: 'abduccion_cadera', label: 'Abducción de cadera' },
  { key: 'flexion_hombro', label: 'Flexión de hombro' },
  { key: 'rotacion_interna_hombro', label: 'Rot. interna hombro' },
  { key: 'rotacion_externa_hombro', label: 'Rot. externa hombro' },
  { key: 'dorsiflexion_tobillo', label: 'Dorsiflexión tobillo' },
  { key: 'flexion_rodilla', label: 'Flexión de rodilla' },
  { key: 'flexion_columna', label: 'Flexión columna' },
]

// ---- Body Composition -------------------------------------
// results shape: { weight_kg, body_fat_pct, muscle_mass_kg, skinfolds: { triceps, subescapular, ... }, notes }
export const SKINFOLD_SITES = [
  { key: 'triceps', label: 'Tríceps (mm)' },
  { key: 'subescapular', label: 'Subescapular (mm)' },
  { key: 'suprailiaco', label: 'Suprailiaco (mm)' },
  { key: 'abdominal', label: 'Abdominal (mm)' },
  { key: 'muslo', label: 'Muslo (mm)' },
  { key: 'pectoral', label: 'Pectoral (mm)' },
]

// ---- Cooper Test ------------------------------------------
// results shape: { distance_m, time_min (always 12), heart_rate_end, notes }
export function cooperVO2Max(distance_m) {
  // Léger formula
  return ((distance_m / 1000 - 0.3138) / 0.0278).toFixed(1)
}

// ---- Jump -------------------------------------------------
// results shape: { height_cm, attempts: [{ cm, notes }], technique_notes }

// ---- Custom -----------------------------------------------
// results shape: { fields: [{ label, value, unit }], notes }

// ---- Colors per eval_type ---------------------------------
export function evalTypeColor(key) {
  const map = {
    movement_screen: 'bg-purple-100 text-purple-700',
    strength_amrap: 'bg-red-100 text-red-700',
    flexibility_rom: 'bg-green-100 text-green-700',
    jump: 'bg-yellow-100 text-yellow-700',
    cardio_cooper: 'bg-blue-100 text-blue-700',
    body_comp: 'bg-orange-100 text-orange-700',
    custom: 'bg-gray-100 text-gray-600',
  }
  return map[key] || 'bg-gray-100 text-gray-600'
}

export function evalTypeLabel(key) {
  return EVAL_TYPES.find(e => e.key === key)?.label || key
}

export function evalTypeIcon(key) {
  return EVAL_TYPES.find(e => e.key === key)?.icon || '📋'
}

// ---- Empty results templates ------------------------------
export function emptyResults(evalType) {
  switch (evalType) {
    case 'movement_screen':
      return {
        patterns: MOVEMENT_SCREEN_PATTERNS.map(p => ({
          key: p.key,
          criteria: p.criteria.reduce((acc, c) => {
            acc[c.key] = { left: null, right: null, obs: '' }
            return acc
          }, {}),
          obs: '',
        })),
        general_notes: '',
      }
    case 'strength_amrap':
      return { exercises: [], notes: '' }
    case 'flexibility_rom':
      return {
        measurements: ROM_ZONES.map(z => ({
          zone: z.key,
          left_deg: '',
          right_deg: '',
          notes: '',
        })),
        notes: '',
      }
    case 'jump':
      return { attempts: [{ cm: '', notes: '' }], technique_notes: '' }
    case 'cardio_cooper':
      return { distance_m: '', heart_rate_end: '', notes: '' }
    case 'body_comp':
      return {
        weight_kg: '',
        body_fat_pct: '',
        muscle_mass_kg: '',
        skinfolds: SKINFOLD_SITES.reduce((acc, s) => { acc[s.key] = ''; return acc }, {}),
        notes: '',
      }
    case 'custom':
      return { fields: [{ label: '', value: '', unit: '' }], notes: '' }
    default:
      return {}
  }
}
