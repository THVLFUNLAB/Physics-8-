# Module: student-dashboard

## Mục đích
Giao diện tổng thể của học sinh: dashboard, lộ trình học thích nghi, lịch sử, xếp hạng.

## Components thuộc module này
| Component | File gốc | Mô tả |
|-----------|----------|-------|
| StudentDashboard | `/components/StudentDashboard.tsx` | Dashboard chính |
| AdaptiveDashboard | `/components/AdaptiveDashboard.tsx` | Lộ trình học thích nghi |
| HistoryDashboard | `/components/HistoryDashboard.tsx` | Lịch sử bài làm |
| KnowledgeGapGallery | `/components/KnowledgeGapGallery.tsx` | Gallery điểm yếu |
| GradeLeaderboard | `/components/GradeLeaderboard.tsx` | Bảng xếp hạng |
| UserRankCard | `/components/UserRankCard.tsx` | Card rank người dùng |
| Grade10/11/12Dashboard | `/components/Grade1XDashboard.tsx` | Dashboard theo khối |
| CapabilityRadarChart | `/components/CapabilityRadarChart.tsx` | Radar năng lực |

## Quy tắc [STABLE ZONE]
- ✅ Lỗi hiển thị dashboard → chỉ sửa `StudentDashboard.tsx`
- ✅ Lỗi lộ trình thích nghi → chỉ sửa `AdaptiveDashboard.tsx`
- ❌ KHÔNG sửa `useAuthStore` hay `useDashboardStats` nếu chỉ fix UI

## Services phụ thuộc
- `hooks/useDashboardStats.ts` — Thống kê dashboard
- `services/AdaptiveEngine.ts` — Engine học thích nghi
- `store/useAuthStore.ts` — Dữ liệu user
