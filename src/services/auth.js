import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from '../firebase/client'

function requireAuth() {
  if (!auth) throw new Error('Firebase Authentication chưa được cấu hình.')
  return auth
}

function requireDb() {
  if (!db) throw new Error('Firestore chưa được cấu hình.')
  return db
}

export function subscribeToAuth(callback) {
  if (!auth) return () => {}
  return onAuthStateChanged(auth, callback)
}

export function persistAuthSession() {
  return setPersistence(requireAuth(), browserLocalPersistence)
}

export function signInWithGoogle() {
  return signInWithPopup(requireAuth(), new GoogleAuthProvider())
}

export function registerWithEmail(email, password, displayName = '') {
  return createUserWithEmailAndPassword(requireAuth(), email, password).then(async (result) => {
    if (displayName.trim()) await updateProfile(result.user, { displayName: displayName.trim() })
    return result
  })
}

export function signInWithEmail(email, password) {
  return signInWithEmailAndPassword(requireAuth(), email, password)
}

export function logout() {
  return signOut(requireAuth())
}

export async function getCurrentUserClaims(forceRefresh = false) {
  const currentUser = requireAuth().currentUser
  if (!currentUser) return null
  const tokenResult = await currentUser.getIdTokenResult(forceRefresh)
  return tokenResult.claims
}

export async function ensureUserProfile(firebaseUser) {
  const database = requireDb()
  const profileRef = doc(database, 'users', firebaseUser.uid)
  const snapshot = await getDoc(profileRef)
  const profileFields = {
    uid: firebaseUser.uid,
    email: firebaseUser.email || '',
    displayName: firebaseUser.displayName || '',
    photoURL: firebaseUser.photoURL || '',
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  }

  if (!snapshot.exists()) {
    await setDoc(profileRef, { ...profileFields, systemRole: 'USER', status: 'active', createdAt: serverTimestamp() })
  } else {
    // Existing role/status are preserved; registration cannot supply a role.
    await setDoc(profileRef, profileFields, { merge: true })
  }

  const updatedSnapshot = await getDoc(profileRef)
  return { id: updatedSnapshot.id, ...updatedSnapshot.data() }
}

export function getAuthErrorMessage(error) {
  switch (error?.code) {
    case 'auth/email-already-in-use': return 'Email này đã được đăng ký.'
    case 'auth/invalid-credential':
    case 'auth/wrong-password': return 'Email hoặc mật khẩu không đúng.'
    case 'auth/user-not-found': return 'Không tìm thấy tài khoản.'
    case 'auth/popup-closed-by-user': return 'Bạn đã đóng cửa sổ đăng nhập Google.'
    case 'auth/popup-blocked': return 'Trình duyệt đã chặn cửa sổ Google. Hãy cho phép popup rồi thử lại.'
    case 'auth/network-request-failed': return 'Không thể kết nối đến Firebase. Hãy kiểm tra mạng và thử lại.'
    case 'auth/invalid-email': return 'Email không hợp lệ.'
    case 'auth/weak-password': return 'Mật khẩu cần có ít nhất 6 ký tự.'
    default: return error?.message || 'Thao tác xác thực thất bại. Vui lòng thử lại.'
  }
}
