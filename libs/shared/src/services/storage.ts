import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  type FirebaseStorage,
} from 'firebase/storage';

/**
 * Where a customer's avatar lives. One fixed object per user, overwritten on
 * every change — keeps storage.rules trivial (own-path only) and makes orphaned
 * files impossible, so a failed Firestore write just leaves a file the next
 * upload replaces.
 */
export function avatarPath(uid: string): string {
  return `avatars/${uid}/avatar.jpg`;
}

/**
 * Upload an avatar and return its public download URL (the URL carries an
 * unguessable token — see storage.rules).
 *
 * Unlike Firestore writes, this does NOT queue offline: the caller must treat a
 * rejection as a real failure and surface it, then write photoUrl only once this
 * resolves.
 */
export async function uploadAvatar(
  storage: FirebaseStorage,
  uid: string,
  data: Blob,
): Promise<string> {
  const objectRef = ref(storage, avatarPath(uid));
  await uploadBytes(objectRef, data, { contentType: 'image/jpeg' });
  return getDownloadURL(objectRef);
}

/**
 * Upload a staff proof-of-service photo for an order and return its download URL.
 *
 * Unlike the avatar, each photo gets its own object — an order can carry several,
 * and they are added and removed independently. Writing here requires the `role`
 * custom claim to be 'staff' or 'admin' (see storage.rules); a stale ID token is
 * the usual cause of an unexpected permission error.
 */
export async function uploadProofPhoto(
  storage: FirebaseStorage,
  orderId: string,
  data: Blob,
): Promise<string> {
  const objectRef = ref(storage, `proof/${orderId}/${crypto.randomUUID()}.jpg`);
  await uploadBytes(objectRef, data, { contentType: 'image/jpeg' });
  return getDownloadURL(objectRef);
}

/**
 * Delete a proof photo given its download URL.
 *
 * ref() accepts a full https download URL, so the order only has to store URLs —
 * no parallel list of storage paths to keep in sync.
 */
export async function deleteProofPhoto(storage: FirebaseStorage, url: string): Promise<void> {
  await deleteObject(ref(storage, url));
}
