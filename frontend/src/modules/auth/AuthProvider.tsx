import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

export interface AuthUser {
  id: string
  name: string
  email: string
  roles: string[]
}

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthState {
  status: AuthStatus
  accessToken?: string
  user?: AuthUser
}

interface Credentials {
  email: string
  password: string
}

interface AuthContextValue extends AuthState {
  login: (credentials: Credentials) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<string | null>
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const INITIAL_STATE: AuthState = {
  status: 'loading',
}

async function parseJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}))
  return data as T
}

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [state, setState] = useState<AuthState>(INITIAL_STATE)
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null)

  const applyAuthPayload = useCallback((payload: Partial<AuthState>) => {
    setState((prev) => ({
      ...prev,
      ...payload,
      status: payload.status ?? prev.status,
    }))
  }, [])

  const refresh = useCallback(async (): Promise<string | null> => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current
    }

    const refreshPromise = (async () => {
      try {
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        })

        if (!response.ok) {
          throw new Error('Unable to refresh session')
        }

        const data = await parseJson<{ token?: string; user?: AuthUser }>(response)

        if (!data.token || !data.user) {
          throw new Error('Malformed refresh response')
        }

        applyAuthPayload({
          status: 'authenticated',
          accessToken: data.token,
          user: data.user,
        })

        return data.token
      } catch (error) {
        console.warn('Refresh failed', error)
        applyAuthPayload({ status: 'unauthenticated', accessToken: undefined, user: undefined })
        return null
      } finally {
        refreshPromiseRef.current = null
      }
    })()

    refreshPromiseRef.current = refreshPromise
    return refreshPromise
  }, [applyAuthPayload])

  const login = useCallback(
    async ({ email, password }: Credentials) => {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        const error = await parseJson<{ message?: string }>(response)
        throw new Error(error.message ?? 'Unable to sign in with the provided credentials')
      }

      const data = await parseJson<{ token?: string; user?: AuthUser }>(response)

      if (!data.token || !data.user) {
        throw new Error('Malformed login response')
      }

      applyAuthPayload({
        status: 'authenticated',
        accessToken: data.token,
        user: data.user,
      })
    },
    [applyAuthPayload]
  )

  const logout = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })

      if (!response.ok) {
        const error = await parseJson<{ message?: string }>(response)
        throw new Error(error.message ?? 'Unable to sign out')
      }
    } catch (error) {
      console.warn('Logout failed', error)
    } finally {
      applyAuthPayload({ status: 'unauthenticated', accessToken: undefined, user: undefined })
    }
  }, [applyAuthPayload])

  const authorizedFetch: AuthorizedFetch = useCallback(
    async (input, init) => {
      const baseHeaders = new Headers(init?.headers ?? {})
      const token = state.accessToken

      if (token) {
        baseHeaders.set('Authorization', `Bearer ${token}`)
    }

    const makeRequest = (headers: Headers) =>
      fetch(input, {
        ...init,
        headers,
        credentials: init?.credentials ?? 'include',
      })

    let response = await makeRequest(baseHeaders)

    if (response.status === 401) {
      const refreshedToken = await refresh()

      if (refreshedToken) {
        const retryHeaders = new Headers(init?.headers ?? {})
        retryHeaders.set('Authorization', `Bearer ${refreshedToken}`)
        response = await makeRequest(retryHeaders)
      }
    }

      return response
    },
    [refresh, state.accessToken]
  )

  useEffect(() => {
    refresh()
  }, [refresh])

  const value = useMemo<AuthContextValue>(() => ({
    ...state,
    login,
    logout,
    refresh,
    authorizedFetch,
  }), [authorizedFetch, login, logout, refresh, state])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}

export type AuthorizedFetch = AuthContextValue['authorizedFetch']
