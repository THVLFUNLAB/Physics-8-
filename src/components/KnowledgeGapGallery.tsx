import React, { useEffect, useState } from 'react';
import { db, doc, getDoc } from '../firebase';
import type { Question } from '../types';
import { BrainCircuit, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import MathRenderer from '../lib/MathRenderer';
import { SkeletonCard } from './SkeletonLoader';

/**
 * Component hiển thị danh sách các câu hỏi trong Kho Ôn Tập (Knowledge Gap Vault).
 * Fetch dữ liệu thực từ Firestore dựa trên danh sách ID cung cấp.
 */
export default function KnowledgeGapGallery({ vaultIds }: { vaultIds: string[] }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    const fetchQuestions = async () => {
      if (!vaultIds || vaultIds.length === 0) {
        if (isMounted) {
          setQuestions([]);
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        // Lấy tối đa 10 câu gần đây nhất để không làm quá tải UI
        const recentIds = [...vaultIds].reverse().slice(0, 10);
        
        const promises = recentIds.map(id => getDoc(doc(db, 'questions', id)));
        const snaps = await Promise.all(promises);
        
        const qs: Question[] = [];
        snaps.forEach(snap => {
          if (snap.exists()) {
            qs.push({ id: snap.id, ...snap.data() } as Question);
          }
        });
        
        if (isMounted) {
          setQuestions(qs);
        }
      } catch (error) {
        console.error("Lỗi khi load câu hỏi từ kho ôn tập:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchQuestions();

    return () => {
      isMounted = false;
    };
  }, [vaultIds]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10 w-full">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} className="min-h-[160px]" />
        ))}
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="text-center py-12 bg-slate-950/30 rounded-2xl border border-slate-800 border-dashed relative z-10 w-full">
        <Archive className="w-12 h-12 text-slate-700 mx-auto mb-4" />
        <h4 className="text-lg font-bold text-slate-400 mb-2">Kho ôn tập trống</h4>
        <p className="text-sm text-slate-500">Các câu hỏi bạn làm sai sẽ được AI tự động thu thập vào đây để học lại.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10 w-full">
      {questions.map((q, idx) => {
        // Tag dựa vào level
        let tagStr = 'Khó';
        let tagColor = 'bg-red-500/10 text-red-500';
        if (q.level?.includes('Nhận biết') || q.level?.includes('Thông hiểu')) {
          tagStr = 'Dễ';
          tagColor = 'bg-green-500/10 text-green-500';
        } else if (q.level?.includes('Vận dụng')) {
          if (!q.level?.includes('cao')) {
            tagStr = 'Trung bình';
            tagColor = 'bg-orange-500/10 text-orange-500';
          }
        }

        return (
          <div key={idx} className="p-6 rounded-2xl bg-slate-950/50 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 transition-colors group cursor-default">
            <div className="flex justify-between mb-4">
              <span className={cn("text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded", tagColor)}>
                {tagStr}
              </span>
              <span className="text-xs font-medium text-slate-500 truncate max-w-[120px]">{q.topic || 'Không rõ'}</span>
            </div>
            <h4 className="font-bold text-white text-sm mb-2 group-hover:text-amber-500 transition-colors line-clamp-1">
              {q.topic ? `${q.topic} - Phần ${q.part}` : 'Câu hỏi ôn tập'}
            </h4>
            <div className="text-sm text-slate-400 line-clamp-2 md:h-10 overflow-hidden text-ellipsis">
              <MathRenderer content={q.content} />
            </div>
            <div className="flex justify-between items-center pt-5 mt-5 border-t border-slate-800">
              <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-blue-500 tracking-widest">
                <BrainCircuit className="w-4 h-4" /> Bắt bệnh
              </span>
              <button className="text-orange-500 font-bold text-sm flex items-center gap-1 hover:underline group-hover:text-orange-400">
                Giải ngay <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Trick for missing Archive icon import
import { Archive } from 'lucide-react';
