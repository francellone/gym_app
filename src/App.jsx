import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/features/auth/AuthContext'

// Pages
import LoginPage from '@/features/auth/pages/LoginPage'

// Coach pages
import CoachLayout from './components/layout/CoachLayout'
import CoachDashboard from '@/features/dashboard/pages/CoachDashboard'
import StudentsPage from '@/features/students/pages/StudentsPage'
import StudentDetailPage from '@/features/students/pages/StudentDetailPage'
import CreateStudentPage from '@/features/students/pages/CreateStudentPage'
import PlansPage from '@/features/plans/pages/PlansPage'
import PlanDetailPage from '@/features/plans/pages/PlanDetailPage'
import CreatePlanPage from '@/features/plans/pages/CreatePlanPage'
import ExercisesLibraryPage from '@/features/exercises/pages/ExercisesLibraryPage'
import EditPlanPage from '@/features/plans/pages/EditPlanPage'
import EvaluationsPage from '@/features/evaluations/pages/EvaluationsPage'
import EvaluationDetailPage from '@/features/evaluations/pages/EvaluationDetailPage'

// Student pages
import StudentLayout from './components/layout/StudentLayout'
import StudentDashboard from '@/features/dashboard/pages/StudentDashboard'
import TodayWorkoutPage from '@/features/workouts/pages/TodayWorkoutPage'
import ProgressPage from '@/features/progress/pages/ProgressPage'
import HistoryPage from '@/features/workouts/pages/HistoryPage'
import ProfilePage from '@/features/auth/pages/ProfilePage'
import EvalWorkoutPage from '@/features/evaluations/pages/EvalWorkoutPage'
import FormBuilderPage from '@/features/forms/pages/FormBuilderPage'
import FollowUpFormsPage from '@/features/forms/pages/FollowUpFormsPage'
import FollowUpFormBuilderPage from '@/features/forms/pages/FollowUpFormBuilderPage'
import IntakeFormPage from '@/features/forms/pages/IntakeFormPage'
import FormsListPage from '@/features/forms/pages/FormsListPage'
import FollowUpFormPage from '@/features/forms/pages/FollowUpFormPage'
import NotesPage from '@/features/notes/pages/StudentNotesPage'

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
      <Route
        path="/login"
        element={
          user ? (
            <Navigate to={profile?.role === 'coach' ? '/coach' : '/student'} replace />
          ) : (
            <LoginPage />
          )
        }
      />

      {/* Coach routes */}
      <Route
        path="/coach"
        element={
          <PrivateRoute requiredRole="coach">
            <CoachLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<CoachDashboard />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="students/new" element={<CreateStudentPage />} />
        <Route path="students/:id" element={<StudentDetailPage />} />
        <Route path="plans" element={<PlansPage />} />
        <Route path="plans/new" element={<CreatePlanPage />} />
        <Route path="plans/:id" element={<PlanDetailPage />} />
        <Route path="plans/:id/edit" element={<EditPlanPage />} />
        <Route path="exercises" element={<ExercisesLibraryPage />} />
        <Route path="evaluations" element={<EvaluationsPage />} />
        <Route path="evaluations/:id" element={<EvaluationDetailPage />} />
        <Route path="form-builder" element={<FormBuilderPage />} />
        <Route path="follow-up-forms" element={<FollowUpFormsPage />} />
        <Route path="follow-up-forms/:id" element={<FollowUpFormBuilderPage />} />
      </Route>

      {/* Student routes */}
      <Route
        path="/student"
        element={
          <PrivateRoute requiredRole="student">
            <StudentLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<StudentDashboard />} />
        <Route path="workout" element={<TodayWorkoutPage />} />
        <Route path="eval/:planId" element={<EvalWorkoutPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="forms" element={<FormsListPage />} />
        <Route path="notes" element={<NotesPage />} />
      </Route>

      {/* Intake form — fuera del StudentLayout para evitar conflicto de navbars */}
      <Route
        path="/student/intake"
        element={
          <PrivateRoute requiredRole="student">
            <IntakeFormPage />
          </PrivateRoute>
        }
      />

      {/* Follow-up form individual */}
      <Route
        path="/student/form/:assignmentId"
        element={
          <PrivateRoute requiredRole="student">
            <FollowUpFormPage />
          </PrivateRoute>
        }
      />

      {/* Default redirect */}
      <Route
        path="/"
        element={
          user ? (
            <Navigate to={profile?.role === 'coach' ? '/coach' : '/student'} replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
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
