import React, { useState, lazy, Suspense } from 'react';
import { Eye, MonitorSmartphone, X, Rocket, Zap, BrainCircuit } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile, Attempt, Exam } from '../types';

const Grade10Dashboard = lazy(() => import('./Grade10Dashboard'));
const Grade11Dashboard = lazy(() => import('./Grade11Dashboard'));
const StudentDashboard = lazy(() => import('./StudentDashboard'));

interface Props {
  user: UserProfile;
  attempts: Attempt[];
  onStartPrescription: (topic: string, examId?: string) => void;
  onStartExam: (exam: Exam) => void;
}

const LazyWrap = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={
    <div className="flex items-center justify-center py-20 min-h-[400px]">
      <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
    </div>
  }>
    {children}
  </Suspense>
);

export default function StudentViewSimulator({ user, attempts, onStartPrescription, onStartExam }: Props) {
  const [impersonatedGrade, setImpersonatedGrade] = useState<number | null>(null);

  if (impersonatedGrade) {
    return (
      <div className="relative animate-in fade-in duration-300">
        {/* Floating Topbar */}
        <div className="sticky top-0 z-[100] mb-8 lg:-mt-6 lg:-mx-6 px-4 py-3 bg-gradient-to-r from-amber-600 to-red-600 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4 sm:rounded-b-3xl">
          <div className="flex items-center gap-3 text-white font-black uppercase tracking-widest text-xs sm:text-sm">
            <div className="p-2 bg-black/20 rounded-full animate-pulse">
              <Eye className="w-5 h-5" />
            </div>
            Góc nhìn: Học sinh Khối {impersonatedGrade}
          </div>
          <button 
            onClick={() => setImpersonatedGrade(null)}
            className="px-4 py-2 bg-black/30 hover:bg-black/50 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-2"
          >
            <X className="w-4 h-4" /> Thoát góc nhìn
          </button>
        </div>

        {/* Dashboard Renderer */}
        <div className="w-full">
          {impersonatedGrade === 10 && <LazyWrap><Grade10Dashboard /></LazyWrap>}
          {impersonatedGrade === 11 && <LazyWrap><Grade11Dashboard /></LazyWrap>}
          {impersonatedGrade === 12 && (
             <LazyWrap>
                <div className="bg-slate-900/50 p-4 md:p-8 rounded-3xl border border-slate-800">
                   <StudentDashboard 
                     user={user} 
                     attempts={attempts} 
                     onStartPrescription={onStartPrescription} 
                     onStartExam={onStartExam} 
                   />
                </div>
             </LazyWrap>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
      <div className="text-center space-y-4 max-w-2xl mx-auto">
        <div className="inline-flex items-center justify-center p-4 bg-cyan-500/10 rounded-full mb-2 border border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.2)]">
          <MonitorSmartphone className="w-10 h-10 text-cyan-400" />
        </div>
        <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight uppercase">Mô phỏng <span className="text-cyan-400 drop-shadow-[0_0_10px_rgba(6,182,212,0.6)]">Góc Nhìn</span></h1>
        <p className="text-slate-400 text-sm md:text-base leading-relaxed">
          Với tư cách Admin, thầy có thể trải nghiệm trực tiếp giao diện hiển thị cho từng khối lớp từ góc độ của một học viên thực tế.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
        
        {/* Khối 10 */}
        <div 
          onClick={() => setImpersonatedGrade(10)}
          className="group relative bg-slate-900 border border-slate-800 hover:border-cyan-500/50 rounded-[2rem] p-8 cursor-pointer overflow-hidden transition-all duration-500 hover:shadow-[0_0_40px_rgba(6,182,212,0.15)] hover:-translate-y-2"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 blur-3xl rounded-full transition-all group-hover:bg-cyan-500/20" />
          <div className="w-16 h-16 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg shadow-cyan-500/30">
            <Rocket className="w-8 h-8" />
          </div>
          <h2 className="text-3xl font-black text-white mb-3">Khối 10</h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-6 h-16 border-b border-slate-800/50 pb-4">
            Bảng điều khiển Sci-Fi với Radar năng lực: Động học, Lực, Năng lượng, Động lượng.
          </p>
          <div className="flex items-center text-cyan-400 font-bold text-sm uppercase tracking-widest gap-2 group-hover:gap-4 transition-all">
            Vào quan sát <MonitorSmartphone className="w-4 h-4" />
          </div>
        </div>

        {/* Khối 11 */}
        <div 
          onClick={() => setImpersonatedGrade(11)}
          className="group relative bg-slate-900 border border-slate-800 hover:border-yellow-500/50 rounded-[2rem] p-8 cursor-pointer overflow-hidden transition-all duration-500 hover:shadow-[0_0_40px_rgba(234,179,8,0.15)] hover:-translate-y-2"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/10 blur-3xl rounded-full transition-all group-hover:bg-yellow-500/20" />
          <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-600 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg shadow-yellow-500/30">
            <Zap className="w-8 h-8" />
          </div>
          <h2 className="text-3xl font-black text-white mb-3">Khối 11</h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-6 h-16 border-b border-slate-800/50 pb-4">
            Trạm Bứt Phá: Radar năng lực chuyên đề Dao động, Sóng, Điện trường...
          </p>
          <div className="flex items-center text-yellow-500 font-bold text-sm uppercase tracking-widest gap-2 group-hover:gap-4 transition-all">
            Vào quan sát <MonitorSmartphone className="w-4 h-4" />
          </div>
        </div>

        {/* Khối 12 */}
        <div 
          onClick={() => setImpersonatedGrade(12)}
          className="group relative bg-slate-900 border border-slate-800 hover:border-red-500/50 rounded-[2rem] p-8 cursor-pointer overflow-hidden transition-all duration-500 hover:shadow-[0_0_40px_rgba(239,68,68,0.15)] hover:-translate-y-2"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 blur-3xl rounded-full transition-all group-hover:bg-red-500/20" />
          <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-rose-700 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg shadow-red-500/30">
            <BrainCircuit className="w-8 h-8" />
          </div>
          <h2 className="text-3xl font-black text-white mb-3">Khối 12</h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-6 h-16 border-b border-slate-800/50 pb-4">
            Bảng điều khiển thi THPTQG chuẩn với Cấu hình Chiến thuật và Lộ trình Cá nhân hóa.
          </p>
          <div className="flex items-center text-red-500 font-bold text-sm uppercase tracking-widest gap-2 group-hover:gap-4 transition-all">
            Vào quan sát <MonitorSmartphone className="w-4 h-4" />
          </div>
        </div>

      </div>
    </div>
  );
}
