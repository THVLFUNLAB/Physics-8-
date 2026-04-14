import React from 'react';

export const AppFooter = () => (
  <footer className="border-t border-slate-900 py-12 mt-20">
    <div className="max-w-7xl mx-auto px-6 text-center space-y-4">
      <p className="text-slate-500 font-bold">© 2026 PHYS-9+ Xây dựng bởi Thầy Hậu Vật lý & AI</p>
      <div className="flex items-center justify-center gap-6 text-sm font-medium">
        <a href="https://www.facebook.com/thayhauvatlydian/about?locale=vi_VN" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-blue-500 transition-colors">Facebook</a>
        <a href="https://www.youtube.com/@thayhauvatlydian7396" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-red-500 transition-colors">YouTube</a>
        <a href="https://www.tiktok.com/@thayhauvatly" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-slate-200 transition-colors">TikTok</a>
        <a href="https://zalo.me/0962662736" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-blue-400 transition-colors">Zalo: 0962662736</a>
      </div>
    </div>
  </footer>
);

export default AppFooter;
