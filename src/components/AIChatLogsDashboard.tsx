import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, limit as fsLimit } from 'firebase/firestore';
import { BrainCircuit, Search, Clock, User, MessageSquare, X, ChevronRight, Hash } from 'lucide-react';
import MathRenderer from '../lib/MathRenderer';
import { cn } from '../lib/utils';

interface AIChatLog {
  id: string;
  studentId: string;
  studentName: string;
  questionContent: string;
  studentChat: string;
  aiResponse: string;
  timestamp: any;
}

export default function AIChatLogsDashboard() {
  const [logs, setLogs] = useState<AIChatLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState<AIChatLog | null>(null);

  useEffect(() => {
    // Chỉ lấy 200 log gần nhất
    const q = query(
      collection(db, 'ai_chat_logs'),
      orderBy('timestamp', 'desc'),
      fsLimit(200)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AIChatLog[];
      setLogs(data);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching AI Chat Logs:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredLogs = useMemo(() => {
    if (!searchTerm) return logs;
    const lowerTerm = searchTerm.toLowerCase();
    return logs.filter(log => 
      log.studentName.toLowerCase().includes(lowerTerm) || 
      log.studentChat.toLowerCase().includes(lowerTerm) ||
      log.aiResponse.toLowerCase().includes(lowerTerm)
    );
  }, [logs, searchTerm]);

  // Nhóm theo ngày
  const groupedLogs = useMemo(() => {
    const groups: { [key: string]: AIChatLog[] } = {};
    filteredLogs.forEach(log => {
      const date = log.timestamp?.toDate ? log.timestamp.toDate() : new Date();
      const dateStr = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(log);
    });
    return groups;
  }, [filteredLogs]);

  const formatDate = (ts: any) => {
    if (!ts || !ts.toDate) return 'N/A';
    const date = ts.toDate();
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-white uppercase tracking-tight flex items-center gap-3">
            <BrainCircuit className="w-8 h-8 text-cyan-400" /> 
            Log Tương Tác Giữa Học Sinh & Thầy Hậu AI
          </h2>
          <p className="text-slate-400 mt-2 text-sm max-w-2xl">
            Giám sát thời gian thực các cuộc trò chuyện. Xem học sinh đang thắc mắc gì và AI trả lời ra sao để thu thập insight bệnh án chuẩn xác nhất.
          </p>
        </div>

        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Tìm theo tên học sinh, nội dung..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-72 bg-slate-900 border border-slate-700 rounded-xl py-2.5 pl-9 pr-4 text-sm text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all font-medium placeholder:text-slate-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center flex flex-col items-center">
          <MessageSquare className="w-12 h-12 text-slate-700 mb-4" />
          <p className="text-slate-400 text-lg font-medium">Chưa có bản ghi tương tác nào.</p>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 space-y-6">
            {Object.keys(groupedLogs).map(dateStr => (
              <div key={dateStr} className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="h-px bg-slate-800 flex-1" />
                  <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{dateStr}</span>
                  <div className="h-px bg-slate-800 flex-1" />
                </div>
                
                <div className="grid gap-3">
                  {groupedLogs[dateStr].map(log => (
                    <div 
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className={cn(
                        "bg-slate-900 border p-4 rounded-2xl cursor-pointer transition-all hover:-translate-y-0.5",
                        selectedLog?.id === log.id 
                          ? "border-cyan-500 shadow-[0_0_15px_rgba(34,211,238,0.15)]" 
                          : "border-slate-800 hover:border-slate-600"
                      )}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0">
                            <User className="w-4 h-4 text-slate-400" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">{log.studentName}</p>
                            <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-black tracking-wider">
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDate(log.timestamp)}</span>
                              <span>&bull;</span>
                              <span className="truncate max-w-[120px] text-cyan-500">{log.studentId.slice(0,8)}...</span>
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-600" />
                      </div>
                      <div className="space-y-2">
                        <div className="bg-slate-800/50 rounded-xl p-3 text-sm text-slate-300 font-medium italic line-clamp-2">
                          "{log.studentChat}"
                        </div>
                        <div className="bg-cyan-950/30 border border-cyan-500/20 rounded-xl p-3 text-[13px] text-cyan-200 line-clamp-2">
                          {log.aiResponse}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Chi tiết Log */}
          {selectedLog && (
            <div className="w-full lg:w-[450px] shrink-0">
              <div className="sticky top-6 bg-slate-950 border border-slate-800 rounded-3xl p-6 shadow-2xl overflow-hidden hover:border-slate-700 transition-colors">
                 <div className="flex justify-between items-center mb-6">
                   <h3 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
                     <Hash className="w-5 h-5 text-cyan-500" /> Chi tiết tương tác
                   </h3>
                   <button onClick={() => setSelectedLog(null)} className="p-2 bg-slate-900 rounded-xl text-slate-400 hover:text-white transition-colors">
                     <X className="w-4 h-4" />
                   </button>
                 </div>

                 <div className="space-y-6">
                    {/* Thông tin HS */}
                    <div className="flex items-center gap-3 pb-6 border-b border-slate-800/50">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center border-2 border-slate-950 shadow-lg">
                        <User className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <p className="font-bold text-white tracking-wide">{selectedLog.studentName}</p>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black">ID: {selectedLog.studentId}</p>
                      </div>
                    </div>

                    {/* Câu hỏi gốc */}
                     <div>
                       <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">ĐỀ BÀI (HỌC SINH ĐANG LÀM)</p>
                       <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                         <div className="text-sm text-slate-300 [&_.katex]:!text-sm [&_.katex-display]:!my-1">
                           <MathRenderer content={selectedLog.questionContent} />
                         </div>
                       </div>
                     </div>

                    {/* Câu học sinh nói */}
                     <div>
                       <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest mb-2 flex items-center gap-1">HỌC SINH HỎI</p>
                       <div className="bg-violet-900/20 border border-violet-500/30 p-4 rounded-2xl rounded-tr-sm ml-4">
                         <p className="text-sm text-violet-100 font-medium italic">"{selectedLog.studentChat}"</p>
                       </div>
                     </div>

                    {/* Thầy Hậu AI trả lời */}
                     <div>
                       <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-2 flex items-center gap-1">THẦY HẬU AI ĐÁP</p>
                       <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl rounded-tl-sm mr-4">
                         <div className="text-sm text-slate-200 [&_.katex]:!text-sm [&_.katex-display]:!my-1">
                           <MathRenderer content={selectedLog.aiResponse} />
                         </div>
                       </div>
                     </div>
                 </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
