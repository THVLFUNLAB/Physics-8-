# BẢN PHÂN TÍCH CHIẾN LƯỢC: MÔ HÌNH B2TEACHER (CHUYÊN GIA LUYỆN THI VẬT LÍ)

Định hướng mới: Từ bỏ (hoặc tạm gác) việc mở rộng đa môn và bán cho trường học. Tập trung toàn lực biến hệ thống thành **công cụ "độc quyền" và "kiếm cơm" cho các giáo viên luyện thi Vật lí chuyên nghiệp (B2Teacher)**.

> Mô hình này cực kỳ thông minh vì thầy đang đánh đúng vào tệp khách hàng mà thầy thấu hiểu 100% "nỗi đau" (Pain points) của họ. Đây là tệp khách hàng *chấp nhận trả tiền nhanh nhất*, vì công cụ của thầy giúp họ làm ra tiền và tiết kiệm mồ hôi nước mắt.

---

## PHẦN 1: GIÁO VIÊN LUYỆN THI CẦN GÌ NHẤT? (BUSINESS NEEDS)

Một giáo viên luyện thi (GV Luyện Thi) khác hoàn toàn giáo viên trên trường:
1. **Thương hiệu cá nhân (Personal Branding)**: Họ bán khóa học bằng danh tiếng. Đề thi, file PDF phải có logo của họ, tên của họ, watermark chống trộm.
2. **Trộn đề siêu tốc**: Lớp có 500 em, cần tạo 4 mã đề chống gian lận chuẩn xác cấu trúc 2025.
3. **Tracking & Report sắc bén để "khè" phụ huynh**: Cần bảng điểm chi tiết, ma trận xanh/đỏ (câu nào liệt, câu nào yếu) để show cho phụ huynh dốc hầu bao mua thêm khóa học.
4. **Bảo mật chất xám**: "Ngân hàng đề của tôi là tài sản. Tôi không muốn bị tải trộm, copy lậu."

---

## PHẦN 2: APP HIỆN TẠI CẦN NÂNG CẤP KỸ THUẬT GÌ? (TECH REQUIREMENTS)

Để biến PHYS-9+ thành SaaS cho GV Luyện thi (SaaS - Phần mềm dịch vụ thu tiền tháng), thầy cần xây dựng 4 "Trụ cột Kỹ thuật" sau:

### Trụ cột 1: Multi-Tenancy cô lập tuyệt đối (Data Isolation)
- **Vấn đề**: GV A và GV B cùng dùng app. Dữ liệu đề của họ phải được giấu kín.
- **Kỹ thuật**: 
  - Đưa `userId` (hoặc `tenantId`) vào TẤT CẢ các collection (`questions`, `exams`, `students`).
  - Cập nhật **Firebase Security Rules** sao cho: Câu hỏi của ai, chỉ người đó được ĐỌC/GHI/SỬA.
  - Sẽ có "Kho câu hỏi công cộng" (Public Bank do ban quản trị thầy cung cấp) và "Kho câu hỏi cá nhân" (Private Bank - tài sản riêng của họ).

### Trụ cột 2: White-Label Export Generator (Đóng mộc thương hiệu)
- **Vấn đề**: GV in đề PDF phải có watermark và logo trung tâm của họ.
- **Kỹ thuật**: Nâng cấp module Xuất PDF. Bổ sung tính năng cấu hình Header, Footer, Watermark, Logo vào `UserProfile` của giáo viên. Trình tạo PDF sẽ chèn tự động các thông số này.

### Trụ cột 3: Billing & Quota Engine (Hệ thống Thu phí & Giới hạn)
- **Vấn đề**: Họ dùng chùa quá nhiều, làm sập quỹ tiền Firestore của thầy.
- **Kỹ thuật**:
  - Gắn một bảng `subscriptions`: Tier FREE, Tier PRO (200k/tháng), Tier VIP (500k/tháng).
  - Viết middleware đếm Quota: Giới hạn "Chỉ được upload 5 đề AI / tháng cho FREE", "Không giới hạn cho PRO". Nếu chạm giới hạn, bật popup chặn lại và bắt thanh toán.
  - Tích hợp cổng thanh toán tự động (VietQR, ZaloPay, PayOS) quét mã mở khóa account ngay lập tức (không đợi thầy check tay).

### Trụ cột 4: Student Portal Lite (Dành riêng cho lò luyện)
- **Vấn đề**: GV luyện thi không dùng Canvas. Họ cần học sinh thi trực tiếp trên web thầy, nhưng kết quả đổ về của riêng họ.
- **Kỹ thuật**: Tạo 1 giao diện Học Sinh (Student Role). Học sinh nhập Mã Lớp/Mã Đề (`PIN CODE`) -> Vào thi -> Điểm được bắn thẳng vào Dashboard của giáo viên sở hữu mã đề đó.

---

## PHẦN 3: LỘ TRÌNH THỰC THI (ROADMAP ĐỂ CẢI TIẾN)

### Giai đoạn 1: Chuẩn bị "cái bẫy" Marketing (Bản miễn phí có điều kiện)
- **Dev**: Cập nhật Firebase Rules để khóa dữ liệu cá nhân. Hoàn thiện tính năng sinh PDF có Watermark cố định của nền tảng (VD: *Tạo bởi Phy9plus.com*).
- **Thương mại**: Cho GV xài mượt và "đã" phần số hóa AI. Họ sẽ bị nghiện tốc độ này. Nhưng khi in PDF ra, dính watermark của thầy. 

### Giai đoạn 2: Thương mại hóa V1 (Mở khóa tính năng)
- **Dev**: Mở tính năng "Xóa watermark / Gắn watermark cá nhân" & "Trộn mã đề cao cấp". Tích hợp thanh toán PayOS/VietQR.
- **Thương mại**: Chào bán gói 199k/tháng để loại bỏ watermark, thay bằng logo của trung tâm họ, và cho phép upload số lượng đề không giới hạn.

### Giai đoạn 3: Hệ sinh thái Lò Luyện (Bắt Học sinh dùng)
- **Dev**: Mở Student Portal + Phân tích điểm sâu (Màu xanh đỏ theo Yêu cầu cần đạt).
- **Thương mại**: GV mang học sinh của họ vào. "Giữ chân" (Retention): GV không thể bỏ phần mềm thầy được nữa, vì toàn bộ điểm số, sự tiến bộ của HS nằm ở đây.

---

## PHẦN 4: KHÓ KHĂN & KHỦNG HOẢNG SẮP TỚI

Là một CEO/CTO cho dự án này, thầy phải lường trước:

1. **Khủng hoảng Shared Account (Dùng chung tài khoản)**
   - **Tâm lý Việt Nam**: 1 ông mua gói PRO 200k, sau đó share ID/Password cho 5 ông khác trong trường để xài chung.
   - **Xử lý**: Hệ thống bắt buộc phải code khâu Device Fingerprinting (Lưu phiên thiết bị). Trùng login 2 máy cùng lúc -> Đá văng máy cũ ra, hoặc ghi nhận cảnh báo.

2. **Bài toán "Thu 200k nhưng trả 300k cho Server" (Unit Economic)**
   - **Vấn đề**: 1 GV có thể dạy 500 HS. 500 HS này cùng lên web làm đề thi trong 1 đêm. Firestore sẽ tính tiền = `500 HS x 40 câu x 3 thao tác` = Hàng trăm ngàn lượt Document Read trong 1 ngày.
   - **Xử lý**: Về kỹ thuật, không thể cho Student đọc câu hỏi trực tiếp từ DB. Phải dùng **Redis Caching**, hoặc SSR (Server-side Rendering), hoặc ép bundle toàn bộ 40 câu hỏi thành 1 JSON gửi xuống LocalStorage của app học sinh 1 lần duy nhất, cấm đọc chắt mót từng câu.

3. **Chống trộm dữ liệu (Data Scraping/Piracy)**
   - GV sẽ tải đề từ "Ngân hàng cộng đồng" của nền tảng về máy riêng.
   - **Xử lý**: Cấm chuột phải bôi đen (không ngăn được thợ thầy biết code nhưng cản được đa số). Nếu hiển thị trên giao diện Học sinh bảo vệ chặt DOM (Canvas rendering text) nếu cần. Đối với GV, tính giá trị cốt lõi là ở CÔNG CỤ (Tool) không phải ở DỮ LIỆU.

---
**TÓM LẠI BÀI TOÁN KINH DOANH:**
Ngách **Giáo viên Luyện thi chuyên Lý** là một thị trường ngách **"Bé nhưng siêu Rục Rịch (High-Intention)"**. Về kỹ thuật, nó cực kỳ "rẻ" và "nhanh" hơn việc mở rộng Đa môn (vì thầy giữ nguyên được hệ thống parse công thức Lý, YCCĐ đang có). Việc cấp thiết nhất ngay lúc này là: **Phân rã Database thành các kho Private (Kho Tắt), tạo mô-đun gắn tính năng thương hiệu (Watermark cá nhân), và tích hợp luồng Billing (Thu tiền).**
