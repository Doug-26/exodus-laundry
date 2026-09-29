import {
  ref,
  uploadBytes,
  getDownloadURL,
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
