import { getApps, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'
import {
  firebaseConfig,
  firebaseEmulatorConfig,
  isFirebaseConfigured,
  useFirebaseEmulator,
} from './config'

export const firebaseApp = isFirebaseConfigured
  ? getApps()[0] || initializeApp(firebaseConfig)
  : null

export const auth = firebaseApp ? getAuth(firebaseApp) : null
export const db = firebaseApp ? getFirestore(firebaseApp) : null
export const functions = firebaseApp ? getFunctions(firebaseApp) : null

// Keep connection state on globalThis so Vite HMR cannot connect the same
// Firebase service to an emulator more than once during local development.
const emulatorStates =
  globalThis.__alongFirebaseEmulatorStates || new WeakMap()
globalThis.__alongFirebaseEmulatorStates = emulatorStates

if (firebaseApp && useFirebaseEmulator) {
  const state = emulatorStates.get(firebaseApp) || {
    auth: false,
    firestore: false,
    functions: false,
  }
  emulatorStates.set(firebaseApp, state)

  if (auth && !state.auth) {
    connectAuthEmulator(
      auth,
      `http://${firebaseEmulatorConfig.auth.host}:${firebaseEmulatorConfig.auth.port}`,
      { disableWarnings: true },
    )
    state.auth = true
  }

  if (db && !state.firestore) {
    connectFirestoreEmulator(
      db,
      firebaseEmulatorConfig.firestore.host,
      firebaseEmulatorConfig.firestore.port,
    )
    state.firestore = true
  }

  if (functions && !state.functions) {
    connectFunctionsEmulator(
      functions,
      firebaseEmulatorConfig.functions.host,
      firebaseEmulatorConfig.functions.port,
    )
    state.functions = true
  }
}
