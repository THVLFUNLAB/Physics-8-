import React, { useState, useEffect } from 'react';
import { db, collection, onSnapshot, query, orderBy, limit } from '../firebase';
import { Exam } from '../types';
import { Play } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface ExamsListProps {
  onStartExam: (exam: Exam) => void;
}

export const ExamsList: React.FC<ExamsListProps> = ({ onStartExam }) => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGradeFilter, setSelectedGradeFilter] = useState<number | null>(null);

  useEffect(() => {
    // Listen for exams in realtime, ordered by creation time
    const q = query(collection(db, 'exams'), orderBy('createdAt', 'desc'), limit(30));
    const unsub = onSnapshot(q, (snapshot) => {
      const fetchedExams: Exam[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        // Chỉ hiển thị đề đã phát hành (published=true) hoặc đề cũ chưa có trường published
        if (data.published === true || data.published === undefined) {
          fetchedExams.push({ id: doc.id, ...data } as Exam);
        }
      });
      setExams(fetchedExams);
      setLoading(false);
    }, (error) => {
      console.error("Lỗi lấy danh sách bài kiểm tra:", error);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const filteredExams = selectedGradeFilter 
    ? exams.filter(e => e.targetGrade === selectedGradeFilter)
    : exams;

  return (
    <div className="mt-16 space-y-8 relative z-10 w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h3 className="text-xl sm:text-2xl font-black text-white flex items-center gap-3 uppercase tracking-widest font-headline">
          <span className="w-2 h-8 bg-red-600 rounded-full" />
          Danh sách bài kiểm tra
        </h3>
        
        <div className="flex bg-slate-800/50 p-1.5 rounded-xl border border-slate-700/50 overflow-x-auto w-full md:w-auto">
          {[
            { label: 'Tất cả', value: null },
            { label: 'Khối 12', value: 12 },
            { label: 'Khối 11', value: 11 },
            { label: 'Khối 10', value: 10 }
          ].map(tab => (
            <button
              key={tab.label}
              onClick={() => setSelectedGradeFilter(tab.value)}
              className={cn(
                "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex-1 md:flex-none",
                selectedGradeFilter === tab.value 
                  ? "bg-red-600 text-white shadow-lg shadow-red-600/20" 
                  : "text-slate-400 hover:text-white hover:bg-slate-700/50"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex gap-6 overflow-x-auto pb-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="min-w-[280px] sm:min-w-[320px] h-48 bg-slate-900 border border-slate-800 rounded-3xl animate-pulse" />
          ))}
        </div>
      ) : filteredExams.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-3xl text-center text-slate-500">
          Chưa có bài kiểm tra nào được phát hành cho khối này.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {filteredExams.map((exam, i) => (
              <motion.div
                key={exam.id || i}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.1 }}
                className="bg-slate-900/80 border border-slate-800 hover:border-red-600/50 p-6 rounded-3xl group transition-all duration-300 relative overflow-hidden flex flex-col"
              >
                {/* Status Badge */}
                <div className="absolute top-0 right-0 bg-red-600 text-[10px] font-black text-white px-3 py-1 rounded-bl-xl uppercase tracking-widest z-10">
                  {i === 0 ? 'Mới nhất' : 'Sẵn sàng'}
                </div>
                
                {/* Background flare */}
                <div className="absolute -inset-20 bg-gradient-to-br from-red-600/5 to-transparent blur-2xl opacity-0 group-hover:opacity-100 transition-opacity z-0" />

                <div className="relative z-10 flex-1 flex flex-col">
                  <h4 className="text-lg font-black text-white mb-4 line-clamp-2 uppercase">
                    {exam.title || exam.type || 'ĐỀ KIỂM TRA'}
                  </h4>
                  <div className="space-y-2 mb-6 flex-1">
                    <p className="text-xs text-slate-400 font-bold flex items-center justify-between">
                      <span className="uppercase text-slate-500">Thời gian:</span>
                      <span className="text-white">50 phút</span>
                    </p>
                    <p className="text-xs text-slate-400 font-bold flex items-center justify-between">
                      <span className="uppercase text-slate-500">Số câu hỏi:</span>
                      <span className="text-white">{exam.questions?.length || 0} câu</span>
                    </p>
                    {exam.targetGrade && (
                      <p className="text-xs font-bold flex items-center justify-between">
                        <span className="uppercase text-slate-500">Khối lớp:</span>
                        <span className="text-yellow-400">Khối {exam.targetGrade}</span>
                      </p>
                    )}
                    {exam.type && (
                      <p className="text-xs text-slate-400 font-bold flex items-center justify-between">
                        <span className="uppercase text-slate-500">Loại đề:</span>
                        <span className="text-cyan-400">{exam.type}</span>
                      </p>
                    )}
                  </div>
                  
                  <button 
                    onClick={() => onStartExam(exam)}
                    className="w-full bg-slate-950 border border-slate-800 hover:bg-red-600 hover:border-red-500 text-white px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2 group-hover:shadow-red-600/20"
                  >
                    Bắt đầu làm bài <Play className="w-4 h-4 fill-current" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};
