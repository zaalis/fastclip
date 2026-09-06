import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { AppShell } from './components/AppShell'
import { Spinner } from './components/ui'
import { useAuth } from './context/AppContext'
import Dashboard from './pages/Dashboard'
import Editor from './pages/Editor'
import ForgotPassword from './pages/ForgotPassword'
import Help from './pages/Help'
import Landing from './pages/Landing'
import Login from './pages/Login'
import NewProject from './pages/NewProject'
import ProjectDetail from './pages/ProjectDetail'
import Projects from './pages/Projects'
import Register from './pages/Register'
import Settings from './pages/Settings'
import Templates from './pages/Templates'
import Trash from './pages/Trash'

function FullPageLoader() {
  return (
    <div className="grid min-h-dvh place-items-center bg-ink-900">
      <div className="flex flex-col items-center gap-3 text-muted">
        <Spinner size={26} className="text-blue-400" />
        <p className="text-sm">Chargement de Fastclip...</p>
      </div>
    </div>
  )
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageLoader />
  if (!user) return <Navigate to="/connexion" replace state={{ from: location.pathname }} />
  return children
}

function RedirectIfAuthed({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth()
  if (loading) return <FullPageLoader />
  if (user) return <Navigate to="/app" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route
        path="/connexion"
        element={
          <RedirectIfAuthed>
            <Login />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/inscription"
        element={
          <RedirectIfAuthed>
            <Register />
          </RedirectIfAuthed>
        }
      />
      <Route path="/mot-de-passe-oublie" element={<ForgotPassword />} />

      {/* Authenticated */}
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/app" element={<Dashboard />} />
        <Route path="/app/nouveau" element={<NewProject />} />
        <Route path="/app/projets" element={<Projects />} />
        <Route path="/app/projets/:projectId" element={<ProjectDetail />} />
        <Route path="/app/projets/:projectId/editeur" element={<Editor />} />
        <Route path="/app/modeles" element={<Templates />} />
        <Route path="/app/corbeille" element={<Trash />} />
        <Route path="/app/aide" element={<Help />} />
        <Route path="/app/parametres" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
