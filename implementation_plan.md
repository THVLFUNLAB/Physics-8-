# Báo Cáo Phân Tích: Cấu Trúc GDPT 2018 Khối 10 & Khối 11

Thưa thầy, hệ thống vừa phân tích hình ảnh và kiểm tra sâu vào lõi CSDL (`utils/physicsTopics.ts`) và khu vực Kho câu hỏi (`QuestionBank.tsx`). Về mặt lí thuyết, chương trình bị thiếu như thầy nhận định, đặc biệt là **Dao Động** (Khối 11) hay **Động Lượng, Chuyển Động Tròn** (Khối 10).

Tuy nhiên, nguyên nhân không phải do lập trình thiếu, mà cấu trúc lõi **được thiết kế để ẩn đi các chương trống**.

## 1. Phân Tích Hiện Trạng
Sau khi rà soát lõi khai báo, bộ chương trình GDPT 2018 của **Khối 10 và Khối 11 ĐÃ CÓ ĐẦY ĐỦ 100%**:
- **Khối 10 đã có:** *Mở đầu, Động học, Động lực học, Công/năng lượng, Động lượng, Chuyển động tròn, Biến dạng rắn.*
- **Khối 11 đã có:** *Dao động, Sóng, Trường điện, Dòng điện mạch điện.*

Nhưng ở file `QuestionBank.tsx` dòng 589 có một cơ chế **giấu bài**:
```javascript
// Nếu chương có 0 câu hỏi, KHÔNG PHẢI khối 12 thì ẨN ĐI cho rảnh mắt
if (qCount === 0 && !isTopicChecked && gradeGroup.grade !== 'Khối 12') return null; 
```
Do thầy chưa số hóa bất kỳ câu hỏi nào thuộc chương **"Dao động"** (Khối 11) hay **"Động lượng"** (Khối 10), hệ thống tự động giấu chúng đi, dẫn tới việc thầy xem khung chọn lọc thấy thiếu chương trình.

## 2. Giải Pháp (Proposed Changes)

Để chuẩn hóa, dù kho câu hỏi phần đó có trống không (0 câu), hệ thống bắt buộc cũng phải show ra để thầy nhìn thấy đúng khung cấu trúc GDPT 2018:

### Thành phần cần chỉnh sửa (`QuestionBank.tsx`)
- Xóa bỏ điều kiện "Ẩn bớt mục trống" ở hàm render Tree View bộ lọc GDPT 2018.
- Chấp nhận việc hiển thị tất cả các chủ đề (Kèm theo số lượng `0` xam xám bên cạnh) cho cả 3 khối 10, 11 và 12. Điều này giúp thầy có cái nhìn tổng quan: **Chương nào đang mạnh, chương nào đang trống dữ liệu để bổ sung sau**.

## User Review Required

> [!IMPORTANT]
> **Thầy vui lòng cho ý kiến xác nhận:**
> Ý định ban đầu của em là giấu các chương có 0 câu hỏi đi để cái menu lọc bên tay trái nó đỡ bị dài (vì các khối 10-11 chưa phải mục tiêu học chính hiện tại).
> 
> Nếu thầy muốn **Hiển thị đầy đủ 100% tất cả các chương mục GDPT 2018** (Dù nó đang có 0 câu hỏi), thầy chốt với em một tiếng để em gỡ bỏ "Bùa ẩn thân" này đi nhé!
