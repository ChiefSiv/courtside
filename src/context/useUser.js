// src/context/useUser.js
import { useContext } from 'react'
import { UserContext } from './UserContext.js'

export function useUser() {
  return useContext(UserContext)
}