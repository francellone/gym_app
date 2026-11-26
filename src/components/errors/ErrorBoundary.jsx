// ============================================================
// ErrorBoundary — una pantalla que falla no deja la app en blanco
// ------------------------------------------------------------
// Sin esto, cualquier error al dibujar un componente desmonta TODA la app
// y queda la página en blanco (caso real 2026-11-26: un useMemo mal escrito
// en Progreso dejaba en blanco la pantalla de la coach; ver commit 680f61d).
//
// Con esto, el error queda encerrado en la sección donde ocurrió:
//   - variant="section": recuadro dentro de la pantalla (menú y resto visibles).
//   - variant="page": pantalla completa (último recurso, envuelve a App).
// resetKey: cuando cambia (otra ruta, otra pestaña), el error se borra solo.
// Si el error es de un archivo JS viejo después de un deploy, sugiere recargar.
// ============================================================
import { Component } from 'react'
import i18n from '@/i18n'
import { isStaleChunkError } from './staleChunk'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
    this.retry = this.retry.bind(this)
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', this.props.name || '', error, info?.componentStack)
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  retry() {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const t = (k) => i18n.t(`errors.boundary.${k}`)
    const stale = isStaleChunkError(error)
    const page = this.props.variant === 'page'

    return (
      <div
        role="alert"
        className={
          page
            ? 'min-h-screen flex items-center justify-center p-6 bg-white'
            : 'card my-4 text-center'
        }
      >
        <div className="max-w-sm mx-auto space-y-3">
          <p className="text-base font-bold text-tinta">
            {stale ? t('staleTitle') : page ? t('pageTitle') : t('sectionTitle')}
          </p>
          <p className="text-sm text-gray-600">{stale ? t('staleBody') : t('body')}</p>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            {!stale && (
              <button type="button" className="btn-secondary" onClick={this.retry}>
                {t('retry')}
              </button>
            )}
            <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
              {t('reload')}
            </button>
          </div>
        </div>
      </div>
    )
  }
}
