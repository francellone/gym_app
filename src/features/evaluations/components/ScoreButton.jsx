// Botón 0-3 con código de color (rojo/naranja/amarillo/verde) — usado en
// los Scored eval forms (FMS, SFMA, etc.) para puntuar cada patrón motor.
const SCORE_COLORS = ['bg-red-500', 'bg-orange-400', 'bg-yellow-400', 'bg-green-500']

export default function ScoreButton({ value, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-9 h-9 rounded-xl text-sm font-bold transition-all border-2 ${
        selected
          ? `${SCORE_COLORS[value]} text-white border-transparent shadow`
          : 'bg-white border-gray-200 text-gray-400 hover:border-gray-400'
      }`}
    >
      {value}
    </button>
  )
}
