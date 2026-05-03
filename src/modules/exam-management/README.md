# Module: exam-management

## Mục đích
Quản lý toàn bộ vòng đời đề thi: số hóa → ngân hàng → tạo đề → xuất bản → thư viện.

## Components thuộc module này
| Component | File gốc | Mô tả |
|-----------|----------|-------|
| DigitizationDashboard | `/components/DigitizationDashboard.tsx` | Số hóa đề từ file |
| QuestionBank | `/components/QuestionBank.tsx` | Ngân hàng câu hỏi |
| QuestionReviewBoard | `/components/QuestionReviewBoard.tsx` | Duyệt câu hỏi |
| ExamGenerator | `/components/ExamGenerator.tsx` | Tạo đề tự động |
| ExamMatrixGenerator | `/components/ExamMatrixGenerator.tsx` | Ma trận đề |
| ExamLibrary | `/components/ExamLibrary.tsx` | Thư viện đề (Admin) |
| ExamsList | `/components/ExamsList.tsx` | Danh sách đề (Student) |
| VipLinkGenerator | `/components/VipLinkGenerator.tsx` | Tạo link chia sẻ |

## Quy tắc [STABLE ZONE]
- ✅ Lỗi số hóa → chỉ sửa `DigitizationDashboard.tsx`
- ✅ Lỗi tạo đề → chỉ sửa `ExamGenerator.tsx` + `examGeneratorService.ts`
- ❌ KHÔNG sửa `AzotaParser.ts` nếu chỉ fix UI

## Services phụ thuộc
- `services/AzotaParser.ts` — Parser định dạng Azota
- `services/examGeneratorService.ts` — Logic tạo đề
- `services/ExamWordExporter.ts` — Xuất Word
- `utils/clusterUtils.ts` — Xử lý câu chùm
