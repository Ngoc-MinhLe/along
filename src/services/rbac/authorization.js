import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase/client'

export function subscribeToUserAuthorization(uid, onValue, onError) {
  if (!db || !uid) {
    onValue(null)
    return () => {}
  }
  return onSnapshot(
    doc(db, 'userAuthorizations', uid),
    (snapshot) => onValue(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null),
    onError,
  )
}
