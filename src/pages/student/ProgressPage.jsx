import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { format, parseISO, subDays } from 'date-fns'
import { TrendingUp, BarChart2 } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts'

const PERIODS = [
  { label: '1 mes', days: 30 },
  { label: '3 meses', days: 90 },
  { label: '6 meses', days: 180 },
  { label: 'Todo', days: 365 },
]

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white shadow-lg rounded-xl p-3 border border-gray-100 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color }}>
          {entry.name}: {entry.value}{entry.unit || ''}
        </p>
      ))}
    </div>
  )
}

export default function ProgressPage() {
  const { profile } = useAuth()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState(30)
  const [selectedExercise, setSelectedExercise] = useState('')
  const [exercises, setExercises] = useState([])

  useEffect(() => {
    if (profile?.id) fetchLogs()
  }, [profile, period])

  async function fetchLogs() {
    const since = format(subDays(new Date(), period), 'yyyy-MM-dd')
    const { data, error } = await supabase
      .from('workout_logs')
      .select(`
        *,
        plan_exercise:plan_exercises!plan_exercise_id(
          block_label, section,
          exercise:exercises!exercise_id(id, name, muscle_group)
        )
      `)
      .eq('student_id', profile.id)
      .gte('logged_date', since)
      .order('logged_date')

    if (!error && data) {
      setLogs(data)
      // Extract unique exercises
      const exMap = {}
      data.forEach(l => {
        const ex = l.plan_exercise?.exercise
        if (ex) exMap[ex.id] = ex.name
      })
      const exList = Object.entries(exMap).map(([id, name]) => ({ id, name }))
      setExercises(exList)
      if (!selectedExercise && exList.length > 0) setSelectedExercise(exList[0].id)
    }
    setLoading(false)
  }

  // Data for weight progress chart
  const weightData = logs
    .filter(l => l.plan_exercise?.exercise?.id === selectedExercise && l.actual_weight)
    .map(l => ({
      date: format(parseISO(l.logged_date), 'dd/MM'),
      Peso: l.actual_weight,
      PSE: l.perceived_difficulty,
    }))

  // Volume per session (sets × reps × weight)
  const volumeByDate = {}
  logs.forEach(l => {
    if (l.actual_sets && l.actual_weight) {
      const date = format(parseISO(l.logged_date), 'dd/MM')
      const reps = parseFloat(l.actual_reps) || 10
      const volume = l.actual_sets * reps * l.actual_weight
      volumeByDate[date] = (volumeByDate[date] || 0) + volume
    }
  })
  const volumeData = Object.entries(volumeByDate).map(([date, volume]) => ({
    date,
    Volumen: Math.round(volume),
  }))

  // PSE over time
  const pseByDate = {}
  logs.forEach(l => {
    if (l.perceived_difficulty) {
      const date = format(parseISO(l.logged_date), 'dd/MM')
      if (!pseByDate[date]) pseByDate[date] = []
      pseByDate[date].push(l.perceived_difficulty)
    }
  })
  const pseData = Object.entries(pseByDate).map(([date, values]) => ({
    date,
    'PSE promedio': Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10,
  }))

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-5 pt-12 pb-4 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-900">Mi progreso</h1>

        {/* Period selector */}
        <div className="flex gap-1 mt-3 bg-gray-100 p-1 rounded-xl">
          {PERIODS.map(p => (
            <button
              key={p.days}
              onClick={() => setPeriod(p.days)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                period === p.days ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-5">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12">
            <TrendingUp className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Sin datos aún</p>
            <p className="text-gray-400 text-sm mt-1">Completá entrenamientos para ver tu progreso</p>
          </div>
        ) : (
          <>
            {/* Weight progress by exercise */}
            <div className="card space-y-3">
              <div>
                <h3 className="font-semibold text-gray-900">Progresión de peso</h3>
                <p className="text-xs text-gray-500 mt-0.5">Peso levantado por ejercicio</p>
              </div>

              {exercises.length > 0 && (
                <select
                  className="input text-sm"
                  value={selectedExercise}
                  onChange={e => setSelectedExercise(e.target.value)}
                >
                  {exercises.map(ex => (
                    <option key={ex.id} value={ex.id}>{ex.name}</option>
                  ))}
                </select>
              )}

              {weightData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={weightData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} unit="kg" />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="Peso"
                      stroke="#ea580c"
                      strokeWidth={2.5}
                      dot={{ fill: '#ea580c', r: 4 }}
                      unit="kg"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-sm text-gray-400 py-6">
                  Sin datos de peso para este ejercicio
                </p>
              )}
            </div>

            {/* Volume */}
            {volumeData.length > 0 && (
              <div className="card space-y-3">
                <div>
                  <h3 className="font-semibold text-gray-900">Volumen por sesión</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Series × repeticiones × peso</p>
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={volumeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="Volumen" fill="#fb923c" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* PSE trend */}
            {pseData.length > 0 && (
              <div className="card space-y-3">
                <div>
                  <h3 className="font-semibold text-gray-900">Esfuerzo percibido (PSE)</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Promedio por sesión</p>
                </div>
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={pseData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="PSE promedio"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot={{ fill: '#8b5cf6', r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="card text-center">
                <p className="text-xl font-bold text-gray-900">
                  {new Set(logs.map(l => l.logged_date)).size}
                </p>
                <p className="text-xs text-gray-500">Sesiones</p>
              </div>
              <div className="card text-center">
                <p className="text-xl font-bold text-gray-900">
                  {logs.filter(l => l.completed).length}
                </p>
                <p className="text-xs text-gray-500">Ejercicios</p>
              </div>
              <div className="card text-center">
                <p className="text-xl font-bold text-gray-900">
                  {logs.filter(l => l.perceived_difficulty).length > 0
                    ? Math.round(
                        logs.filter(l => l.perceived_difficulty)
                          .reduce((a, l) => a + l.perceived_difficulty, 0) /
                        logs.filter(l => l.perceived_difficulty).length * 10
                      ) / 10
                    : '—'
                  }
                </p>
                <p className="text-xs text-gray-500">PSE prom.</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
