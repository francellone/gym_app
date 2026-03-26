import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'

// Pages
import LoginPage from './pages/LoginPage'

// Coach pages
import CoachLayout from './components/layout/CoachLayout'
import CoachDashboard from './pages/coach/CoachDashboard'
import StudentsPage from './pages/coach/StudentsPage'
import StudentDetailPage from './pages/coach/StudentDetailPage'
import CreateStudentPage from './pages/coach/CreateStudentPage'
import PlansPage from './pages/coach/PlansPage'
import PlanDetailPage from './pages/coach/PlanDetailPage'
import CreatePlanPage from './pages/coach/CreatePlanPage'
import ExercisesLibraryPage from './pages/coach/ExercisesLibraryPage'

// Student pages
import StudentLayout from './components/layout/StudentLayout'
import StudentDashboard from './pages/student/StudentDashboard'
import TodayWorkoutPage from './pages/student/TodayWorkoutPage'
import ProgressPage from './pages/student/ProgressPage'
import HistoryPage from './pages/student/HistoryPage'
import ProfilePage from './pages/student/ProfilePage'

function PrivateRoute({ children, requiredRole }) {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Cargando...</p>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (requiredRole && profile?.role !== requiredRole) {
    return <Navigate to={profile?.role === 'coach' ? '/coach' : '/student'} replace />
  }

  return children
}

function AppRoutes() {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Iniciando...</p>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={
        user ? <Navigate to={profile?.role === 'coach' ? '/coach' : '/student'} replace /> : <LoginPage />
      } />

      {/* Coach routes */}
      <Route path="/coach" element={
        <PrivateRoute requiredRole="coach">
          <CoachLayout />
        </PrivateRoute>
      }>
        <Route index element={<CoachDashboard />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="students/new" element={<CreateStudentPage />} />
        <Route path="students/:id" element={<StudentDetailPage />} />
        <Route path="plans" element={<PlansPage />} />
        <Route path="plans/new" element={<CreatePlanPage />} />
        <Route path="plans/:id" element={<PlanDetailPage />} />
        <Route path="exercises" element={<ExercisesLibraryPage />} />
      </Route>

      {/* Student routes */}
      <Route path="/student" element={
        <PrivateRoute requiredRole="student">
          <StudentLayout />
        </PrivateRoute>
      }>
        <Route index element={<StudentDashboard />} />
        <Route path="workout" element={<TodayWorkoutPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      {/* Default redirect */}
      <Route path="/" element={
        user
          ? <Navigate to={profile?.role === 'coach' ? '/coach' : '/student'} replace />
          : <Navigate to="/login" replace />
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
