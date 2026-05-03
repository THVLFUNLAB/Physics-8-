# Module: admin-tools

## Mục đích
Công cụ quản trị hệ thống: làm sạch dữ liệu, phát hiện trùng lặp, di chuyển DB, phân tích vĩ mô.

## Components thuộc module này
| Component | File gốc | Mô tả |
|-----------|----------|-------|
| DataSanitizer | `/components/DataSanitizer.tsx` | Làm sạch dữ liệu |
| DuplicateReviewHub | `/components/DuplicateReviewHub.tsx` | Phát hiện câu hỏi trùng |
| DatabaseMigrationTool | `/components/DatabaseMigrationTool.tsx` | Di chuyển cơ sở dữ liệu |
| ScoreRecalibrationTool | `/components/ScoreRecalibrationTool.tsx` | Tái hiệu chỉnh điểm |
| ReportHub | `/components/ReportHub.tsx` | Trung tâm báo cáo |
| MacroAnalyticsDashboard | `/components/MacroAnalyticsDashboard.tsx` | Phân tích vĩ mô |
| AICampaignManager | `/components/AICampaignManager.tsx` | Chiến dịch AI |
| YCCDAutoTagger | `/components/YCCDAutoTagger.tsx` | Gán YCCD tự động |

## Quy tắc [STABLE ZONE]
- ✅ Lỗi làm sạch dữ liệu → chỉ sửa `DataSanitizer.tsx`
- ✅ Lỗi phát hiện trùng → chỉ sửa `DuplicateReviewHub.tsx`
- ❌ KHÔNG sửa `firebase.ts` khi chỉ fix UI của admin tools

## Services phụ thuộc
- `services/DuplicateDetector.ts` — Logic phát hiện trùng lặp
- `services/geminiService.ts` — AI tagging
- `data/yccdData.ts` — Dữ liệu YCCD
