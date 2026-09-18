const env = import.meta.env

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
