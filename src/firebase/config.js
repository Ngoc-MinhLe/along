const env = import.meta.env

function readPort(name, fallback) {
  const value = Number(env[name])
  return Number.isInteger(value) && value > 0 && value <= 65535 ? value : fallback
}

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'along-6e1ce.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'along-6e1ce',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'along-6e1ce.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.appId,
)

// Emulator mode is opt-in. Production builds remain on the configured Firebase
// project unless VITE_USE_FIREBASE_EMULATOR is explicitly set to "true".
export const useFirebaseEmulator = env.VITE_USE_FIREBASE_EMULATOR === 'true'

const emulatorHost = env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1'

export const firebaseEmulatorConfig = Object.freeze({
  auth: Object.freeze({
    host: env.VITE_FIREBASE_AUTH_EMULATOR_HOST || emulatorHost,
    port: readPort('VITE_FIREBASE_AUTH_EMULATOR_PORT', 9099),
  }),
  firestore: Object.freeze({
    host: env.VITE_FIRESTORE_EMULATOR_HOST || emulatorHost,
    port: readPort('VITE_FIRESTORE_EMULATOR_PORT', 8080),
  }),
  functions: Object.freeze({
    host: env.VITE_FUNCTIONS_EMULATOR_HOST || emulatorHost,
    port: readPort('VITE_FUNCTIONS_EMULATOR_PORT', 5001),
  }),
})
