// src/context/UserContext.js  (plain .js, not .jsx — no JSX here)
import { createContext } from 'react'

export const UserContext = createContext({ user: null, isAuthenticated: false })