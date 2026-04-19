import React from 'react';
import { motion } from 'motion/react';
import { History, Target, Calendar, Clock, ChevronRight } from 'lucide-react';
import { Attempt } from '../types';

export const HistoryDashboard = ({ attempts, onReviewAttempt }: { attempts: Attempt[]; onReviewAttempt: (attempt: Attempt) => void }) => {
  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="relative overflow-hidden bg-slate-900/50 backdrop-blur-md border border-slate-700/50 p-6 sm:p-8 rounded-3xl shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-600/10 blur-3xl rounded-full translate-x-1/4 -translate-y-1/4 pointer-events-none" />
        <div className="relative z-10">
          <h2 className="text-3xl font-black text-white font-headline tracking-tight mb-2 flex items-center gap-3">
            <History className="text-cyan-400 w-8 h-8" />
            Lịch Sử Làm Bài
          </h2>
          <p className="text-slate-400 font-medium">Theo dõi tiến độ, xem lại kết quả và đúc rút bài học kinh nghiệm.</p>
        </div>
        <div className="relative z-10 bg-slate-800/50 border border-slate-700 px-6 py-4 rounded-2xl flex flex-col items-center">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Tổng số lượt làm</span>
          <span className="text-3xl font-black text-cyan-400">{attempts.length}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {attempts.map((attempt, index) => (
          <motion.div
            key={attempt.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="bg-slate-900 border border-slate-800 rounded-3xl p-6 hover:border-slate-600 transition-all flex flex-col shadow-lg shadow-black/20 group"
          >
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 rounded-2xl ${attempt.score >= 8.0 ? 'bg-amber-500/10 text-amber-500' : attempt.score >= 6.0 ? 'bg-blue-500/10 text-blue-500' : 'bg-red-500/10 text-red-500'}`}>
                <Target className="w-6 h-6" />
              </div>
              <div className="text-right">
                <span className={`text-2xl font-black ${attempt.score >= 8.0 ? 'text-amber-500' : attempt.score >= 6.0 ? 'text-blue-500' : 'text-red-500'}`}>
                  {attempt.score.toFixed(2)}
                </span>
                <span className="text-xs text-slate-500 font-bold ml-1">/ 10</span>
              </div>
            </div>
            
            <h3 className="text-lg font-bold text-white mb-4 line-clamp-2 min-h-[56px] leading-relaxed">
              {attempt.testId || 'Đề kiểm tra'}
            </h3>
            
            <div className="space-y-3 mb-6 bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50 flex-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 flex items-center gap-1.5 font-medium"><Calendar className="w-3.5 h-3.5" /> Ngày làm:</span>
                <span className="text-slate-300 font-bold">{new Date(attempt.timestamp?.seconds * 1000).toLocaleDateString('vi-VN')}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 flex items-center gap-1.5 font-medium"><Clock className="w-3.5 h-3.5" /> Thời gian:</span>
                <span className="text-slate-300 font-bold">{new Date(attempt.timestamp?.seconds * 1000).toLocaleTimeString('vi-VN')}</span>
              </div>
            </div>

            <button
              onClick={() => onReviewAttempt(attempt)}
              className="w-full bg-slate-800 hover:bg-cyan-600 text-white rounded-xl py-3.5 font-bold text-sm tracking-wide transition-all shadow-md group-hover:shadow-cyan-500/20 flex items-center justify-center gap-2"
            >
              Xem lại chi tiết
              <ChevronRight className="w-4 h-4" />
            </button>
          </motion.div>
        ))}

        {attempts.length === 0 && (
          <div className="col-span-full py-20 text-center bg-slate-900 border border-slate-800 rounded-3xl">
            <History className="w-16 h-16 text-slate-700 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-400 mb-2">Chưa có lịch sử làm bài</h3>
            <p className="text-slate-500 max-w-md mx-auto">Các đề thi bạn đã nộp sẽ tự động được lưu lại ở đây để bạn dễ dàng theo dõi và rút kinh nghiệm.</p>
          </div>
        )}
      </div>
    </div>
  );
};
