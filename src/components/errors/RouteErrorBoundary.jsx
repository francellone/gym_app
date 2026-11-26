import { useLocation } from 'react-router-dom'
import ErrorBoundary from './ErrorBoundary'

/** ErrorBoundary de sección que se reinicia al cambiar de ruta (para los layouts). */
export default function RouteErrorBoundary({ children }) {
  const { pathname } = useLocation()
  return (
    <ErrorBoundary variant="section" name="route" resetKey={pathname}>
      {children}
    </ErrorBoundary>
  )
}
