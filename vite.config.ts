import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // ── MOBILE COMPATIBILITY FIX ─────────────────────────────────────────────
    // Không có build.target → Vite 6 mặc định nhắm Safari 16.4+
    // → iPhone 11 chạy iOS 13/14/15 thấy trang trắng hoàn toàn.
    // Fix: target Safari 14 (iOS 14+) = hỗ trợ ES2020, optional chaining,
    // nullish coalescing, native dynamic import.
    build: {
      target: ['es2020', 'safari14', 'chrome87', 'firefox78', 'edge88'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify — file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
