import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../firebase/client'

export function subscribeToAuth(callback) {
  if (!auth) return () => {}
  return onAuthStateChanged(auth, callback)
}

export function getCurrentUser() {
  return auth?.currentUser || null
}
