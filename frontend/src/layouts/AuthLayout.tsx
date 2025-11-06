import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../modules/auth/AuthProvider'
import { Spinner } from '../components/ui/Spinner'

export const AuthLayout = () => {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-surface">
        <Spinner label="Checking your session" />
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
