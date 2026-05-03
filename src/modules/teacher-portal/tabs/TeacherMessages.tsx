import React from 'react';
import { MessageSquare } from 'lucide-react';
import type { UserProfile } from '../../../types';
import type { useTeacherPortal } from '../useTeacherPortal';

type Portal = ReturnType<typeof useTeacherPortal>;
interface Props { portal: Portal; user: UserProfile; }

// Placeholder — Tâm thư AI scoped theo lớp sẽ được build Phase 3
const TeacherMessages: React.FC<Props> = ({ portal, user }) => (
  <div className="space-y-5">
    <h3 className="tp-section-title"><MessageSquare /> Thông Báo & Tâm Thư AI</h3>
    <div className="p-6 bg-slate-900/40 border border-slate-700/40 rounded-xl text-center space-y-3">
      <MessageSquare className="w-10 h-10 text-violet-400 mx-auto opacity-60" />
      <p className="font-bold text-slate-300">Thông báo lớp học — Đang phát triển</p>
      <p className="text-sm text-slate-500 max-w-sm mx-auto">
        Phase 3 sẽ tích hợp: gửi thông báo cho toàn lớp, Tâm thư AI
        targeted vào HS yếu trong lớp của bạn (limited version của AICampaignManager).
      </p>
    </div>
  </div>
);

export default TeacherMessages;
