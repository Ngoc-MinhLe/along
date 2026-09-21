const { getApps, initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore } = require('firebase-admin/firestore')

// In Cloud Functions, the runtime service account supplies credentials.
// Local emulator/CLI execution uses the developer's configured ADC.
const app = getApps()[0] || initializeApp()

module.exports = {
  adminApp: app,
  adminAuth: getAuth(app),
  adminDb: getFirestore(app),
}
