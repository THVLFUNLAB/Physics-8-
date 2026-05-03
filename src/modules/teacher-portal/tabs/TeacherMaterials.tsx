import React from 'react';
import { FolderOpen, Link2, FileText, Image, Video, FlaskConical, Upload } from 'lucide-react';
import type { UserProfile, LearningMaterial, MaterialType } from '../../../types';
import type { useTeacherPortal } from '../useTeacherPortal';
import MaterialUploadModal from '../components/MaterialUploadModal';

type Portal = ReturnType<typeof useTeacherPortal>;
interface Props { portal: Portal; user: UserProfile; }

const TYPE_ICON: Record<MaterialType, { icon: React.FC<any>; emoji: string; label: string }> = {
  pdf:           { icon: FileText,    emoji: '📄', label: 'PDF' },
  image:         { icon: Image,       emoji: '🖼️', label: 'Hình ảnh' },
  video_link:    { icon: Video,       emoji: '🎥', label: 'Video' },
  lab_link:      { icon: FlaskConical,emoji: '🧪', label: 'Lab ảo' },
  slide_link:    { icon: Link2,       emoji: '📊', label: 'Slide' },
  document_link: { icon: Link2,       emoji: '📋', label: 'Tài liệu' },
};

const VISIBILITY_LABEL: Record<string, string> = {
  private: '🔒 Riêng tư',
  class:   '📚 Theo lớp',
  public:  '🌍 Công khai',
};

const TeacherMaterials: React.FC<Props> = ({ portal, user }) => {
  const { materials, loading, handleShareMaterial, handleRequestPublic } = portal;
  const [showForm, setShowForm] = React.useState(false);

  return (
    <div className="space-y-5">
      <div className="tp-section-header">
        <h3 className="tp-section-title"><FolderOpen /> Kho Học Liệu Số</h3>
        <button className="tp-btn-primary" onClick={() => setShowForm(v => !v)}>
          <Upload className="w-4 h-4" /> Thêm học liệu
        </button>
      </div>

      {/* Form thêm học liệu (Sử dụng MaterialUploadModal mới) */}
      {showForm && (
        <MaterialUploadModal
          teacherId={user.uid}
          classes={portal.classes.map(c => ({ id: c.id!, name: c.name }))}
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            portal.refreshMaterials();
            setShowForm(false);
          }}
        />
      )}

      {/* Grid học liệu */}
      {loading.materials ? (
        <div className="tp-material-grid">
          {[1,2,3,4].map(i => <div key={i} className="tp-skeleton h-32 rounded-xl" />)}
        </div>
      ) : materials.length === 0 ? (
        <div className="tp-empty">
          <FolderOpen />
          <p className="tp-empty-title">Kho học liệu trống</p>
          <p className="tp-empty-desc">Thêm bài giảng, video, link lab ảo để chia sẻ với học sinh.</p>
        </div>
      ) : (
        <div className="tp-material-grid">
          {materials.map(m => {
            const typeInfo = TYPE_ICON[m.type] ?? { emoji: '📎', label: m.type };
            return (
              <div key={m.id} className="tp-material-card">
                <div className="tp-material-type-icon">{typeInfo.emoji}</div>
                <p className="tp-material-title">{m.title}</p>
                <p className="tp-material-meta">
                  {m.topic && <span>{m.topic} · </span>}
                  {m.targetGrade && <span>Khối {m.targetGrade} · </span>}
                  <span>{VISIBILITY_LABEL[m.visibility] ?? m.visibility}</span>
                </p>
                <div className="flex gap-2 mt-3">
                  {m.externalUrl && (
                    <a href={m.externalUrl} target="_blank" rel="noopener noreferrer"
                      className="tp-btn-ghost text-xs">
                      <Link2 className="w-3.5 h-3.5" /> Mở
                    </a>
                  )}
                  {m.visibility === 'private' && m.id && (
                    <button className="tp-btn-ghost text-xs"
                      onClick={() => handleRequestPublic(m.id!)}>
                      Xin duyệt public
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TeacherMaterials;
