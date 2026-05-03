/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FREE_CLASS_10: string;
  readonly VITE_FREE_CLASS_11: string;
  readonly VITE_FREE_CLASS_12: string;
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_GEMINI_API_KEY: string;
  // Thêm các biến môi trường VITE_ khác nếu cần
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
