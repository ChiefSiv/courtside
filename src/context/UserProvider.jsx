// src/context/UserProvider.jsx
// Components only — satisfies react-refresh/only-export-components

import { UserContext } from './UserContext.js'

/** v1: always returns null user. Phase 1.5: swap body for Supabase auth. */
export function UserProvider({ children }) {
  return (
    <UserContext.Provider value={{ user: null, isAuthenticated: false }}>
      {children}
    </UserContext.Provider>
  )
}

/** Phase 1.5: replace body with real auth gate. Currently pass-through. */
export function AuthGuard({ children }) {
  return children
}