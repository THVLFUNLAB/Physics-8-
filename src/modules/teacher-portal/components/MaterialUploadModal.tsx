import React, { useState, useRef } from 'react';
import { X, UploadCloud, Link as LinkIcon, FileText, Image as ImageIcon, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { uploadMaterialFile, saveMaterialMetadata } from '../services/learningMaterialService';
import type { MaterialVisibility, MaterialType } from '../../../types';
import { cn } from '../../../lib/utils';
import { toast } from '../../../components/Toast';

export interface ClassOption {
  id: string;
  name: string;
}

interface Props {
  teacherId: string;
  classes: ClassOption[];
  onClose: () => void;
  onSuccess: () => void; // Trigger refresh danh sách sau khi tạo
}

// ── Cấu hình giới hạn ──
const MAX_PDF_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_IMG_SIZE = 2 * 1024 * 1024; // 2MB

const MaterialUploadModal: React.FC<Props> = ({ teacherId, classes, onClose, onSuccess }) => {
  const [tab, setTab] = useState<'upload' | 'link'>('upload');
  
  // ── Form State ──
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<MaterialVisibility>('private');
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  
  // ── File State ──
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  
  // ── Link State ──
  const [externalUrl, setExternalUrl] = useState('');
  const [linkType, setLinkType] = useState<MaterialType>('video_link');
  
  // ── Submit State ──
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Xử lý chọn file với VALIDATION CHẶT CHẼ ──
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    setFileError(null);
    setFile(null);

    if (!selected) return;

    const isPDF = selected.type === 'application/pdf';
    const isImage = selected.type.startsWith('image/');
    
    if (!isPDF && !isImage) {
      setFileError('Chỉ hỗ trợ file định dạng PDF, JPG hoặc PNG.');
      return;
    }

    if (isPDF && selected.size > MAX_PDF_SIZE) {
      setFileError('File PDF vượt quá dung lượng cho phép (tối đa 5MB).');
      return;
    }

    if (isImage && selected.size > MAX_IMG_SIZE) {
      setFileError('File ảnh vượt quá dung lượng cho phép (tối đa 2MB).');
      return;
    }

    setFile(selected);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Vui lòng nhập tên tài liệu.');
      return;
    }

    if (visibility === 'class' && selectedClasses.length === 0) {
      toast.error('Vui lòng chọn ít nhất 1 lớp học.');
      return;
    }

    setIsSubmitting(true);
    setUploadProgress(0);

    try {
      let storageUrl = undefined;
      let storagePath = undefined;
      let fileSize = undefined;
      let finalType: MaterialType = 'pdf';

      // Xử lý Upload File
      if (tab === 'upload') {
        if (!file) {
          toast.error('Vui lòng chọn file để tải lên.');
          setIsSubmitting(false);
          return;
        }
        finalType = file.type === 'application/pdf' ? 'pdf' : 'image';
        fileSize = file.size;
        
        // Gọi service upload lên Firebase Storage
        const uploadResult = await uploadMaterialFile(teacherId, file, (prog) => {
          setUploadProgress(Math.round(prog));
        });
        storageUrl = uploadResult.storageUrl;
        storagePath = uploadResult.storagePath;
      } 
      // Xử lý Gắn Link
      else {
        if (!externalUrl.trim() || !externalUrl.startsWith('http')) {
          toast.error('Vui lòng nhập đường dẫn URL hợp lệ.');
          setIsSubmitting(false);
          return;
        }
        finalType = linkType;
      }

      // Lưu metadata vào Firestore
      await saveMaterialMetadata({
        title: title.trim(),
        description: description.trim(),
        type: finalType,
        visibility,
        ownerId: teacherId,
        ownerRole: 'teacher',
        allowedClassIds: visibility === 'class' ? selectedClasses : [],
        
        // Data động tùy tab
        ...(tab === 'upload' ? { storageUrl, storagePath, fileSize } : { externalUrl: externalUrl.trim() }),
        
        // Nếu public thì phải chờ Admin duyệt (QĐ 2)
        ...(visibility === 'public' ? { approvalStatus: 'pending' } : {}),
      });

      toast.success(visibility === 'public' 
        ? 'Đã gửi tài liệu. Đang chờ Admin phê duyệt (Public).' 
        : 'Đã tạo tài liệu thành công!');
        
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error('Có lỗi xảy ra: ' + (err.message || 'Không thể lưu tài liệu.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm">
      <div 
        className="w-full max-w-2xl bg-[#0f172a] rounded-2xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-emerald-400" />
              Thêm Học Liệu Mới
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Chia sẻ tài liệu, bài giảng hoặc gắn link Video cho học sinh.
            </p>
          </div>
          <button 
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Tabs Selector */}
          <div className="flex p-1 bg-slate-900 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setTab('upload')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-lg transition-all",
                tab === 'upload' ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "text-slate-500 hover:text-slate-300"
              )}
            >
              <UploadCloud className="w-4 h-4" /> Tải File Lên
            </button>
            <button
              type="button"
              onClick={() => setTab('link')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-lg transition-all",
                tab === 'link' ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "text-slate-500 hover:text-slate-300"
              )}
            >
              <LinkIcon className="w-4 h-4" /> Gắn Link Ngoài
            </button>
          </div>

          {/* Khối nhập liệu động theo Tab */}
          <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/30 space-y-5">
            {tab === 'upload' ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center text-xs font-semibold text-slate-400 px-1">
                  <span>Quy định dung lượng:</span>
                  <div className="flex gap-3">
                    <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> PDF &lt; 5MB</span>
                    <span className="flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5" /> Ảnh &lt; 2MB</span>
                  </div>
                </div>

                <div 
                  className={cn(
                    "border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer group",
                    file ? "border-emerald-500/50 bg-emerald-500/5" : 
                    fileError ? "border-red-500/50 bg-red-500/5" : "border-slate-700 hover:border-slate-500 hover:bg-slate-800/50"
                  )}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="application/pdf, image/jpeg, image/png"
                    onChange={handleFileChange}
                  />
                  
                  {file ? (
                    <div className="space-y-2">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                      <p className="text-emerald-400 font-bold text-sm">{file.name}</p>
                      <p className="text-slate-400 text-xs">{formatBytes(file.size)}</p>
                      <p className="text-slate-500 text-[10px] mt-2 underline">Nhấn để đổi file khác</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <UploadCloud className="w-8 h-8 text-slate-500 mx-auto group-hover:text-emerald-400 transition-colors" />
                      <p className="text-slate-300 font-bold text-sm">Nhấn để chọn file</p>
                      <p className="text-slate-500 text-xs">hoặc kéo thả file vào đây</p>
                    </div>
                  )}
                </div>

                {fileError && (
                  <p className="text-red-400 text-xs font-bold flex items-center gap-1.5 px-1">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {fileError}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Loại liên kết</label>
                  <select 
                    value={linkType} 
                    onChange={e => setLinkType(e.target.value as MaterialType)}
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                  >
                    <option value="video_link">Video (YouTube, Drive, etc.)</option>
                    <option value="lab_link">Phòng Lab Ảo (PhET, JavaLab)</option>
                    <option value="slide_link">Slide Bài Giảng (Google Slides)</option>
                    <option value="document_link">Link Tài Liệu Khác</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase">Đường dẫn URL (Bắt buộc)</label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={externalUrl}
                    onChange={e => setExternalUrl(e.target.value)}
                    className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none placeholder:text-slate-600"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Tên tài liệu */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-bold text-slate-400 uppercase">Tên tài liệu <span className="text-red-400">*</span></label>
              <input
                type="text"
                placeholder="VD: Bài giảng Dao động cơ tuần 3..."
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none placeholder:text-slate-600"
              />
            </div>

            {/* Quyền hiển thị */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase">Phạm vi hiển thị</label>
              <select 
                value={visibility} 
                onChange={e => {
                  setVisibility(e.target.value as MaterialVisibility);
                  if (e.target.value !== 'class') setSelectedClasses([]);
                }}
                className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
              >
                <option value="private">Private (Chỉ mình tôi)</option>
                <option value="class">Class (Phát cho lớp cụ thể)</option>
                <option value="public">Public (Chờ Admin duyệt lên kho chung)</option>
              </select>
            </div>

            {/* Lớp học (Nếu chọn Class) */}
            {visibility === 'class' && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase">Lớp được phép xem <span className="text-red-400">*</span></label>
                <div className="relative">
                  {classes.length === 0 ? (
                    <div className="px-4 py-2.5 border border-slate-700 rounded-lg bg-slate-800/50 text-slate-400 text-sm">
                      Bạn chưa quản lý lớp nào.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 max-h-32 overflow-y-auto p-2 bg-slate-900 border border-slate-700 rounded-lg custom-scrollbar">
                      {classes.map(cls => (
                        <label key={cls.id} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-white">
                          <input 
                            type="checkbox"
                            checked={selectedClasses.includes(cls.id)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedClasses([...selectedClasses, cls.id]);
                              else setSelectedClasses(selectedClasses.filter(id => id !== cls.id));
                            }}
                            className="rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500/50"
                          />
                          <span className="truncate">{cls.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Mô tả (Optional) */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-bold text-slate-400 uppercase">Mô tả thêm (Tùy chọn)</label>
              <textarea
                rows={2}
                placeholder="Ghi chú thêm về học liệu này cho học sinh..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none placeholder:text-slate-600 resize-none"
              />
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="p-5 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <p className="text-xs text-slate-500 max-w-xs">
            {visibility === 'public' && "Tài liệu Public cần được Admin duyệt thủ công trước khi xuất hiện trên hệ thống."}
            {visibility === 'class' && "Học liệu sẽ ngay lập tức khả dụng cho học sinh trong lớp."}
          </p>
          
          <div className="flex gap-3 shrink-0 ml-4">
            <button 
              type="button" 
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-lg text-sm font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              Hủy bỏ
            </button>
            <button 
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || (tab === 'upload' && (!file || !!fileError))}
              className="tp-btn-primary flex items-center gap-2 relative overflow-hidden"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {tab === 'upload' ? `Đang tải... ${uploadProgress}%` : 'Đang lưu...'}
                  
                  {/* Progress bar nền */}
                  {tab === 'upload' && (
                    <div 
                      className="absolute inset-y-0 left-0 bg-white/20 transition-all duration-300 z-[-1]"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  )}
                </>
              ) : (
                'Lưu Học Liệu'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MaterialUploadModal;
