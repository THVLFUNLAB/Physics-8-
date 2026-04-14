import React from 'react';
import { cn } from '../lib/utils';
import { LogOut, User as UserIcon, Target } from 'lucide-react';
import { UserProfile } from '../types';

export const Navbar = ({ user, onSignOut, onReset, onSignIn }: { user: UserProfile | null, onSignOut: () => void, onReset: () => void, onSignIn: () => void }) => {
  const scrollTo = (id: string) => {
    onReset();
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  return (
    <nav className="sticky top-0 z-[100] w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur-xl px-6 py-4 flex justify-between items-center">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="bg-red-600 p-2 rounded-xl shadow-lg shadow-red-600/20">
            <Target className="text-white w-6 h-6" />
          </div>
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 border-2 border-slate-950 rounded-full animate-pulse" />
        </div>
        <div className="flex flex-col">
          <span className="font-black text-xl tracking-tighter text-white leading-none">PHYS-9+</span>
          <span className="text-[10px] font-bold text-red-600 uppercase tracking-[0.2em] mt-0.5">Pro Edition 2026</span>
        </div>
      </div>
      
      <div className="flex items-center gap-6">
        <div className="hidden lg:flex items-center gap-6 text-[10px] font-black uppercase tracking-widest text-slate-500">
          <button onClick={() => scrollTo('diagnosis')} className="hover:text-white transition-colors">Chẩn đoán</button>
          <button onClick={() => scrollTo('treatment')} className="hover:text-white transition-colors">Điều trị</button>
          <button onClick={() => scrollTo('resources')} className="hover:text-white transition-colors">Học liệu</button>
        </div>

        {user ? (
          <div className="flex items-center gap-4 pl-6 border-l border-slate-800">
            {(user.streak ?? 0) > 1 && (
              <span className="hidden md:inline text-[10px] font-black text-orange-400 bg-orange-600/10 px-2.5 py-1 rounded-full">
                🔥{user.streak}
              </span>
            )}
            <div className="hidden md:flex flex-col items-end">
              <span className="text-sm font-bold text-white">{user.displayName}</span>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                <span className={cn(
                  "text-[9px] font-black uppercase tracking-wider",
                  (user.role === 'admin' || user.email === 'haunn.vietanhschool@gmail.com') ? "text-red-500" :
                  user.targetGroup === 'Master Physics' ? "text-amber-500" : "text-blue-500"
                )}>
                  {(user.role === 'admin' || user.email === 'haunn.vietanhschool@gmail.com') ? 'Quản trị viên' : (user.targetGroup || 'Chưa phân nhóm')}
                </span>
              </div>
            </div>
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className="w-10 h-10 rounded-xl border-2 border-slate-700 object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                <UserIcon className="w-5 h-5 text-slate-500" />
              </div>
            )}
            <button 
              onClick={onSignOut}
              className="w-10 h-10 flex items-center justify-center bg-slate-900 border border-slate-800 rounded-xl hover:bg-red-600/10 hover:border-red-600/50 transition-all group"
            >
              <LogOut className="w-5 h-5 text-slate-500 group-hover:text-red-500" />
            </button>
          </div>
        ) : (
          <button 
            onClick={onSignIn}
            className="bg-white hover:bg-slate-100 text-slate-900 px-6 py-2.5 rounded-xl font-bold text-xs transition-all shadow-xl flex items-center gap-3"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Đăng nhập bằng Google
          </button>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
