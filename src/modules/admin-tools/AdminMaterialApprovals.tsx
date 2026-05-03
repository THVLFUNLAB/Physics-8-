import React, { useState, useEffect } from 'react';
import { ShieldAlert, CheckCircle, XCircle, Search, FileText, Image as ImageIcon, Video, Link2, FlaskConical, ExternalLink } from 'lucide-react';
import { db, serverTimestamp, doc, updateDoc, collection, query, where, getDocs, orderBy } from '../../firebase';
import type { LearningMaterial, MaterialType } from '../../types';
import { toast } from '../../components/Toast';

const TYPE_ICON: Record<MaterialType, { icon: React.FC<any>; emoji: string; label: string }> = {
  pdf:           { icon: FileText,    emoji: '📄', label: 'PDF' },
  image:         { icon: ImageIcon,   emoji: '🖼️', label: 'Hình ảnh' },
  video_link:    { icon: Video,       emoji: '🎥', label: 'Video' },
  lab_link:      { icon: FlaskConical,emoji: '🧪', label: 'Lab ảo' },
  slide_link:    { icon: Link2,       emoji: '📊', label: 'Slide' },
  document_link: { icon: Link2,       emoji: '📋', label: 'Tài liệu' },
};

interface Props {
  adminId: string;
}

const AdminMaterialApprovals: React.FC<Props> = ({ adminId }) => {
  const [pendingMaterials, setPendingMaterials] = useState<LearningMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const fetchPendingMaterials = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'learningMaterials'),
        where('visibility', '==', 'public'),
        where('approvalStatus', '==', 'pending')
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LearningMaterial));
      // Sort in JS instead of Firebase index to save index limit
      data.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      setPendingMaterials(data);
    } catch (err: any) {
      console.error(err);
      toast.error('Lỗi tải danh sách chờ duyệt.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingMaterials();
  }, []);

  const handleApprove = async (materialId: string) => {
    if (!window.confirm('Xác nhận duyệt tài liệu này lên Kho Public?')) return;
    try {
      await updateDoc(doc(db, 'learningMaterials', materialId), {
        approvalStatus: 'approved',
        approvedBy: adminId,
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      toast.success('Đã duyệt tài liệu thành công!');
      setPendingMaterials(prev => prev.filter(m => m.id !== materialId));
    } catch (error) {
      console.error(error);
      toast.error('Lỗi khi duyệt tài liệu.');
    }
  };

  const handleReject = async (materialId: string) => {
    if (!rejectionReason.trim()) {
      toast.error('Vui lòng nhập lý do từ chối.');
      return;
    }
    try {
      await updateDoc(doc(db, 'learningMaterials', materialId), {
        approvalStatus: 'rejected',
        rejectionReason: rejectionReason.trim(),
        updatedAt: serverTimestamp()
      });
      toast.success('Đã từ chối tài liệu!');
      setPendingMaterials(prev => prev.filter(m => m.id !== materialId));
      setRejectingId(null);
      setRejectionReason('');
    } catch (error) {
      console.error(error);
      toast.error('Lỗi khi từ chối tài liệu.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-emerald-400" />
          Duyệt Học Liệu Public
        </h2>
        <button onClick={fetchPendingMaterials} className="tp-btn-ghost text-sm">
          Tải lại
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 bg-slate-800/30">
          <p className="text-sm font-bold text-slate-300">
            Có <span className="text-emerald-400">{pendingMaterials.length}</span> tài liệu đang chờ phê duyệt.
          </p>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500">Đang tải dữ liệu...</div>
        ) : pendingMaterials.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-3">
            <ShieldAlert className="w-12 h-12 mx-auto text-slate-600" />
            <p>Không có tài liệu nào đang chờ duyệt.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {pendingMaterials.map(m => {
              const typeInfo = TYPE_ICON[m.type] || { emoji: '📎', label: m.type };
              const isRejecting = rejectingId === m.id;

              return (
                <div key={m.id} className="p-5 hover:bg-slate-800/20 transition-colors">
                  <div className="flex flex-col sm:flex-row justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg" title={typeInfo.label}>{typeInfo.emoji}</span>
                        <h3 className="font-bold text-white">{m.title}</h3>
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-bold border border-amber-500/20">
                          PENDING
                        </span>
                      </div>
                      <p className="text-sm text-slate-400 max-w-2xl">
                        {m.description || 'Không có mô tả.'}
                      </p>
                      
                      <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500 pt-1">
                        <span>Khối: {m.targetGrade || 'Tất cả'}</span>
                        {m.topic && <span>• CĐ: {m.topic}</span>}
                        <span>• GV ID: {m.ownerId}</span>
                        
                        {(m.storageUrl || m.externalUrl) && (
                          <a 
                            href={m.storageUrl || m.externalUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
                          >
                            <ExternalLink className="w-3.5 h-3.5" /> Xem trước nội dung
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 min-w-[200px]">
                      {!isRejecting ? (
                        <>
                          <button 
                            onClick={() => handleApprove(m.id!)}
                            className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                          >
                            <CheckCircle className="w-4 h-4" /> Phê Duyệt
                          </button>
                          <button 
                            onClick={() => setRejectingId(m.id!)}
                            className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-red-400 font-bold py-2 px-4 rounded-lg transition-colors border border-slate-700 hover:border-red-500/30"
                          >
                            <XCircle className="w-4 h-4" /> Từ chối
                          </button>
                        </>
                      ) : (
                        <div className="space-y-2">
                          <textarea
                            autoFocus
                            placeholder="Nhập lý do từ chối..."
                            className="w-full text-sm bg-slate-900 border border-red-500/50 rounded-lg p-2 text-white outline-none focus:border-red-500 min-h-[60px]"
                            value={rejectionReason}
                            onChange={e => setRejectionReason(e.target.value)}
                          />
                          <div className="flex gap-2">
                            <button 
                              onClick={() => { setRejectingId(null); setRejectionReason(''); }}
                              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-1.5 rounded-lg text-sm"
                            >
                              Hủy
                            </button>
                            <button 
                              onClick={() => handleReject(m.id!)}
                              className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-1.5 rounded-lg text-sm"
                            >
                              Gửi
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminMaterialApprovals;
