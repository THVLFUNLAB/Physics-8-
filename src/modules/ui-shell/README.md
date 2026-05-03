# Module: ui-shell

## Mục đích
Các UI primitive dùng chung toàn app: layout, toast, modal, mascot, loading states.

## Components thuộc module này
| Component | File gốc | Mô tả |
|-----------|----------|-------|
| Sidebar | `/components/Sidebar.tsx` | Thanh điều hướng |
| AppFooter | `/layouts/AppFooter.tsx` | Footer ứng dụng |
| Navbar | `/layouts/Navbar.tsx` | Thanh tiêu đề |
| Toast / ToastProvider | `/components/Toast.tsx` | Hệ thống thông báo |
| LoadingSpinner | `/components/LoadingSpinner.tsx` | Vòng tải |
| SkeletonLoader | `/components/SkeletonLoader.tsx` | Skeleton loading |
| UpgradeModal | `/components/UpgradeModal.tsx` | Modal nâng cấp |
| ResetNoticeModal | `/components/ResetNoticeModal.tsx` | Modal reset |
| ConfettiCelebration | `/components/ConfettiCelebration.tsx` | Hiệu ứng ăn mừng |
| InteractiveMascot | `/components/InteractiveMascot.tsx` | Mascot tương tác |
| WelcomeMascot | `/components/WelcomeMascot.tsx` | Màn chào |
| AuthErrorBoundary | `/components/AuthErrorBoundary.tsx` | Bắt lỗi auth |

## Quy tắc [STABLE ZONE]
- ✅ Lỗi toast → chỉ sửa `Toast.tsx`
- ✅ Lỗi sidebar → chỉ sửa `Sidebar.tsx`
- ❌ KHÔNG sửa `index.css` global khi chỉ muốn sửa style của 1 component
- ⚠️ Đây là module dùng chung — mọi thay đổi phải được Impact Analysis đầy đủ

## Services phụ thuộc
- `store/useAppStore.ts` — Trạng thái UI toàn cục
- `src/index.css` — Global design tokens (không sửa trực tiếp)
