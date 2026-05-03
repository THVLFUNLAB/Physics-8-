/**
 * learningMaterialService.ts
 * Quản lý học liệu số của Giáo Viên (Upload file, lưu metadata).
 *
 * ═════════════════════════════════════════════════════════════════════════
 * FIREBASE STORAGE SECURITY RULES (Vui lòng copy vào Firebase Console):
 * ═════════════════════════════════════════════════════════════════════════
 * rules_version = '2';
 * service firebase.storage {
 *   match /b/{bucket}/o {
 *     match /materials/{teacherId}/{fileName} {
 *       // Chỉ cho phép giáo viên (đã xác thực) tải file lên thư mục của mình
 *       allow write: if request.auth != null && request.auth.uid == teacherId
 *                    // Giới hạn PDF < 5MB
 *                    && (
 *                      (request.resource.contentType == 'application/pdf' && request.resource.size < 5 * 1024 * 1024)
 *                      // Hoặc Giới hạn Ảnh (JPG/PNG) < 2MB
 *                      || (request.resource.contentType.matches('image/.*') && request.resource.size < 2 * 1024 * 1024)
 *                    );
 *       // Mọi user đăng nhập đều có thể đọc (kiểm tra quyền truy cập chi tiết bằng Firestore)
 *       allow read: if request.auth != null; 
 *     }
 *   }
 * }
 * ═════════════════════════════════════════════════════════════════════════
 */

import { db, storage, collection, addDoc, serverTimestamp, doc, updateDoc } from '../../../firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import type { LearningMaterial } from '../../../types';

/**
 * Tải file lên Firebase Storage và trả về URL + Path
 */
export async function uploadMaterialFile(
  teacherId: string,
  file: File,
  onProgress?: (progress: number) => void
): Promise<{ storageUrl: string; storagePath: string }> {
  // Tạo unique filename để tránh ghi đè
  const fileExt = file.name.split('.').pop();
  const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
  const storagePath = `materials/${teacherId}/${uniqueName}`;
  
  const storageRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(storageRef, file);

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        if (onProgress) onProgress(progress);
      },
      (error) => {
        console.error('[uploadMaterialFile] Error:', error);
        reject(error);
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({ storageUrl: downloadURL, storagePath });
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

/**
 * Lưu metadata của học liệu vào Firestore (learningMaterials)
 */
export async function saveMaterialMetadata(
  material: Omit<LearningMaterial, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, 'learningMaterials'), {
      ...material,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('[saveMaterialMetadata] Error:', error);
    throw error;
  }
}
