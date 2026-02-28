import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/lib/firebase';

/**
 * Upload a receipt file to Firebase Storage.
 * Path: receipts/{userId}/{expenseId}/{filename}
 */
export async function uploadReceipt(
  userId: string,
  expenseId: string,
  file: File,
  filename?: string
): Promise<{ url: string; storagePath: string }> {
  if (!storage) {
    throw new Error('Firebase Storage is not initialized');
  }

  const safeName = filename || file.name;
  const storagePath = `receipts/${userId}/${expenseId}/${safeName}`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, file, {
    contentType: file.type,
  });

  const url = await getDownloadURL(storageRef);
  return { url, storagePath };
}

/**
 * Delete a receipt file from Firebase Storage.
 */
export async function deleteReceipt(storagePath: string): Promise<void> {
  if (!storage) {
    throw new Error('Firebase Storage is not initialized');
  }

  const storageRef = ref(storage, storagePath);
  await deleteObject(storageRef);
}

/**
 * Get a fresh download URL for a receipt.
 */
export async function getReceiptUrl(storagePath: string): Promise<string> {
  if (!storage) {
    throw new Error('Firebase Storage is not initialized');
  }

  const storageRef = ref(storage, storagePath);
  return getDownloadURL(storageRef);
}
