import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';
import { Trophy, Star, Medal, Crown, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../lib/utils';
import { getCurrentRank } from '../services/RankSystem';
import { motion, AnimatePresence } from 'motion/react';

interface GradeLeaderboardProps {
  currentUser: UserProfile;
}

export const GradeLeaderboard: React.FC<GradeLeaderboardProps> = ({ currentUser }) => {
  const [leaders, setLeaders] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  // Thử trích xuất khối lớp, ví dụ "11L2" -> "11"
  const gradePrefix = currentUser.className ? currentUser.className.substring(0, 2) : '12';

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setLoading(true);
        // Lấy 500 người cao điểm nhất server (để đảm bảo có đủ người của khối)
        // Tránh lỗi Missing Index nếu query theo cả className và order by stars.
        const q = query(collection(db, 'users'), orderBy('stars', 'desc'), limit(500));
        const snapshot = await getDocs(q);
        const allTopUsers = snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as UserProfile));
        
        // Lọc ra các bạn trong cùng khối
        const sameGradeUsers = allTopUsers.filter(u => u.className?.startsWith(gradePrefix));
        
        // Lấy top 50
        setLeaders(sameGradeUsers.slice(0, 50));
      } catch (error) {
        console.error("Lỗi lấy dữ liệu leaderboard:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [gradePrefix]);

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl animate-pulse">
        <div className="h-6 w-48 bg-slate-800 rounded-lg mb-6"></div>
        <div className="space-y-4">
          <div className="h-16 w-full bg-slate-800 rounded-2xl"></div>
          <div className="h-16 w-full bg-slate-800 rounded-2xl"></div>
          <div className="h-16 w-full bg-slate-800 rounded-2xl"></div>
        </div>
      </div>
    );
  }

  if (leaders.length === 0) return null;

  const top3 = leaders.slice(0, 3);
  const others = leaders.slice(3, showAll ? 50 : 10);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden shadow-2xl">
      <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 blur-3xl rounded-full pointer-events-none" />
      
      <div className="flex items-center justify-between mb-8 relative z-10">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Trophy className="text-amber-500" /> BẢNG PHONG THẦN KHỐI {gradePrefix}
          </h2>
          <p className="text-sm text-slate-400 mt-1">Sự nỗ lực làm nên huyền thoại - Top 50 Cao Thủ</p>
        </div>
      </div>

      {/* TOP 3 Huyền Thoại */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {top3.map((student, index) => {
          const rankInfo = getCurrentRank(student.stars || 0);
          const isMe = student.uid === currentUser.uid;
          
          let medalConfig = { bg: '', border: '', icon: <Medal className="w-8 h-8 text-amber-600" /> };
          if (index === 0) medalConfig = { bg: 'bg-amber-500/20', border: 'border-amber-400/50 shadow-[0_0_20px_rgba(251,191,36,0.3)]', icon: <Crown className="w-10 h-10 text-amber-400 drop-shadow-lg" /> };
          else if (index === 1) medalConfig = { bg: 'bg-slate-300/20', border: 'border-slate-300/50', icon: <Medal className="w-8 h-8 text-slate-300" /> };
          else if (index === 2) medalConfig = { bg: 'bg-orange-700/20', border: 'border-orange-500/30', icon: <Medal className="w-8 h-8 text-orange-500" /> };

          return (
            <motion.div 
              key={student.uid}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: index * 0.1 }}
              className={cn(
                "relative group flex flex-col items-center p-6 rounded-3xl border transition-all",
                medalConfig.bg, medalConfig.border,
                isMe ? "bg-blue-600/20 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]" : "hover:bg-slate-800"
              )}
            >
              {isMe && <div className="absolute -top-3 px-3 py-1 bg-blue-600 text-white text-[10px] font-black uppercase rounded-full shadow-lg">Bạn ở đây</div>}
              <div className="font-black text-2xl mb-2">{medalConfig.icon}</div>
              <div className="w-16 h-16 bg-slate-950 rounded-2xl flex items-center justify-center text-3xl font-black mb-3 border border-slate-700 relative shadow-inner">
                {student.displayName?.charAt(0) || '🎓'}
              </div>
              <h3 className={cn("text-lg font-black text-center line-clamp-1 mb-1", isMe ? "text-blue-400" : "text-white")}>
                {student.displayName}
              </h3>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 line-clamp-1">{student.className}</p>
              
              <div className="flex items-center gap-1.5 bg-slate-950/50 border border-slate-800 px-4 py-2 rounded-xl w-full justify-center">
                <span className="text-xl font-black text-amber-400">{student.stars || 0}</span>
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              </div>
              
              <div className="absolute top-2 right-2 text-2xl opacity-30 group-hover:opacity-100 transition-opacity">
                {rankInfo.icon}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* TOP 4 - 50 Danh Sách Kéo Dài */}
      <div className="space-y-3 relative z-10">
        <AnimatePresence>
          {others.map((student, index) => {
            const actualRank = index + 4; // Top 3 starts at index 0..2
            const rankInfo = getCurrentRank(student.stars || 0);
            const isMe = student.uid === currentUser.uid;

            return (
              <motion.div 
                key={student.uid}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  "flex items-center gap-4 p-4 rounded-2xl border transition-all",
                  isMe ? "bg-blue-600/20 border-blue-500/50" : "bg-slate-950/50 border-slate-800 hover:border-slate-700"
                )}
              >
                <div className="w-8 font-black text-slate-500 text-center">{actualRank}</div>
                <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center font-black border border-slate-700">
                  {student.displayName?.charAt(0) || '🎓'}
                </div>
                <div className="flex-1">
                  <h4 className={cn("font-black tracking-wide", isMe ? "text-blue-400" : "text-slate-200")}>
                    {student.displayName}
                  </h4>
                  <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                    Lớp: <span className="text-slate-400">{student.className}</span>
                    <span className="w-1 h-1 bg-slate-700 rounded-full"></span>
                    {rankInfo.name}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 min-w-[80px] justify-end">
                  <span className="text-lg font-black text-amber-500">{student.stars || 0}</span>
                  <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                </div>
                <div className="w-8 flex justify-center text-xl hidden sm:block">
                  {rankInfo.icon}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {leaders.length > 10 && (
        <button 
          onClick={() => setShowAll(!showAll)}
          className="w-full mt-6 bg-slate-950/50 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white py-4 rounded-xl font-bold uppercase text-xs tracking-widest transition-all flex items-center justify-center gap-2"
        >
          {showAll ? (
            <><ChevronUp className="w-4 h-4" /> Thu gọn Top 10</>
          ) : (
            <><ChevronDown className="w-4 h-4" /> Mở rộng Top 50 Server</>
          )}
        </button>
      )}

      {/* Thông báo nếu chính bạn đang chìm nghỉm (nằm ngoài top 50) */}
      {!leaders.some(u => u.uid === currentUser.uid) && leaders.length > 0 && (
        <div className="mt-6 p-4 rounded-xl border border-blue-500/30 bg-blue-900/10 flex justify-between items-center animate-pulse shadow-[0_0_15px_rgba(59,130,246,0.1)]">
           <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center font-black border border-blue-500/50">
                {currentUser.displayName?.charAt(0) || '🕵'}
             </div>
             <div>
               <h4 className="font-black text-blue-400 tracking-wide text-sm">{currentUser.displayName}</h4>
               <p className="text-[10px] font-bold text-slate-400 uppercase">Bạn đang nằm ngoài Top 50</p>
             </div>
           </div>
           <div className="flex flex-col items-end">
             <div className="flex items-center gap-1">
               <span className="text-lg font-black text-slate-200">{currentUser.stars || 0}</span>
               <Star className="w-4 h-4 fill-slate-500 text-slate-500" />
             </div>
             <p className="text-[10px] text-slate-400 font-bold uppercase italic mt-0.5">Leo Top ngay!</p>
           </div>
        </div>
      )}
    </div>
  );
};
