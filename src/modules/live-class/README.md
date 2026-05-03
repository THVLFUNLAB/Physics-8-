# Module: live-class

## Mục đích
Thi trực tiếp trong lớp học: quản lý lớp, bảng điểm chiếu, thư mục học sinh.

## Components thuộc module này
| Component | File gốc | Mô tả |
|-----------|----------|-------|
| LiveClassExam | `/components/LiveClassExam.tsx` | Thi trực tiếp |
| ProjectorLeaderboard | `/components/ProjectorLeaderboard.tsx` | Bảng điểm máy chiếu |
| ClassManager | `/components/ClassManager.tsx` | Quản lý lớp học |
| StudentDirectory | `/components/StudentDirectory.tsx` | Danh bạ học sinh |
| TeacherDashboard | `/components/TeacherDashboard.tsx` | Dashboard giáo viên |
| TeacherMessageModal | `/components/TeacherMessageModal.tsx` | Tin nhắn từ giáo viên |
| InvitePage | `/components/InvitePage.tsx` | Trang mời HS vào lớp |

## Quy tắc [STABLE ZONE]
- ✅ Lỗi thi trực tiếp → chỉ sửa `LiveClassExam.tsx`
- ✅ Lỗi bảng điểm → chỉ sửa `ProjectorLeaderboard.tsx`
- ❌ KHÔNG sửa `useAuthStore` khi chỉ fix UI live class

## Services phụ thuộc
- `firebase.ts` — Realtime listeners cho live class
- `store/useAuthStore.ts` — Thông tin user/class
