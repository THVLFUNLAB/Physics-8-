import React, { useState, useEffect } from 'react';
import { db, collection, onSnapshot, doc, updateDoc } from '../firebase';
import { UserProfile, ClassRoom } from '../types';
import { toast } from './Toast';
import { Contact, Search, CheckSquare, Square, Users, Crown, ShieldOff } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { StudentMicroProfiler } from './StudentMicroProfiler';
import { isVipUser } from '../lib/userUtils';

export const StudentDirectory: React.FC = () => {
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedClassToAssign, setSelectedClassToAssign] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  // Micro Profiler
  const [profilerOpen, setProfilerOpen] = useState(false);
  const [selectedStudentForProfile, setSelectedStudentForProfile] = useState<UserProfile | null>(null);

  // ── Real-time listener: Học sinh (live sync từ Firestore) ──
  useEffect(() => {
    const q = collection(db, 'users');
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ ...d.data(), uid: d.id } as UserProfile));
      setStudents(data.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
    });
    return unsub;
  }, []);

  // ── Real-time listener: Lớp học ──
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'classes'), (snap) => {
      setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() } as ClassRoom)));
    });
    return unsub;
  }, []);

  // Inline edit handler
  const handleUpdateStudent = async (uid: string, field: 'displayName' | 'className' | 'schoolYear' | 'role', value: string) => {
    try {
      await updateDoc(doc(db, 'users', uid), { [field]: value.trim() });
      toast.success('Đã cập nhật thông tin học viên');
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Lỗi khi cập nhật thông tin');
    }
  };

  const handleBulkAssign = async () => {
    if (selectedIds.size === 0) return toast.error('Vui lòng chọn ít nhất 1 học sinh');
    if (!selectedClassToAssign) return toast.error('Vui lòng chọn lớp để thêm vào');

    setIsAssigning(true);
    try {
      const classRef = doc(db, 'classes', selectedClassToAssign);
      const targetClass = classes.find(c => c.id === selectedClassToAssign);
      
      if (!targetClass) throw new Error('Không tìm thấy lớp');

      // Add selected IDs to existing studentIds without duplicates
      const currentStudentIds = targetClass.studentIds || [];
      const newStudentIds = Array.from(new Set([...currentStudentIds, ...Array.from(selectedIds)]));

      await updateDoc(classRef, { studentIds: newStudentIds });
      
      toast.success(`Đã thêm thành công ${selectedIds.size} học viên vào lớp ${targetClass.name}`);
      setSelectedIds(new Set()); // clear selection
      setSelectedClassToAssign('');
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Lỗi khi gom nhóm hàng loạt');
    } finally {
      setIsAssigning(false);
    }
  };

  // ── Bulk: Cấp VIP cho nhiều học sinh ──
  const handleBulkGrantVIP = async () => {
    if (selectedIds.size === 0) return toast.error('Vui lòng chọn ít nhất 1 học sinh');
    if (!window.confirm(`Xác nhận cấp VIP Vô cực cho ${selectedIds.size} tài khoản?`)) return;

    setIsAssigning(true);
    let ok = 0;
    try {
      for (const uid of Array.from(selectedIds)) {
        try {
          await updateDoc(doc(db, 'users', uid), { tier: 'vip', isUnlimited: true, maxAttempts: 9999 });
          ok++;
        } catch (err: any) {
          toast.error(`Lỗi cấp VIP: ${err?.message || 'Unknown'}`);
          break;
        }
      }
      if (ok > 0) {
        toast.success(`✅ Đã cấp VIP cho ${ok} học viên!`);
        setSelectedIds(new Set());
      }
    } finally {
      setIsAssigning(false);
    }
  };

  // ── Bulk: Thu hồi VIP (hạ xuống FREE) cho nhiều học sinh ──
  const handleBulkRevokeVIP = async () => {
    if (selectedIds.size === 0) return toast.error('Vui lòng chọn ít nhất 1 học sinh');
    if (!window.confirm(`Xác nhận HẠ XUỐNG FREE cho ${selectedIds.size} tài khoản?`)) return;

    setIsAssigning(true);
    let ok = 0;
    try {
      for (const uid of Array.from(selectedIds)) {
        try {
          await updateDoc(doc(db, 'users', uid), { tier: 'free', isUnlimited: false, maxAttempts: 20 });
          ok++;
        } catch (err: any) {
          toast.error(`Lỗi thu hồi VIP: ${err?.message || 'Unknown'}`);
          break;
        }
      }
      if (ok > 0) {
        toast.success(`🔄 Đã hạ xuống FREE cho ${ok} học viên!`);
        setSelectedIds(new Set());
      }
    } finally {
      setIsAssigning(false);
    }
  };

  // ── Toggle VIP/FREE cho 1 học sinh trực tiếp (click badge) ──
  const handleToggleVIP = async (student: UserProfile) => {
    const isVip = isVipUser(student);
    const action = isVip ? 'hạ xuống FREE' : 'nâng lên VIP';
    if (!window.confirm(`Xác nhận ${action} tài khoản: ${student.displayName || student.email}?`)) return;

    try {
      if (isVip) {
        await updateDoc(doc(db, 'users', student.uid), { tier: 'free', isUnlimited: false, maxAttempts: 20 });
        toast.success(`🔄 ${student.displayName} đã hạ xuống FREE`);
      } else {
        await updateDoc(doc(db, 'users', student.uid), { tier: 'vip', isUnlimited: true, maxAttempts: 9999 });
        toast.success(`🌟 ${student.displayName} đã được nâng lên VIP!`);
      }
    } catch (err: any) {
      toast.error(`Lỗi: ${err?.message || 'Unknown'}`);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredStudents.length && filteredStudents.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredStudents.map(s => s.uid)));
    }
  };

  const toggleSelectOne = (uid: string) => {
    const next = new Set(selectedIds);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    setSelectedIds(next);
  };

  const filteredStudents = students.filter(s => {
    const term = searchTerm.toLowerCase();
    return String(s.displayName || '').toLowerCase().includes(term) || 
           String(s.email || '').toLowerCase().includes(term) ||
           String(s.className || '').toLowerCase().includes(term);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-2xl font-black text-white flex items-center gap-3">
            <div className="p-3 bg-cyan-600/20 rounded-2xl">
              <Contact className="w-7 h-7 text-cyan-400" />
            </div>
            DANH BẠ HỌC VIÊN
          </h3>
          <p className="text-slate-400 text-sm mt-1">Quản lý hồ sơ học sinh, xếp lớp hàng loạt</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Search */}
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Tìm theo tên, email, lớp..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:border-cyan-500 outline-none"
          />
        </div>

        {/* Bulk Actions */}
        <div className="flex w-full md:w-auto items-center gap-3 p-2 bg-slate-800/50 rounded-xl border border-slate-700">
          <div className="text-xs font-bold text-cyan-400 px-2 border-r border-slate-700">
            Đã chọn: {selectedIds.size}
          </div>
          <select
            value={selectedClassToAssign}
            onChange={e => setSelectedClassToAssign(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none"
          >
            <option value="">— Chọn Lớp —</option>
            {classes.map(c => (
              <option key={c.id} value={c.id!}>{c.name} ({c.code})</option>
            ))}
          </select>
          <button
            onClick={handleBulkAssign}
            disabled={selectedIds.size === 0 || !selectedClassToAssign || isAssigning}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold text-xs transition-colors flex items-center gap-2"
          >
            <Users className="w-4 h-4" /> THÊM VÀO LỚP
          </button>
          
          <div className="w-px h-6 bg-slate-700 mx-1" />

          {/* Nâng VIP */}
          <button
            onClick={handleBulkGrantVIP}
            disabled={selectedIds.size === 0 || isAssigning}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-900 rounded-lg font-black text-xs transition-all flex items-center gap-2 shadow-lg shadow-amber-500/20"
          >
            <Crown className="w-3.5 h-3.5" />
            CẤP VIP
          </button>

          {/* Hạ xuống FREE */}
          <button
            onClick={handleBulkRevokeVIP}
            disabled={selectedIds.size === 0 || isAssigning}
            className="px-4 py-2 bg-slate-700 hover:bg-red-900/60 border border-slate-600 hover:border-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300 hover:text-red-300 rounded-lg font-black text-xs transition-all flex items-center gap-2"
          >
            <ShieldOff className="w-3.5 h-3.5" />
            HẠ VIP
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-800 text-xs uppercase text-slate-400">
              <tr>
                <th className="p-4 w-12 border-b border-slate-700">
                  <button onClick={toggleSelectAll} className="text-slate-400 hover:text-cyan-400">
                    {selectedIds.size === filteredStudents.length && filteredStudents.length > 0
                      ? <CheckSquare className="w-5 h-5 text-cyan-500" />
                      : <Square className="w-5 h-5" />}
                  </button>
                </th>
                <th className="p-4 font-bold border-b border-slate-700">Tài khoản (Email)</th>
                <th className="p-4 font-bold border-b border-slate-700">Họ và Tên</th>
                <th className="p-4 font-bold border-b border-slate-700">Vai trò</th>
                <th className="p-4 font-bold border-b border-slate-700">Số đề đã làm</th>
                <th className="p-4 font-bold border-b border-slate-700">Hạng Tài Khoản</th>
                <th className="p-4 font-bold border-b border-slate-700">Lớp (VD: 12A1)</th>
                <th className="p-4 font-bold border-b border-slate-700">Năm học</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    Không tìm thấy học sinh nào.
                  </td>
                </tr>
              ) : (
                filteredStudents.map(student => (
                  <tr key={student.uid} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors group">
                    <td className="p-4">
                      <button onClick={() => toggleSelectOne(student.uid)} className="text-slate-500 hover:text-cyan-400">
                        {selectedIds.has(student.uid)
                          ? <CheckSquare className="w-5 h-5 text-cyan-500" />
                          : <Square className="w-5 h-5" />}
                      </button>
                    </td>
                    <td className="p-4">
                      <button 
                        onClick={() => {
                          setSelectedStudentForProfile(student);
                          setProfilerOpen(true);
                        }}
                        className="flex items-center gap-3 text-left hover:bg-slate-800/50 p-1.5 rounded-lg transition-all group-hover:pl-2 w-full"
                      >
                        {student.photoURL ? (
                          <img src={student.photoURL} alt="Avatar" className="w-8 h-8 rounded-full" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-bold text-white text-xs">
                            {student.email?.[0]?.toUpperCase() || '?'}
                          </div>
                        )}
                        <span className="text-slate-300 font-medium group-hover:text-cyan-400 transition-colors">{student.email || 'Không rõ Email'}</span>
                      </button>
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => {
                          setSelectedStudentForProfile(student);
                          setProfilerOpen(true);
                        }}
                        className="text-left font-bold text-white hover:text-cyan-400 transition-colors"
                      >
                        {student.displayName || "Chưa có tên"}
                      </button>
                    </td>
                    <td className="p-4">
                      <select
                        value={student.role || 'student'}
                        onChange={e => {
                          if (e.target.value !== student.role) {
                            handleUpdateStudent(student.uid, 'role', e.target.value);
                          }
                        }}
                        className={cn(
                          "bg-transparent border border-transparent hover:border-slate-700 outline-none rounded p-1 text-sm font-bold transition-all",
                          student.role === 'assistant' ? "text-fuchsia-400 focus:bg-fuchsia-900/40" : "text-slate-300 focus:bg-slate-800"
                        )}
                      >
                        <option value="student">Học sinh</option>
                        <option value="assistant">Trợ giảng</option>
                        <option value="admin">Giáo viên / Admin</option>
                      </select>
                    </td>
                    <td className="p-4">
                      {/* totalAttempts = tổng đề đã làm, bỏ lu.n VIP */}
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className={cn(
                            "font-black text-base",
                            (student.totalAttempts || 0) === 0 ? "text-slate-600" : "text-cyan-400"
                          )}>
                            {student.totalAttempts || 0}
                          </span>
                          <span className="text-slate-500 text-[11px]">bài</span>
                        </div>
                        {/* Chỉ FREE mới hiển thị số lượt còn lại */}
                        {!isVipUser(student) && (
                          <span className={cn(
                            "text-[10px] font-bold",
                            (student.usedAttempts || 0) >= 25 ? "text-red-400" :
                            (student.usedAttempts || 0) >= 20 ? "text-amber-400" : "text-slate-500"
                          )}>
                            {student.usedAttempts || 0}/{student.maxAttempts || 20} lượt
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      {/* Badge VIP/FREE — Click để toggle ngay, real-time qua onSnapshot */}
                      <button
                        onClick={() => handleToggleVIP(student)}
                        title={isVipUser(student)
                          ? 'Click để HẠ XUỐNG FREE' 
                          : 'Click để NÂNG LÊN VIP'}
                        className="group relative transition-transform hover:scale-110 active:scale-95"
                      >
                        {isVipUser(student) ? (
                          <span className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-400 to-amber-600 text-slate-900 font-black px-2.5 py-1 rounded-lg text-xs shadow-lg shadow-amber-500/30 group-hover:shadow-red-500/20 group-hover:from-red-400 group-hover:to-red-600 group-hover:text-white transition-all duration-300">
                            <Crown className="w-3 h-3" />
                            VIP
                            <span className="opacity-0 group-hover:opacity-100 text-[9px] transition-opacity">→ HẠ</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-slate-800 text-slate-400 font-bold px-2.5 py-1 rounded-lg text-xs border border-slate-700 group-hover:border-amber-500/50 group-hover:text-amber-400 group-hover:bg-amber-500/10 transition-all duration-300">
                            FREE
                            <span className="opacity-0 group-hover:opacity-100 text-[9px] transition-opacity">→ VIP</span>
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="p-4">
                      <input
                        type="text"
                        defaultValue={student.className || ''}
                        placeholder="VD: 12L1"
                        onBlur={e => {
                          if (e.target.value !== (student.className || '')) {
                            handleUpdateStudent(student.uid, 'className', e.target.value);
                          }
                        }}
                        className="bg-transparent border border-transparent hover:border-slate-700 focus:border-cyan-500 focus:bg-slate-800 rounded px-2 py-1 w-full uppercase text-white font-mono outline-none transition-all"
                      />
                    </td>
                    <td className="p-4">
                      <input
                        type="text"
                        defaultValue={student.schoolYear || ''}
                        placeholder="VD: 2025-2026"
                        onBlur={e => {
                          if (e.target.value !== (student.schoolYear || '')) {
                            handleUpdateStudent(student.uid, 'schoolYear', e.target.value);
                          }
                        }}
                        className="bg-transparent border border-transparent hover:border-slate-700 focus:border-cyan-500 focus:bg-slate-800 rounded px-2 py-1 w-full text-white outline-none transition-all"
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Side Drawer Component */}
      <StudentMicroProfiler
        isOpen={profilerOpen}
        onClose={() => setProfilerOpen(false)}
        student={selectedStudentForProfile}
      />
    </div>
  );
};

export default StudentDirectory;
