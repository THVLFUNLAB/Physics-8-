import React, { useState, useEffect, useMemo } from 'react';
import { db, collection, getDocs, setDoc, doc, serverTimestamp, query, where, orderBy } from '../firebase';
import { Exam, Question, OfflineSessionStudentRecord, OfflineSession, ExamReport } from '../types';
import { Save, FileCheck, Users, Search, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

// Chuyển index nội bộ (0, 1, 2, 3) thành string chữ cái (A, B, C, D)
const ALPHABET = ['A', 'B', 'C', 'D'];

export const OfflineDataEntry: React.FC<{
  assistantId: string;
}> = ({ assistantId }) => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  
  // Grid Data
  const [students, setStudents] = useState<OfflineSessionStudentRecord[]>([
    // Khởi tạo sẵn 1 dòng trắng
    { studentId: '', classCode: '', studentName: '', answers: {}, score: 0 }
  ]);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // 1. Fetch published exams
  useEffect(() => {
    const fetchExams = async () => {
      try {
        const q = query(
          collection(db, 'exams'), 
          where('published', '==', true),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exam));
        setExams(data);
      } catch (error) {
        console.error('Error fetching exams:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchExams();
  }, []);

  const selectedExam = useMemo(() => exams.find(e => e.id === selectedExamId), [exams, selectedExamId]);
  
  // Logic chuẩn bị Key
  const examKeyDict = useMemo(() => {
    if (!selectedExam || !selectedExam.questions) return {};
    const dict: Record<string, any> = {};
    selectedExam.questions.forEach((q, index) => {
      const qNum = `q${index + 1}`;
      if (q.part === 1) {
        // Part 1: correctAnswer is a number (index 0,1,2,3 mapped to A,B,C,D)
        const ansIndex = parseInt(q.correctAnswer as any, 10);
        dict[qNum] = !isNaN(ansIndex) ? ALPHABET[ansIndex] : null;
      } else if (q.part === 3) {
        // Part 3: numeric answer (stored as string or number)
        dict[qNum] = q.correctAnswer;
      }
      // Part 2 (True/False) skip cho đơn giản, hoặc xử lý sau nếu có nhu cầu thi Offline Part 2
    });
    return dict;
  }, [selectedExam]);

  // Handle cell change
  const handleAnswerChange = (rowIndex: number, qNum: string, value: string) => {
    const newStudents = [...students];
    const valUpper = value.toUpperCase();
    newStudents[rowIndex].answers[qNum] = valUpper;
    
    // Auto-calculate score
    let correctCount = 0;
    let totalScoreable = 0; // Số câu hỏi hỗ trợ chấm offline
    
    // Evaluate full map
    Object.keys(examKeyDict).forEach(key => {
      totalScoreable++;
      const stdAns = newStudents[rowIndex].answers[key] || '';
      const correctAns = String(examKeyDict[key] || '').toUpperCase();
      if (stdAns && stdAns === correctAns) {
        correctCount++;
      }
    });

    // Tính điểm thang 10
    if (totalScoreable > 0) {
      newStudents[rowIndex].score = (correctCount / totalScoreable) * 10;
    }
    setStudents(newStudents);
  };

  const handleInfoChange = (rowIndex: number, field: keyof OfflineSessionStudentRecord, value: string) => {
    const newStudents = [...students];
    (newStudents[rowIndex][field] as any) = value;
    setStudents(newStudents);
  };

  const addRow = () => {
    setStudents([
      ...students, 
      { studentId: '', classCode: '', studentName: '', answers: {}, score: 0 }
    ]);
  };

  const removeRow = (index: number) => {
    setStudents(students.filter((_, i) => i !== index));
  };

  // ── SAVE & MACRO ANALYTICS ──
  const handleSaveBatch = async () => {
    if (!selectedExam) return;
    // Lọc các dòng rỗng
    const validStudents = students.filter(s => s.studentName?.trim() || s.studentId?.trim());
    if (validStudents.length === 0) {
      alert('Chưa có dữ liệu hợp lệ để lưu.');
      return;
    }

    setSaving(true);
    setSuccessMsg('');

    try {
      // 1. Lưu OfflineSession
      const sessionId = `offline_${selectedExam.id}_${Date.now()}`;
      const sessionDoc: OfflineSession = {
        examId: selectedExam.id!,
        examTitle: selectedExam.title,
        assistantId,
        createdAt: serverTimestamp(),
        records: validStudents
      };
      await setDoc(doc(db, 'offline_session_records', sessionId), sessionDoc);

      // 2. Tính toán & Cập nhật ExamReport (Macro)
      let totalScore = 0;
      const distribution: Record<string, number> = {
        "0-2": 0, "2-4": 0, "4-6": 0, "6-8": 0, "8-10": 0
      };
      
      const qStats: Record<string, { correct: number, wrong: number, accuracy: number }> = {};
      
      // Init qStats
      Object.keys(examKeyDict).forEach(k => {
        qStats[k] = { correct: 0, wrong: 0, accuracy: 0 };
      });

      validStudents.forEach(st => {
        totalScore += st.score;
        // Điểm phân phổ
        if (st.score <= 2) distribution["0-2"]++;
        else if (st.score <= 4) distribution["2-4"]++;
        else if (st.score <= 6) distribution["4-6"]++;
        else if (st.score <= 8) distribution["6-8"]++;
        else distribution["8-10"]++;

        // Câu hỏi
        Object.keys(examKeyDict).forEach(k => {
          const sAns = (st.answers[k] || '').toUpperCase();
          const cAns = String(examKeyDict[k] || '').toUpperCase();
          if (sAns === cAns) qStats[k].correct++;
          else qStats[k].wrong++;
        });
      });

      // Accuracy
      Object.keys(qStats).forEach(k => {
        const totalAttempts = qStats[k].correct + qStats[k].wrong;
        if (totalAttempts > 0) {
          qStats[k].accuracy = Math.round((qStats[k].correct / totalAttempts) * 100);
        }
      });

      const report: ExamReport = {
        examId: selectedExam.id!,
        totalParticipants: validStudents.length,
        averageScore: validStudents.length > 0 ? (totalScore / validStudents.length) : 0,
        scoreDistribution: distribution,
        questionStats: qStats,
        weakTopics: [], // Tính sau nếu cần query topic
        computedAt: serverTimestamp()
      };

      // Upsert Báo cáo
      await setDoc(doc(db, 'exam_reports', selectedExam.id!), report);

      setSuccessMsg(`Lưu thành công bảng điểm! Đã phân tích ${validStudents.length} học sinh.`);
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (error) {
      console.error('Error saving batch:', error);
      alert('Lỗi lưu dữ liệu: ' + (error as any).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Đang tải danh sách đề...</div>;
  }

  // Cột câu hỏi: Chỉ render các câu mà hệ thống sinh ra key được (Part 1, 3)
  const questionKeys = Object.keys(examKeyDict);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-3">
             <div className="p-3 bg-cyan-600/20 rounded-2xl">
              <RefreshCw className="w-6 h-6 text-cyan-400" />
            </div>
            NHẬP ĐIỂM OFFLINE
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Nhập bài làm từ học sinh. Chấm tự động (Client-side) và tối ưu hóa Firebase Write.
          </p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6">
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
          Chọn Đợt Thi / Mã Đề
        </label>
        <select 
          className="w-full md:w-96 p-3 bg-slate-800 border-slate-700 rounded-xl text-white outline-none focus:border-cyan-500 transition-colors"
          value={selectedExamId}
          onChange={(e) => setSelectedExamId(e.target.value)}
        >
          <option value="">-- Chọn đề thi --</option>
          {exams.map(e => (
            <option key={e.id} value={e.id}>{e.title}</option>
          ))}
        </select>
        
        {selectedExam && (
          <div className="mt-3 text-sm text-amber-400 font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Lưu ý: Part 2 (Đúng/Sai) hiện ẩn trong chế độ nhập nhanh Offline.
          </div>
        )}
      </div>

      {selectedExam && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          {/* Controls */}
          <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
             <button 
                onClick={addRow}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-bold border border-slate-600 transition-colors"
              >
                + Thêm Hàng
             </button>
             <button 
                onClick={handleSaveBatch}
                disabled={saving}
                className={cn(
                  "px-5 py-2.5 rounded-lg text-sm font-black flex items-center gap-2 transition-all shadow-lg",
                  saving 
                    ? "bg-slate-700 text-slate-400 cursor-not-allowed" 
                    : "bg-cyan-600 text-white hover:bg-cyan-500 shadow-cyan-600/20"
                )}
              >
                <Save className="w-4 h-4" />
                {saving ? "ĐANG LƯU..." : "LƯU TRÊN SERVER & PHÂN TÍCH"}
             </button>
          </div>

          {/* Hàng thông báo */}
          {successMsg && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }} 
              animate={{ height: 'auto', opacity: 1 }}
              className="bg-emerald-600/20 border-b border-emerald-500/30 px-4 py-3 text-emerald-400 text-sm font-bold flex items-center gap-2"
            >
              <FileCheck className="w-4 h-4" />
              {successMsg}
            </motion.div>
          )}

          {/* Grid View */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-slate-800/80 border-b border-slate-700">
                <tr>
                  <th className="p-3 w-10 text-center text-slate-500 font-black text-[10px] sticky left-0 bg-slate-800 z-10">
                    #
                  </th>
                  <th className="p-3 w-32 sticky left-10 bg-slate-800 z-10 text-[10px] uppercase font-black text-slate-400">
                    Mã Lớp
                  </th>
                  <th className="p-3 w-48 sticky left-[168px] bg-slate-800 z-10 text-[10px] uppercase font-black text-slate-400">
                    Họ Tên HS
                  </th>
                  {questionKeys.map((k) => (
                    <th key={k} className="p-3 min-w-[50px] text-center text-[10px] uppercase font-black text-indigo-400">
                      {k}
                    </th>
                  ))}
                  <th className="p-3 w-20 text-center sticky right-0 bg-slate-800 z-10 text-[10px] uppercase font-black text-slate-400 shadow-[-4px_0_10px_rgba(0,0,0,0.2)]">
                    ĐIỂM
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((st, idx) => (
                  <tr key={idx} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                    <td className="p-2 text-center text-xs text-slate-600 font-mono sticky left-0 bg-slate-900 z-10">
                      <button 
                        onClick={() => removeRow(idx)}
                        className="text-red-500 hover:text-red-400 font-black h-6 w-6 rounded hover:bg-red-500/10"
                      >
                        ×
                      </button>
                    </td>
                    <td className="p-2 sticky left-10 bg-slate-900 z-10">
                      <input 
                        type="text" 
                        value={st.classCode || ''}
                        onChange={(e) => handleInfoChange(idx, 'classCode', e.target.value)}
                        placeholder="VD: 12A1"
                        className="w-full bg-slate-800/50 border border-slate-700 rounded px-2 py-1.5 text-xs text-white uppercase focus:border-cyan-500 outline-none"
                      />
                    </td>
                    <td className="p-2 sticky left-[168px] bg-slate-900 z-10 border-r border-slate-800/80">
                      <input 
                        type="text" 
                        value={st.studentName || ''}
                        onChange={(e) => handleInfoChange(idx, 'studentName', e.target.value)}
                        placeholder="Họ Tên..."
                        className="w-full bg-slate-800/50 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:border-cyan-500 outline-none"
                      />
                    </td>
                    
                    {questionKeys.map((k) => {
                      const ans = st.answers[k] || '';
                      const isCorrect = ans && ans.toUpperCase() === String(examKeyDict[k]).toUpperCase();
                      const isFilledOut = ans.length > 0;
                      
                      return (
                        <td key={k} className="p-1 px-2 text-center h-10 align-middle">
                          <input 
                            type="text"
                            maxLength={ans.length > 2 ? undefined : 4}
                            value={ans}
                            onChange={(e) => handleAnswerChange(idx, k, e.target.value)}
                            className={cn(
                              "w-10 h-8 text-center text-xs font-bold rounded outline-none transition-all border",
                              isFilledOut
                                ? isCorrect 
                                  ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
                                  : "bg-red-500/20 border-red-500/50 text-red-400"
                                : "bg-slate-800/30 border-slate-700 text-slate-300 focus:bg-slate-700 focus:border-cyan-500"
                            )}
                          />
                        </td>
                      );
                    })}

                    <td className="p-2 text-center sticky right-0 bg-slate-900 z-10 shadow-[-4px_0_10px_rgba(0,0,0,0.2)]">
                      <span className={cn(
                        "text-sm font-black",
                        st.score >= 8 ? "text-emerald-400" :
                        st.score >= 5 ? "text-amber-400" : "text-red-400"
                      )}>
                        {st.score.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
