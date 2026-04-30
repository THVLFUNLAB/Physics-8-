import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db as newDb, app, handleFirestoreError, OperationType } from '../firebase';
import { initializeFirestore, collection, getDocs, doc, setDoc, writeBatch, where, query } from 'firebase/firestore';
import { Database, Play, AlertTriangle, CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from './Toast';

// Initialize the OLD database instance
const OLD_DB_ID = "ai-studio-bcba3130-d40a-41ac-adf2-90526578a2ea";
let oldDb: any = null;

const COLLECTIONS = [
  "questions",
  "clusters", 
  "users",
  "exams",
  "attempts",
  "classAttempts",
  "classes",
  "classExams",
  "metadata",
  "motivational_quotes",
  "reportedQuestions",
  "simulations",
  "loginLogs"
];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const DatabaseMigrationTool = () => {
  const [isMigrating, setIsMigrating] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [currentCollection, setCurrentCollection] = useState<string>('');
  
  // Quota migration state
  const [isQuotaMigrating, setIsQuotaMigrating] = useState(false);
  const [quotaResult, setQuotaResult] = useState<string>('');
  
  // Progress states
  const [progress, setProgress] = useState<Record<string, { total: number; done: number; failed: number; status: 'waiting' | 'reading' | 'writing' | 'done' | 'error' }>({});
  
  // Logs
  const [logs, setLogs] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize progress map
  useEffect(() => {
    try {
      if (!oldDb) {
        // Safe init ensuring it doesn't crash if app isn't ready
        oldDb = initializeFirestore(app, {}, OLD_DB_ID);
      }
    } catch (e) {
      console.error("Failed to init old DB", e);
    }

    const initialProgress: any = {};
    COLLECTIONS.forEach(c => {
      initialProgress[c] = { total: 0, done: 0, failed: 0, status: 'waiting' };
    });
    setProgress(initialProgress);
  }, []);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString('vi-VN')}] ${msg}`]);
    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, 100);
  };

  const chunkArray = (array: any[], size: number) => {
    const chunked = [];
    let index = 0;
    while (index < array.length) {
      chunked.push(array.slice(index, size + index));
      index += size;
    }
    return chunked;
  };

  const migrateQuota = async () => {
    setIsQuotaMigrating(true);
    setQuotaResult('');
    try {
      const snapshot = await getDocs(collection(newDb, 'users'));
      let updated = 0, skipped = 0, errors = 0;
      const BATCH_MAX = 400;
      let batch = writeBatch(newDb);
      let batchCount = 0;

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        // Bỏ qua VIP
        if (data.tier === 'vip' || data.isUnlimited === true) { skipped++; continue; }
        // Đã là 20 rồi
        if (data.maxAttempts === 20) { skipped++; continue; }
        // Bảo vệ học sinh đã dùng > 20 lượt
        if ((data.usedAttempts || 0) > 20) { skipped++; continue; }

        batch.update(doc(newDb, 'users', docSnap.id), { maxAttempts: 20 });
        batchCount++;
        updated++;

        if (batchCount >= BATCH_MAX) {
          await batch.commit();
          batch = writeBatch(newDb);
          batchCount = 0;
        }
      }
      if (batchCount > 0) await batch.commit();

      const msg = `✅ Xong! Đã cập nhật ${updated} học sinh (30→20). Bỏ qua ${skipped} (VIP / đã đúng / bảo vệ).`;
      setQuotaResult(msg);
      toast.success(`Cập nhật quota thành công: ${updated} học sinh`);
    } catch (e: any) {
      const msg = `❌ Lỗi: ${e.message}`;
      setQuotaResult(msg);
      toast.error('Lỗi migration quota: ' + e.message);
    } finally {
      setIsQuotaMigrating(false);
    }
  };

  const handleStartMigration = async () => {
    if (isMigrating) return;
    
    if (!pendingConfirm) {
      setPendingConfirm(true);
      setTimeout(() => setPendingConfirm(false), 5000); // Tự hủy confirm sau 5s
      return;
    }

    setPendingConfirm(false);

    if (!oldDb) {
      toast.error('Chưa kết nối được Firebase cũ. Xem console log.');
      addLog('❌ LỖI: `oldDb` instance chưa được khởi tạo!');
      return;
    }

    setIsMigrating(true);
    setIsFinished(false);
    setLogs([]);
    addLog(`🚀 Bắt đầu quá trình Migration Siêu tốc bằng quyền Admin.`);

    let totalDocs = 0;
    let totalMigrated = 0;

    for (const col of COLLECTIONS) {
      setCurrentCollection(col);
      setProgress(prev => ({ ...prev, [col]: { ...prev[col], status: 'reading' } }));
      addLog(`Đang đọc collection: [${col}]...`);
      
      try {
        const querySnapshot = await getDocs(collection(oldDb, col));
        const docs = querySnapshot.docs;
        
        if (docs.length === 0) {
          setProgress(prev => ({ ...prev, [col]: { ...prev[col], status: 'done', total: 0 } }));
          addLog(`Collection [${col}] trống. Bỏ qua.`);
          continue;
        }

        totalDocs += docs.length;
        setProgress(prev => ({ ...prev, [col]: { ...prev[col], status: 'writing', total: docs.length } }));
        addLog(`Tìm thấy ${docs.length} documents trong [${col}]. Bắt đầu ghi...`);

        // Chia chunk để ghi (20 docs / chunk)
        const chunks = chunkArray(docs, 20);
        let docsDone = 0;
        let docsFailed = 0;

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const promises = chunk.map(async (docSnapshot) => {
             const data = docSnapshot.data();
             const ref = doc(newDb, col, docSnapshot.id);
             try {
               await setDoc(ref, data);
               return true;
             } catch (err: any) {
               console.error(`Error migrating ${col}/${docSnapshot.id}`, err);
               return false;
             }
          });

          const results = await Promise.all(promises);
          
          const successCount = results.filter(Boolean).length;
          const failCount = results.length - successCount;

          docsDone += successCount;
          docsFailed += failCount;
          totalMigrated += successCount;

          setProgress(prev => ({ 
            ...prev, 
            [col]: { ...prev[col], done: docsDone, failed: docsFailed } 
          }));

          // Nghỉ 100ms giữa các chunk để không làm nghẽn Client SDK
          await sleep(100);
        }

        setProgress(prev => ({ 
          ...prev, 
          [col]: { ...prev[col], status: docsFailed > 0 ? 'error' : 'done' } 
        }));
        
        addLog(`Đã xong [${col}]. Thành công: ${docsDone}, Lỗi: ${docsFailed}.`);

      } catch (error: any) {
        console.error(`Failed to read collection ${col}:`, error);
        addLog(`❌ LỖI đọc collection [${col}]: ${error.message}`);
        setProgress(prev => ({ ...prev, [col]: { ...prev[col], status: 'error' } }));
        if (error.message.includes('permission')) {
           toast.error('Lỗi Quyền Truy Cập (403). Đảm bảo Thầy đang dùng Auth Admin.');
           break; // Stop immediately if missing auth permission
        }
      }
    }

    addLog(`🎉 HOÀN TẤT MIGRATION. Tổng số doc đã chuyển: ${totalMigrated}/${totalDocs}.`);
    setIsMigrating(false);
    setIsFinished(true);
    setCurrentCollection('');
    toast.success('Đồng bộ dữ liệu thành công mĩ mãn!');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* ── QUOTA MIGRATION CARD ── */}
      <div className="bg-slate-900 border border-amber-500/30 p-6 rounded-[2rem] flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center border border-amber-500/30">
            <RefreshCw className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-black text-white">Cập nhật Quota FREE: 30 → 20 lượt</h3>
            <p className="text-xs text-slate-400 mt-0.5">Chỉ update user FREE (bỏ qua VIP & user đã dùng &gt;20 lượt để không lock họ đột ngột)</p>
            {quotaResult && (
              <p className={`text-xs mt-1 font-bold ${quotaResult.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>{quotaResult}</p>
            )}
          </div>
        </div>
        <button
          onClick={migrateQuota}
          disabled={isQuotaMigrating}
          className={cn(
            "shrink-0 flex items-center gap-2 px-6 py-3 rounded-xl font-black text-sm uppercase tracking-widest transition-all",
            isQuotaMigrating
              ? "bg-slate-800 text-slate-500 cursor-not-allowed"
              : "bg-amber-500 hover:bg-amber-400 text-black shadow-[0_0_20px_rgba(251,191,36,0.3)] hover:scale-105"
          )}
        >
          {isQuotaMigrating ? <><Loader2 className="w-4 h-4 animate-spin" /> Đang cập nhật...</> : <><RefreshCw className="w-4 h-4" /> Chạy Ngay</>}
        </button>
      </div>

      {/* HEADER */}
      <div className="bg-slate-900 border border-slate-800 p-8 rounded-[2rem] flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
        {isMigrating && (
          <div className="absolute inset-0 bg-blue-500/5 animate-pulse" />
        )}
        <div className="flex items-center gap-6 relative z-10 w-full md:w-auto">
          <div className="w-16 h-16 bg-blue-600/20 text-blue-500 rounded-2xl flex items-center justify-center flex-shrink-0 border border-blue-500/30">
            <Database className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl md:text-3xl font-black text-white uppercase tracking-tight flex items-center gap-3">
              Cổng Dịch Chuyển Dữ Liệu
              {isMigrating && <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />}
            </h2>
            <p className="text-slate-400 mt-2 text-sm md:text-base leading-relaxed max-w-xl">
              Công cụ đồng bộ hoá chuyên sâu. Xóa bỏ hoàn toàn rào cản 403 bằng cách gán quyền Admin cục bộ. Dữ liệu sẽ chảy từ <span className="text-orange-400 font-bold">AI Studio</span> sang <span className="text-blue-400 font-bold">Default (Blaze)</span>.
            </p>
          </div>
        </div>

        <button
          onClick={handleStartMigration}
          disabled={isMigrating}
          className={cn(
            "relative group overflow-hidden pl-8 pr-10 py-4 rounded-xl font-black uppercase tracking-widest text-sm flex items-center gap-3 transition-all z-10 whitespace-nowrap w-full md:w-auto justify-center",
            isMigrating 
              ? "bg-slate-800 text-slate-500 cursor-not-allowed"
              : isFinished 
                ? "bg-emerald-600 text-white hover:bg-emerald-500" 
                : pendingConfirm
                  ? "bg-red-600 text-white hover:bg-red-500 animate-pulse shadow-[0_0_40px_-10px_rgba(220,38,38,0.5)]"
                  : "bg-blue-600 text-white hover:bg-blue-500 hover:scale-105 active:scale-95 shadow-[0_0_40px_-10px_rgba(37,99,235,0.5)]"
          )}
        >
          {isMigrating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" /> Đang chuyển...
            </>
          ) : isFinished ? (
            <>
              <CheckCircle2 className="w-5 h-5" /> Đã hoàn tất
            </>
          ) : pendingConfirm ? (
            <>
              <AlertTriangle className="w-5 h-5" /> Xác nhận Dịch chuyển?
            </>
          ) : (
            <>
              <Play className="w-5 h-5" /> Bắt đầu dịch chuyển
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* TIẾN ĐỘ COLLECTIONS */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 p-6 rounded-[2rem] space-y-4">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Các phân vùng Dữ liệu</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {COLLECTIONS.map(col => {
              const stat = progress[col] || { total: 0, done: 0, failed: 0, status: 'waiting' };
              const isCurrent = currentCollection === col;
              
              let pct = 0;
              if (stat.total > 0) {
                pct = Math.round((stat.done / stat.total) * 100);
              }

              return (
                <div key={col} className={cn(
                  "p-4 rounded-xl border transition-all duration-300",
                  isCurrent ? "bg-blue-900/20 border-blue-500/50" : "bg-slate-950/50 border-slate-800",
                  stat.status === 'done' && stat.total > 0 && "border-emerald-500/30 bg-emerald-950/20",
                  stat.status === 'error' && "border-red-500/30 bg-red-950/20"
                )}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={cn("text-xs font-bold uppercase tracking-wider", 
                      isCurrent ? "text-blue-400" : stat.status === 'done' ? "text-emerald-500" : "text-slate-300"
                    )}>
                      {col}
                    </span>
                    {stat.status === 'reading' && <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />}
                    {stat.status === 'writing' && <span className="text-[10px] text-blue-400 font-bold">{pct}%</span>}
                    {stat.status === 'done' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    {stat.status === 'error' && <AlertTriangle className="w-4 h-4 text-red-500" />}
                  </div>

                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden mb-2">
                    <motion.div 
                      className={cn("h-full rounded-full transition-all duration-300", 
                        stat.status === 'error' ? "bg-red-500" : "bg-blue-500"
                      )}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-[10px] text-slate-500 font-medium">
                    <span>Tổng: {stat.total || '--'}</span>
                    <span>Xong: {stat.done} {stat.failed > 0 && <span className="text-red-400 ml-1">(Lỗi: {stat.failed})</span>}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* LOG TERMINAL */}
        <div className="bg-slate-950 border border-slate-800 p-6 rounded-[2rem] flex flex-col h-[500px] lg:h-auto">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live Logs
          </h3>
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto bg-black p-4 rounded-xl border border-slate-900 font-mono text-xs text-slate-400 space-y-2 custom-scrollbar"
          >
            {logs.length === 0 ? (
              <span className="text-slate-600 opacity-50"># Hệ thống đang chờ lệnh...</span>
            ) : (
              logs.map((log, i) => (
                <div key={i} className={cn(
                  log.includes('LỖI') ? "text-red-400" : log.includes('Thành công') || log.includes('HOÀN TẤT') ? "text-emerald-400" : ""
                )}>
                  {log}
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default DatabaseMigrationTool;
