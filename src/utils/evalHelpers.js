// ============================================================
// Evaluation System Helpers – v2
// Tipos: one_rm | max_reps | power | cardio | body_comp | scored | custom
// ============================================================

export const EVAL_TYPES = [
  {
    key: 'one_rm',
    label: 'Fuerza Máxima (1RM)',
    description: 'Estimación de 1RM por fórmula a partir de peso × reps',
    icon: '🏋️',
    color: 'red',
  },
  {
    key: 'max_reps',
    label: 'Fuerza-Resistencia',
    description: 'Máximas repeticiones hasta el fallo o en tiempo fijo',
    icon: '💪',
    color: 'orange',
  },
  {
    key: 'power',
    label: 'Potencia',
    description: 'Potencia explosiva en saltos y sprints',
    icon: '⚡',
    color: 'yellow',
  },
  {
    key: 'cardio',
    label: 'Resistencia Cardiovascular',
    description: 'Estimación de VO₂max por test de campo',
    icon: '🏃',
    color: 'blue',
  },
  {
    key: 'body_comp',
    label: 'Composición Corporal',
    description: 'Porcentaje graso y masa magra por pliegues o perímetros',
    icon: '📏',
    color: 'green',
  },
  {
    key: 'scored',
    label: 'Funcional / Movilidad',
    description: 'Evaluación por puntajes (FMS, sit & reach, movilidad)',
    icon: '🔍',
    color: 'purple',
  },
  {
    key: 'custom',
    label: 'Personalizado',
    description: 'Campos libres para cualquier métrica',
    icon: '✏️',
    color: 'gray',
  },
]

// ============================================================
// MÉTODOS POR TIPO
// ============================================================

export const METHODS = {
  one_rm: [
    { key: 'brzycki', label: 'Brzycki', note: 'Alta precisión 2–10 reps' },
    { key: 'epley',   label: 'Epley',   note: 'Sobreestima en pocas reps' },
    { key: 'lander',  label: 'Lander',  note: 'Buen rango general' },
    { key: 'lombardi',label: 'Lombardi',note: 'Tiende a subestimar' },
    { key: 'mayhew',  label: 'Mayhew',  note: 'Validada en fútbol americano' },
  ],
  max_reps: [
    { key: 'pushup',   label: 'Push-up test',         note: 'Reps hasta el fallo' },
    { key: 'situp',    label: 'Sit-up (1 min)',        note: 'Abdominales en 60 seg' },
    { key: 'pullup',   label: 'Pull-up / Chin-up',    note: 'Dominadas ininterrumpidas' },
    { key: 'submax',   label: 'Rep-max submáximo',     note: 'Ej. máx reps al 75%' },
  ],
  power: [
    { key: 'lewis',       label: 'Lewis (salto)',    note: 'Potencia media. √(4.9 × m × h)' },
    { key: 'harman',      label: 'Harman (salto)',   note: 'Potencia pico y media' },
    { key: 'broad_jump',  label: 'Broad Jump',       note: 'Salto horizontal (distancia)' },
    { key: 'sprint',      label: 'Sprint 10/20/30m', note: 'Tiempo en distancias cortas' },
  ],
  cardio: [
    { key: 'cooper',   label: 'Cooper (12 min)',    note: 'VO₂max = (d−504.9)/44.73' },
    { key: 'rockport', label: 'Rockport (1 milla)', note: 'Tiempo + FC final' },
    { key: 'yoyo',     label: 'Test Yo-Yo',         note: 'Nivel alcanzado → VO₂max' },
    { key: 'beep',     label: 'Beep test (20m)',    note: 'Nivel + velocidad → VO₂max' },
    { key: 'harvard',  label: 'Harvard step test',  note: 'FC de recuperación' },
  ],
  body_comp: [
    { key: 'jp3',  label: 'Jackson-Pollock 3',        note: '3 pliegues + edad' },
    { key: 'jp7',  label: 'Jackson-Pollock 7',        note: '7 pliegues, mayor precisión' },
    { key: 'dw',   label: 'Durnin-Womersley',         note: '4 pliegues, popular en Europa' },
    { key: 'navy', label: 'Perímetros (Navy/YMCA)',    note: 'Solo perímetros y talla' },
  ],
  scored: [
    { key: 'fms',            label: 'FMS',              note: '7 patrones 0–3, total /21' },
    { key: 'sit_reach',      label: 'Sit & Reach',      note: 'Flexibilidad isquiosural (cm)' },
    { key: 'shoulder_mob',   label: 'Shoulder Mobility', note: 'Distancia manos detrás del cuerpo' },
    { key: 'y_balance',      label: 'Y-Balance test',   note: '3 vectores por lado' },
  ],
  custom: [
    { key: 'libre', label: 'Libre', note: 'Campos personalizables' },
  ],
}

// FMS patterns
export const FMS_PATTERNS = [
  { key: 'deep_squat',    label: 'Deep Squat',              bilateral: false },
  { key: 'hurdle_step',   label: 'Hurdle Step',             bilateral: true  },
  { key: 'inline_lunge',  label: 'Inline Lunge',            bilateral: true  },
  { key: 'shoulder_mob',  label: 'Shoulder Mobility',       bilateral: true  },
  { key: 'aslr',          label: 'Active Straight Leg Raise', bilateral: true },
  { key: 'trunk_push',    label: 'Trunk Stability Push-Up', bilateral: false },
  { key: 'rotary_stab',   label: 'Rotary Stability',        bilateral: true  },
]

// ============================================================
// FÓRMULAS DE CÁLCULO
// ============================================================

// --- 1RM ---
export function calc1RM(method, weight, reps) {
  const w = parseFloat(weight)
  const r = parseInt(reps)
  if (!w || !r || r < 1) return null
  if (r === 1) return w

  switch (method) {
    case 'brzycki':  return +(w * (36 / (37 - r))).toFixed(1)
    case 'epley':    return +(w * (1 + r / 30)).toFixed(1)
    case 'lander':   return +((100 * w) / (101.3 - 2.67 * r)).toFixed(1)
    case 'lombardi': return +(w * Math.pow(r, 0.10)).toFixed(1)
    case 'mayhew':   return +((100 * w) / (52.2 + 41.9 * Math.exp(-0.055 * r))).toFixed(1)
    default:         return null
  }
}

// --- Potencia ---
export function calcPower(method, inputs) {
  const { mass_kg, jump_cm, time_sec, distance_m } = inputs
  const m = parseFloat(mass_kg)
  const h = parseFloat(jump_cm) / 100  // convert to meters
  const t = parseFloat(time_sec)
  const d = parseFloat(distance_m)

  switch (method) {
    case 'lewis': {
      if (!m || !h) return null
      // Lewis nomogram: P (kgm/s) = √(4.9 × m × h); × 9.81 → watts
      const p = Math.sqrt(4.9 * m * h) * 9.81
      return { power_w: +p.toFixed(0), label: 'Potencia media (W)' }
    }
    case 'harman': {
      if (!m || !h) return null
      const peak = 61.9 * (parseFloat(jump_cm)) + 36.0 * m - 1822
      const mean = 21.2 * (parseFloat(jump_cm)) + 23.0 * m - 1393
      return { peak_w: +peak.toFixed(0), mean_w: +mean.toFixed(0) }
    }
    case 'broad_jump': {
      if (!d) return null
      return { distance_m: +d.toFixed(2), label: 'Distancia (m)' }
    }
    case 'sprint': {
      if (!t || !d) return null
      const speed = d / t
      return { time_sec: +t.toFixed(2), speed_ms: +speed.toFixed(2) }
    }
    default: return null
  }
}

// --- VO₂max ---
export function calcVO2max(method, inputs) {
  const { distance_m, weight_kg, age, sex, time_min, heart_rate,
          yoyo_level, beep_level, beep_speed,
          hr1, hr2, hr3, step_duration_sec } = inputs

  switch (method) {
    case 'cooper': {
      const d = parseFloat(distance_m)
      if (!d) return null
      return +((d - 504.9) / 44.73).toFixed(1)
    }
    case 'rockport': {
      const wKg = parseFloat(weight_kg)
      const a = parseFloat(age)
      const t = parseFloat(time_min)
      const hr = parseFloat(heart_rate)
      if (!wKg || !a || !t || !hr) return null
      const wLb = wKg * 2.20462
      const sexFactor = sex === 'male' ? 6.315 : 0
      return +(132.853 - 0.0769 * wLb - 0.3877 * a + sexFactor - 3.2649 * t - 0.1565 * hr).toFixed(1)
    }
    case 'yoyo': {
      const lvl = parseFloat(yoyo_level)
      if (!lvl) return null
      // Simplified Yo-Yo level 1 → VO₂max estimate (Bangsbo 1994)
      return +(lvl * 0.195 + 2).toFixed(1)
    }
    case 'beep': {
      const lvl = parseFloat(beep_level)
      const spd = parseFloat(beep_speed)
      if (!lvl) return null
      // VO₂max (ml/kg/min) = −24.4 + 6.0 × level (approximation)
      return +(-24.4 + 6.0 * lvl).toFixed(1)
    }
    case 'harvard': {
      const h1 = parseFloat(hr1), h2 = parseFloat(hr2), h3 = parseFloat(hr3)
      const dur = parseFloat(step_duration_sec) || 300
      if (!h1 || !h2 || !h3) return null
      // Physical Fitness Index
      const pfi = (dur * 100) / (2 * (h1 + h2 + h3))
      return +pfi.toFixed(1)
    }
    default: return null
  }
}

// --- Composición corporal ---
export function calcBodyComp(method, inputs) {
  const { sex, age, weight_kg, height_cm, skinfolds = {}, perimeters = {} } = inputs
  const w = parseFloat(weight_kg)
  const a = parseFloat(age)
  const h = parseFloat(height_cm)

  function siri(density) {
    return (4.95 / density - 4.5) * 100
  }

  switch (method) {
    case 'jp3': {
      const isMale = sex === 'male'
      let sum3, density
      if (isMale) {
        const chest = parseFloat(skinfolds.chest)
        const abd   = parseFloat(skinfolds.abdomen)
        const thigh = parseFloat(skinfolds.thigh)
        if (!chest || !abd || !thigh || !a) return null
        sum3 = chest + abd + thigh
        density = 1.10938 - 0.0008267 * sum3 + 0.0000016 * sum3 * sum3 - 0.0002574 * a
      } else {
        const tri  = parseFloat(skinfolds.triceps)
        const sup  = parseFloat(skinfolds.suprailiac)
        const thigh = parseFloat(skinfolds.thigh)
        if (!tri || !sup || !thigh || !a) return null
        sum3 = tri + sup + thigh
        density = 1.0994921 - 0.0009929 * sum3 + 0.0000023 * sum3 * sum3 - 0.0001392 * a
      }
      const fat_pct = +siri(density).toFixed(1)
      const fat_kg  = w ? +(w * fat_pct / 100).toFixed(1) : null
      const lean_kg = w ? +(w - fat_kg).toFixed(1) : null
      return { fat_pct, fat_kg, lean_kg, sum_mm: +sum3.toFixed(1) }
    }
    case 'jp7': {
      const isMale = sex === 'male'
      const sites  = ['chest','abdomen','thigh','triceps','subscapular','suprailiac','midaxillary']
      const vals   = sites.map(s => parseFloat(skinfolds[s]))
      if (vals.some(isNaN) || !a) return null
      const sum7 = vals.reduce((a, b) => a + b, 0)
      const density = isMale
        ? 1.112 - 0.00043499 * sum7 + 0.00000055 * sum7 * sum7 - 0.00028826 * a
        : 1.097 - 0.00046971 * sum7 + 0.00000056 * sum7 * sum7 - 0.00012828 * a
      const fat_pct = +siri(density).toFixed(1)
      const fat_kg  = w ? +(w * fat_pct / 100).toFixed(1) : null
      const lean_kg = w ? +(w - fat_kg).toFixed(1) : null
      return { fat_pct, fat_kg, lean_kg, sum_mm: +sum7.toFixed(1) }
    }
    case 'dw': {
      const isMale = sex === 'male'
      const bi   = parseFloat(skinfolds.biceps)
      const tri  = parseFloat(skinfolds.triceps)
      const sub  = parseFloat(skinfolds.subscapular)
      const sup  = parseFloat(skinfolds.suprailiac)
      if (!bi || !tri || !sub || !sup || !a) return null
      const sum4 = bi + tri + sub + sup
      const logS = Math.log10(sum4)
      // Durnin-Womersley coefficients by age/sex
      let c, m
      if (isMale) {
        if (a < 20)      { c = 1.1620; m = 0.0630 }
        else if (a < 30) { c = 1.1631; m = 0.0632 }
        else if (a < 40) { c = 1.1422; m = 0.0544 }
        else if (a < 50) { c = 1.1620; m = 0.0700 }
        else             { c = 1.1715; m = 0.0779 }
      } else {
        if (a < 20)      { c = 1.1549; m = 0.0678 }
        else if (a < 30) { c = 1.1599; m = 0.0717 }
        else if (a < 40) { c = 1.1423; m = 0.0632 }
        else if (a < 50) { c = 1.1333; m = 0.0612 }
        else             { c = 1.1339; m = 0.0645 }
      }
      const density = c - m * logS
      const fat_pct = +siri(density).toFixed(1)
      const fat_kg  = w ? +(w * fat_pct / 100).toFixed(1) : null
      const lean_kg = w ? +(w - fat_kg).toFixed(1) : null
      return { fat_pct, fat_kg, lean_kg, sum_mm: +sum4.toFixed(1) }
    }
    case 'navy': {
      const isMale = sex === 'male'
      const neck = parseFloat(perimeters.neck)
      const waist = parseFloat(perimeters.waist)
      const hip  = isMale ? null : parseFloat(perimeters.hip)
      if (!neck || !waist || !h) return null
      if (!isMale && !hip) return null
      let fat_pct
      if (isMale) {
        fat_pct = +(86.010 * Math.log10(waist - neck) - 70.041 * Math.log10(h) + 36.76).toFixed(1)
      } else {
        fat_pct = +(163.205 * Math.log10(waist + hip - neck) - 97.684 * Math.log10(h) - 78.387).toFixed(1)
      }
      const fat_kg  = w ? +(w * fat_pct / 100).toFixed(1) : null
      const lean_kg = w ? +(w - fat_kg).toFixed(1) : null
      return { fat_pct, fat_kg, lean_kg }
    }
    default: return null
  }
}

// --- FMS score ---
export function calcFMSScore(patterns) {
  const total = patterns.reduce((sum, p) => {
    // Use the lowest of left/right for bilateral patterns, raw score for unilateral
    const score = p.bilateral ? Math.min(p.score_left ?? 3, p.score_right ?? 3) : (p.score ?? 3)
    return sum + (p.pain ? 0 : score)
  }, 0)
  const asymmetries = patterns.filter(p => p.bilateral && p.score_left !== p.score_right && !p.pain)
  return { total, asymmetries: asymmetries.map(p => p.key) }
}

// ============================================================
// TEMPLATES DE RESULTADOS VACÍOS
// ============================================================
export function emptyResults(evalType, method) {
  switch (evalType) {
    case 'one_rm':
      return { method: method || 'brzycki', exercises: [{ name: '', weight_kg: '', reps: '', one_rm: null }], notes: '' }
    case 'max_reps':
      return { method: method || 'pushup', reps: '', weight_kg: '', volume: null, time_sec: '', notes: '' }
    case 'power':
      return { method: method || 'harman', mass_kg: '', jump_cm: '', time_sec: '', distance_m: '', result: null, notes: '' }
    case 'cardio':
      return { method: method || 'cooper', distance_m: '', weight_kg: '', age: '', sex: 'male', time_min: '', heart_rate: '', yoyo_level: '', beep_level: '', hr1: '', hr2: '', hr3: '', step_duration_sec: '300', vo2max: null, notes: '' }
    case 'body_comp':
      return {
        method: method || 'jp3',
        sex: 'male', age: '', weight_kg: '', height_cm: '',
        skinfolds: { chest: '', abdomen: '', thigh: '', triceps: '', suprailiac: '', subscapular: '', biceps: '', midaxillary: '' },
        perimeters: { neck: '', waist: '', hip: '' },
        result: null,
        notes: '',
      }
    case 'scored':
      return {
        method: method || 'fms',
        fms_patterns: FMS_PATTERNS.map(p => ({
          key: p.key, label: p.label, bilateral: p.bilateral,
          score: null, score_left: null, score_right: null,
          pain: false, notes: ''
        })),
        distance_left_cm: '', distance_right_cm: '',
        reach_anterior_l: '', reach_anterior_r: '',
        reach_posteromedial_l: '', reach_posteromedial_r: '',
        reach_posterolateral_l: '', reach_posterolateral_r: '',
        result: null,
        notes: '',
      }
    case 'custom':
      return { fields: [{ label: '', value: '', unit: '' }], notes: '' }
    default:
      return {}
  }
}

// ============================================================
// HELPERS DE UI
// ============================================================
export function evalTypeColor(key) {
  const map = {
    one_rm:     'bg-red-100 text-red-700',
    max_reps:   'bg-orange-100 text-orange-700',
    power:      'bg-yellow-100 text-yellow-700',
    cardio:     'bg-blue-100 text-blue-700',
    body_comp:  'bg-green-100 text-green-700',
    scored:     'bg-purple-100 text-purple-700',
    custom:     'bg-gray-100 text-gray-600',
  }
  return map[key] || 'bg-gray-100 text-gray-600'
}

export function evalTypeLabel(key) {
  return EVAL_TYPES.find(e => e.key === key)?.label || key
}

export function evalTypeIcon(key) {
  return EVAL_TYPES.find(e => e.key === key)?.icon || '📋'
}

// Kept for backwards compat
export function cooperVO2Max(distance_m) {
  return ((distance_m - 504.9) / 44.73).toFixed(1)
}
