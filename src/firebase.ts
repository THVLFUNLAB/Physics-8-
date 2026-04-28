import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, User, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache, collection, doc, getDoc, getDocs, getDocsFromServer, setDoc as originalSetDoc, addDoc as originalAddDoc, updateDoc as originalUpdateDoc, deleteDoc, query, where, onSnapshot, Timestamp, getDocFromServer, writeBatch, serverTimestamp, arrayUnion, arrayRemove, orderBy, limit, getCountFromServer, startAfter, getDocFromCache, runTransaction, increment } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { toast } from './components/Toast';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase SDK — TẮT IndexedDB cache hoàn toàn để tránh "xóa giả"
// Mọi thao tác đọc/ghi đều đi thẳng đến server, không qua trung gian
export const app = initializeApp(firebaseConfig);
// [FIX 14/04] Chuyển sang database (default) — hưởng đầy đủ Blaze plan
// Database AI Studio cũ bị khóa free tier quota dù đã trả tiền Blaze
const dbId = (firebaseConfig as any).firestoreDatabaseId;
export const db = dbId ? initializeFirestore(app, {}, dbId) : initializeFirestore(app, {});
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error("Auth persistence setup failed", error);
});
export const googleProvider = new GoogleAuthProvider();
export const storage = getStorage(app);

// Auth Helpers
export const signInWithGoogle = async () => {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (err: any) {
    if (err?.code === 'auth/popup-blocked') {
      // Popup bị chặn → tự động chuyển sang redirect (không cần popup)
      return signInWithRedirect(auth, googleProvider);
    }
    throw err;
  }
};
export const signOut = () => auth.signOut();

/**
 * Upload một buffer ảnh trích từ file Word lên Firebase Storage.
 * @param buffer  ArrayBuffer của ảnh
 * @param mimeType  MIME type (vd: 'image/png')
 * @param folder  Thư mục đích (mặc định: 'exam_images')
 * @returns Download URL công khai
 * 
 * Firebase Storage Rules khuyến nghị (dán vào Firebase Console):
 * ```
 * rules_version = '2';
 * service firebase.storage {
 *   match /b/{bucket}/o {
 *     match /exam_images/{allPaths=**} {
 *       allow read: if true;
 *       allow write: if request.auth != null
 *                    && request.resource.size < 10 * 1024 * 1024
 *                    && request.resource.contentType.matches('image/.*');
 *     }
 *   }
 * }
 * ```
 */
export async function uploadExamImage(
  buffer: ArrayBuffer,
  mimeType: string,
  folder = 'exam_images'
): Promise<string> {
  const ext = mimeType.split('/')[1] ?? 'png';
  const filename = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const storageRef = ref(storage, filename);
  const blob = new Blob([buffer], { type: mimeType });

  // Retry tối đa 2 lần nếu lỗi network tạm thời
  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await uploadBytes(storageRef, blob, { contentType: mimeType });
      return await getDownloadURL(storageRef);
    } catch (error: any) {
      const code = error?.code || '';
      const msg = error?.message || String(error);

      // Log chi tiết để debug
      console.error(`[uploadExamImage] Attempt ${attempt + 1}/${MAX_RETRIES + 1} FAILED`, {
        filename,
        mimeType,
        bufferSize: buffer.byteLength,
        errorCode: code,
        errorMessage: msg,
        authUser: auth.currentUser?.email || 'NOT LOGGED IN',
      });

      // Lỗi quyền → không retry, báo ngay
      if (code === 'storage/unauthorized' || code === 'storage/unauthenticated') {
        throw new Error(
          `Firebase Storage: Không có quyền upload (${code}). ` +
          `Kiểm tra Storage Rules trong Firebase Console. ` +
          `User: ${auth.currentUser?.email || 'chưa đăng nhập'}`
        );
      }

      // Lỗi quota → không retry
      if (code === 'storage/quota-exceeded') {
        throw new Error('Firebase Storage: Đã hết dung lượng miễn phí. Nâng cấp plan.');
      }

      // Lỗi CORS → hướng dẫn fix
      if (msg.includes('CORS') || msg.includes('NetworkError') || msg.includes('Failed to fetch')) {
        if (attempt === MAX_RETRIES) {
          throw new Error(
            `Firebase Storage: Lỗi CORS/Network. Chạy lệnh sau trong terminal:\n` +
            `gsutil cors set cors.json gs://YOUR_BUCKET_NAME\n` +
            `Với cors.json: [{"origin":["*"],"method":["GET","PUT","POST"],"maxAgeSeconds":3600}]`
          );
        }
        // Retry sau 1 giây
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }

      // Các lỗi khác: retry nếu còn lượt
      if (attempt === MAX_RETRIES) throw error;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }

  throw new Error('Upload thất bại sau tất cả retry.');
}

// Error Handling Spec for Firestore Operations
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  
  // Hiển thị thông báo lỗi thân thiện cho Thầy để thầy biết nguyên nhân (Quota hay Quyền)
  if (errInfo.error.includes("permission-denied") || errInfo.error.includes("Missing or insufficient permissions")) {
    toast.error('LỖI QUYỀN TRUY CẬP: Tài khoản không có quyền Admin hoặc Firestore báo lỗi cấp phép.');
  } else if (errInfo.error.includes("quota") || errInfo.error.includes("Quota exceeded")) {
    toast.error('LỖI DUNG LƯỢNG: Đã hết giới hạn (Quota) miễn phí của Firebase cho hôm nay! Vui lòng nâng cấp gói hoặc thử lại vào ngày mai.');
  } else {
    toast.error('Lỗi kết nối máy chủ: ' + errInfo.error.substring(0, 50) + '...');
  }
  
  throw new Error(JSON.stringify(errInfo));
}

// Validate Connection to Firestore
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
  }
}
testConnection();


export function sanitizePayload<T extends Record<string, any>>(obj: T): T {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => {
      if (item !== null && typeof item === 'object') return sanitizePayload(item);
      return item;
    }).filter(item => item !== undefined) as unknown as T;
  }
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (value !== null && typeof value === 'object' && !(value instanceof Timestamp) && !ArrayBuffer.isView(value)) {
      cleaned[key] = sanitizePayload(value);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned as T;
}

// Wrapper for operations to auto clean undefined
export const setDoc = (ref: any, data: any, options?: any) => {
  return originalSetDoc(ref, sanitizePayload(data), options);
};

export const addDoc = (ref: any, data: any) => {
  return originalAddDoc(ref, sanitizePayload(data));
};

export const updateDoc = (ref: any, data: any) => {
  return Promise.race([
    originalUpdateDoc(ref, sanitizePayload(data)),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Quá thời gian kết nối. Máy chủ AI đang bận hoặc quá tải (Quota).")), 10000)
    )
  ]);
};

/**
 * Ghi nhận một lượt làm bài kiểm tra.
 * Admin được Miễn đếm lượt. VIP là Vô cực (không giới hạn).
 * Free users: tối đa 30 lượt thử, sau đó hiện cửa sổ nâng cấp VIP.
 *
 * @throws "EXCEEDED_LIMIT" — khi hết 30 lượt free
 * Các lỗi khác (mạng, permission) → graceful fallback để HS không bị block oan
 */
export const startExamAttempt = async (userId: string, examId: string, isAdmin: boolean) => {
  if (isAdmin) return true; // Admin bypass hoàn toàn

  const userRef = doc(db, 'users', userId);

  // Đọc profile user (server → cache → block nếu không thể xác minh quota)
  let userDoc;
  try {
    userDoc = await getDoc(userRef);
  } catch (netErr: any) {
    const errCode = netErr?.code || '';
    const errMsg  = String(netErr?.message || netErr);

    // ⛔ [SECURITY FIX] Nếu bị chặn quyền đọc → KHÔNG cho vào bài (có thể bị tampered)
    if (errCode === 'permission-denied' || errMsg.includes('Missing or insufficient permissions')) {
      console.warn('[startExamAttempt] Không đọc được user doc do Rules. Chặn vào bài.');
      throw new Error('EXCEEDED_LIMIT');
    }

    console.warn('[startExamAttempt] Lỗi mạng khi getDoc, thử đọc cache...', netErr);
    try {
      userDoc = await getDocFromCache(userRef);
    } catch {
      // Không có cache và không phải lỗi bảo mật → cho phép vào bài (offline graceful)
      console.warn('[startExamAttempt] Không có cache, cho phép vào bài ở chế độ offline.');
      return true;
    }
  }

  if (!userDoc || !userDoc.exists()) {
    // Document chưa có → cho qua, App.tsx sẽ tạo document khi user login
    console.warn('[startExamAttempt] User document chưa tồn tại, cho phép vào bài lần đầu.');
    return true;
  }

  const data = userDoc.data();

  // VIP vô cực → Vẫn đếm totalAttempts để Thầy track hoạt động, nhưng KHAI THÔNG giới hạn, không tăng usedAttempts
  if (data.tier === 'vip' || data.isUnlimited) {
    try {
      await originalSetDoc(userRef, { totalAttempts: increment(1) }, { merge: true });
    } catch {
      // Silent fail — không block VIP vào bài
    }
    return true;
  }

  const used = data.usedAttempts || 0;
  const max  = data.maxAttempts  || 30; // Mặc định Free là 30

  // ━━━ HẾT LƯỢT FREE → throw để App.tsx hiện modal Zalo ━━━
  if (used >= max) {
    throw new Error("EXCEEDED_LIMIT");
  }

  // Ghi nhận lượt thi + log (batch atomic)
  try {
    // [FIX] set(merge:true) an toàn hơn update() — tạo field mới nếu chưa có
    const batch = writeBatch(db);
    // usedAttempts: chỉ FREE, có giới hạn (dùng để chặn sau 30 lượt)
    batch.set(userRef, { usedAttempts: increment(1), totalAttempts: increment(1) }, { merge: true });

    const logRef = doc(collection(db, 'usage_logs'));
    batch.set(logRef, {
      userId,
      examId,
      timestamp: serverTimestamp()
    });

    await batch.commit();
  } catch (writeErr: any) {
    const errCode = writeErr?.code || '';
    const errMsg  = String(writeErr?.message || writeErr);
    // ⛔ [SECURITY FIX] Lỗi quyền khi ghi: Rules đã chặn → nhảy EXCEEDED_LIMIT
    // (Chương trình hợp lệ không bao giờ bị lỗi này nếu Rules được cài đúng)
    if (errCode === 'permission-denied' || errMsg.includes('Missing or insufficient permissions')) {
      console.warn('[startExamAttempt] Rules từ chối ghi quota increment — chặn vào bài.');
      throw new Error('EXCEEDED_LIMIT');
    }
    // Lỗi mạng thuần túy (timeout, offline): vẫn cho vào bài nhưng ghi log
    console.warn('[startExamAttempt] Lỗi ghi batch (mạng), HS vẫn được vào bài:', writeErr);
    return true;
  }

  return true;
};

/**
 * Xử lý trừ lượt khi học sinh bấm tải đề dạng PDF (trừ 5 lượt/lần).
 * Bắt lỗi `"EXCEEDED_LIMIT"` nếu không đủ lượt.
 */
export async function consumePdfDownloadAttempts(userId: string, examId: string = 'unknown_pdf'): Promise<boolean> {
  if (!userId || userId === 'guest') return true;

  if (!navigator.onLine) {
    throw new Error('Bạn cần kết nối mạng để tải file PDF!');
  }

  const userRef = doc(db, 'users', userId);
  const userDoc = await originalGetDoc(userRef);

  if (!userDoc || !userDoc.exists()) {
    return true; // Bỏ qua nếu user lỗi
  }

  const data = userDoc.data();

  // VIP vô cực → Tải thoải mái, không trừ lượt
  if (data.tier === 'vip' || data.isUnlimited) {
    try {
      // Có thể log lại số lần tải pdf nếu muốn
      await originalSetDoc(userRef, { totalPdfDownloads: increment(1) }, { merge: true });
    } catch { }
    return true;
  }

  const used = data.usedAttempts || 0;
  const max = data.maxAttempts || 30;

  // Cần 5 lượt để tải, nếu số lượt hiện tại + 5 vượt quá max thì chặn lại
  if (used + 5 > max) {
    throw new Error("EXCEEDED_LIMIT");
  }

  // Thực hiện trừ 5 lượt + ghi log (batch)
  try {
    const batch = writeBatch(db);
    batch.set(userRef, { usedAttempts: increment(5), totalPdfDownloads: increment(1) }, { merge: true });

    const logRef = doc(collection(db, 'usage_logs'));
    batch.set(logRef, {
      userId,
      action: 'pdf_download',
      examId,
      timestamp: serverTimestamp()
    });

    await batch.commit();
    return true;
  } catch (writeErr: any) {
    const errCode = writeErr?.code || '';
    if (errCode === 'permission-denied') {
      throw new Error("EXCEEDED_LIMIT");
    }
    throw writeErr;
  }
}

export { 
  collection, doc, getDoc, getDocs, getDocsFromServer, getDocFromServer, deleteDoc, query, where, onSnapshot, Timestamp, onAuthStateChanged, writeBatch, serverTimestamp, arrayUnion, arrayRemove, orderBy, limit, getCountFromServer, startAfter, getDocFromCache, runTransaction
};
