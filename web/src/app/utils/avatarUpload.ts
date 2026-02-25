import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { compressImage, base64ToUint8Array } from './imageCompression';

/**
 * Upload an avatar image to Firebase Storage.
 * Compresses to 512px max, uploads as avatars/{userId}/avatar.jpg.
 * Fixed filename means re-uploads auto-replace — no orphan cleanup needed.
 */
export async function uploadAvatar(file: File, userId: string): Promise<string> {
  if (!storage) throw new Error('Firebase Storage not initialized');

  // Compress to 512px max, 85% quality
  const compressedDataUrl = await compressImage(file, 512, 0.85);
  const bytes = base64ToUint8Array(compressedDataUrl);

  const storageRef = ref(storage, `avatars/${userId}/avatar.jpg`);
  await uploadBytes(storageRef, bytes, { contentType: 'image/jpeg' });

  return getDownloadURL(storageRef);
}

/**
 * Delete the user's avatar from Firebase Storage.
 * Silently ignores not-found errors (avatar may not exist).
 */
export async function deleteAvatar(userId: string): Promise<void> {
  if (!storage) throw new Error('Firebase Storage not initialized');

  const storageRef = ref(storage, `avatars/${userId}/avatar.jpg`);
  try {
    await deleteObject(storageRef);
  } catch (err: unknown) {
    // Ignore not-found — avatar may not exist
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'storage/object-not-found') {
      return;
    }
    throw err;
  }
}
