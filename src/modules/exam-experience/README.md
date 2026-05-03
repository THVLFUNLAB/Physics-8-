# Module: exam-experience

## Mục đích
Toàn bộ luồng làm bài thi của học sinh: bắt đầu → làm bài → nộp → xem kết quả.

## Components thuộc module này
| Component | File gốc | Mô tả |
|-----------|----------|-------|
| ProExamExperience | `/components/ProExamExperience.tsx` | Giao diện làm bài chính |
| ReviewExam | `/components/ReviewExam.tsx` | Xem lại bài đã làm |
| ExamResultsModal | `/components/ExamResultsModal.tsx` | Modal kết quả thi |
| ExamResultGamification | `/components/ExamResultGamification.tsx` | Gamification điểm số |
| PersonalizedResultPanel | `/components/PersonalizedResultPanel.tsx` | Phân tích kết quả cá nhân |
| PrintableExamView | `/components/PrintableExamView.tsx` | Giao diện in PDF |
| CountdownTimer | `/components/CountdownTimer.tsx` | Đồng hồ đếm ngược |

## Quy tắc [STABLE ZONE]
- ❌ KHÔNG sửa file nào trong module này nếu không liên quan đến luồng thi
- ✅ Nếu có lỗi ở ProExamExperience → chỉ sửa `ProExamExperience.tsx`
- ✅ Nếu có lỗi ở kết quả thi → chỉ sửa `PersonalizedResultPanel.tsx` hoặc `ExamResultsModal.tsx`
- ⚠️ Mọi thay đổi phải khai báo Impact Analysis trước

## Services phụ thuộc
- `services/geminiService.ts` — AI chẩn đoán bài làm
- `services/AdaptiveEngine.ts` — Tính XP thích nghi
- `hooks/useSubmitWithRetry.ts` — Logic nộp bài có retry
