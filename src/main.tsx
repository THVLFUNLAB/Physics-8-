import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

// Catch Vite chunk load errors globally
window.addEventListener('vite:preloadError', (event) => {
  const isReloaded = sessionStorage.getItem('vite_chunk_reloaded');
  if (!isReloaded) {
    sessionStorage.setItem('vite_chunk_reloaded', 'true');
    window.location.reload();
  }
});

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: any}> {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  
  componentDidCatch(error: any, info: any) { 
    console.error("ErrorBoundary caught:", error, info); 
    
    // Detect dynamic import chunk error
    if (error?.message?.match(/Failed to fetch dynamically imported module|Importing a module script failed/i)) {
      const isReloaded = sessionStorage.getItem('vite_chunk_reloaded');
      if (!isReloaded) {
        sessionStorage.setItem('vite_chunk_reloaded', 'true');
        window.location.reload();
      }
    }
  }

  componentDidMount() {
    // Clear the reload flag after a successful load so it can work again in the future
    setTimeout(() => {
      sessionStorage.removeItem('vite_chunk_reloaded');
    }, 5000);
  }

  render() {
    if (this.state.hasError) {
      const isChunkError = this.state.error?.message?.match(/Failed to fetch dynamically imported module|Importing a module script failed/i);
      
      if (isChunkError) {
        return (
          <div style={{padding: 40, textAlign: 'center', fontFamily: 'sans-serif', background: '#020617', color: 'white', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
            <h1 style={{fontSize: '24px', marginBottom: '1rem', color: '#f8fafc'}}>Hệ thống vừa được cập nhật 🚀</h1>
            <p style={{color: '#94a3b8', marginBottom: '2rem'}}>Vui lòng tải lại trang để tải phiên bản mới nhất.</p>
            <button 
              onClick={() => {
                sessionStorage.removeItem('vite_chunk_reloaded');
                window.location.reload();
              }}
              style={{padding: '12px 24px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold'}}
            >
              Tải Lại Trang Ngay
            </button>
          </div>
        );
      }

      return (
        <div style={{padding: 20, color: '#ef4444', background: '#0f172a', minHeight: '100vh'}}>
          <h2>Oops! Đã xảy ra lỗi (React Crash)</h2>
          <pre style={{background: '#1e293b', padding: 15, borderRadius: 8, overflow: 'auto', color: '#cbd5e1'}}>{this.state.error?.toString()}</pre>
          <button 
            onClick={() => window.location.reload()}
            style={{marginTop: 15, padding: '10px 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer'}}
          >
            Tải Lại Trang
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>,
);
