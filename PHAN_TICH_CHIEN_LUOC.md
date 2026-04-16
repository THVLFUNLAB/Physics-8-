# BẢN PHÂN TÍCH QUY MÔ & CHIẾN LƯỢC: TỪ "KHO VẬT LÍ" THÀNH "HỆ SINH THÁI GIÁO DỤC B2B"

Mục tiêu cốt lõi: Mở rộng hệ thống *PHYS-9+* hiện tại thành một **Nền tảng Quản lý & Số hóa Ngân hàng đề thi Đa môn (Middle & High School)**, tích hợp sâu vào **Canvas LMS**, và định hướng **Thương mại hóa (SaaS B2B & B2C)**.

---

## PHẦN 1: TÁI CẤU TRÚC APP (KIẾN TRÚC & HỆ THỐNG)

Hiện tại, hệ thống của thầy đang được "hardcode" (code cứng) rất nhiều cho môn Vật Lí (Yêu Cầu Cần Đạt, Mã môn, LaTeX, Công cụ mô phỏng). Để mở rộng, phải chuyển sang kiến trúc **Dynamic (Động)**.

### 1. Nâng cấp Database (Firestore) thành Multi-Tenant & Multi-Subject
Thầy không thể trộn đề Tiếng Anh vào chung collection với Vật Lí nếu không có bộ lọc chuẩn. Cấu trúc DB cần đổi thành:
- **`subjects`**: Chứa metadata của các môn (VD: `id: math_12`, `name: Toán 12`, `hasLatex: true`, `hasAudio: false`).
- **`curriculum_standards` (YCCĐ)**: Tách YCCĐ thành collection riêng, map theo từng `subject_id`.
- **`questions`**: Thêm trường `subject_id`, `grade_level` bắt buộc.
- **`organizations` (Tenant)**: Cần thêm bảng này nếu thầy muốn bán cho các trường khác nhau (Trường A không được thấy đề của Trường B - dẫu dùng chung 1 app).

### 2. Định hình lại Component (UI/UX)
- Các công cụ như *Batch Image Mapper* hay *AI Text-to-JSON* phải trở thành công cụ lõi dùng chung (Agnostic Tools) không dính chữ "Vật lí".
- Môn học đặc thù:
  - **Hóa học**: Cần hỗ trợ quét và render công thức cấu tạo phân tử (SMILES / mhchem).
  - **Tiếng Anh**: Hệ thống phải xử lý cấu trúc *Đục lỗ điền từ* (Cloze Test) hoặc *1 đoạn văn dài + 5 câu hỏi dưới* (Reading Comprehension). Cấu trúc `content` của thầy hiện tại chỉ hỗ trợ tốt cho câu rời và "Câu chùm Toán/Lý", chưa tối ưu cho Tiếng Anh.

---

## PHẦN 2: TÍCH HỢP CANVAS LMS (CHUẨN LTI 1.3)

Để "app của thầy chui vào nằm trong Canvas của trường", thầy không làm API tự chế, mà phải dùng chuẩn quốc tế **LTI 1.3 (Learning Tools Interoperability)**.

### Canvas LMS LTI 1.3 hoạt động ra sao?
1. **SSO (Đăng nhập 1 chạm)**: Giáo viên/Học sinh dùng quyền Canvas ấn vào 1 link → App thầy tự động mở ra NẰM TRONG iFrame của Canvas mà không cần hỏi password.
2. **Deep Linking (Nhúng đề thi)**: Giáo viên ở Canvas bấm "Add Assignment" → Nó mở App của thầy lên → GV chọn 1 đề Toán 40 câu → App thầy gửi link Đề đó ngược lại Canvas. Học sinh bấm vào làm.
3. **Grade Passback (Đồng bộ điểm)**: Học sinh làm thi trên App thầy được 8 đ. App thầy bắn API tự động cộng 8 đ đó vào thẳng Sổ điểm (Gradebook) của Canvas.

### Thầy phải làm gì về mặt kỹ thuật?
- Xây dựng một Backend (Node.js/Express) để xử lý luồng khóa bảo mật (OIDC - OpenID Connect / OAuth2) với Canvas. Firebase Client (React) không thể tự làm chuẩn LTI bảo mật được.
- Đăng ký App với Canvas của trường cấp quyền Developer Key.

---

## PHẦN 3: LỘ TRÌNH THỰC THI (ROADMAP)

- **Giai đoạn 1: Generalization (Đa môn hóa - 2~3 tháng)**
  - Tách lõi Vật lí ra. Tạo CMS cho phép Admin thêm/sửa "Cây YCCĐ" cho bất kỳ môn nào.
  - Cập nhật *Prompt Gemini* thành hệ thống prompt động: Bấm môn Anh Văn thì dùng Prompt Tiếng Anh (không ép double-escape LaTeX để tránh hỏng text), bấm môn Lý thì dùng Prompt Toán/Lý.
  
- **Giai đoạn 2: LTI 1.3 & Canvas Backend (Tích hợp - 2 tháng)**
  - Dựng 1 server nhỏ (Vercel Serverless / Cloud Functions) làm Middleware giao tiếp với Canvas hmac/jwt.
  - Test luồng: Canvas GV nhúng đề ↔ Học sinh Canvas giải đề ↔ Bắn điểm về Canvas.

- **Giai đoạn 3: B2B Multi-tenant (SaaS hóa - 1~2 tháng)**
  - Phân luồng Data: Tạo Sub-domain cho từng trường (`truongA.appthay.com`).
  - Xây dashboard tổng cho Hiệu trưởng/Tổ trưởng theo dõi năng suất số hóa của giáo viên.

---

## PHẦN 4: THƯƠNG MẠI HÓA (MONETIZATION)

Thầy có 2 hướng đi đánh ra thị trường:

1. **B2B (Bán cho Trường học / Trung tâm)**: *Đây là hướng ra tiền khủng và ổn định nhất.*
   - **Gói bán**: Cấp License cho cả trường (VD: 50.000.000 VNĐ / năm).
   - **Giá trị**: Họ mua khả năng "Số hóa kho đề cũ của trường thành kho chuẩn GDPT 2025 chỉ trong 1 tháng thay vì bưng vác nhập tay 1 năm" + "Tự tương thích với Canvas/Moodle họ đang dùng".

2. **B2C/B2Teacher (SaaS cho Giáo viên lẻ)**:
   - **Gói bán**: Subscriptions (Gói Pro 200k/tháng).
   - **Giá trị**: Cho phép họ số hóa giới hạn file/tháng. Bán "Quota AI" chạy Gemini.

---

## PHẦN 5: CÁC KHÓ KHĂN & "GÁO NƯỚC LẠNH" TRƯỚC MẮT

1. **Bài toán chi phí mồi AI (API Cost)**
   - Hiện thầy đang copy-paste vào Gemini Web (Miễn phí). Khi thương mại hóa B2B cho 1 mớ giáo viên dùng gộp, thầy KHÔNG THỂ bắt họ làm thủ công copy-paste.
   - Thầy bắt buộc phải gọi API trực tiếp (Backend-to-Gemini). Đọc 1 file ảnh có bảng biểu phức tạp qua API tốn phí khá cao. Nếu User tải lên 1000 trang PDF một lúc, hóa đơn API cuối tháng của thầy sẽ vỡ nợ nếu không tính toán gói cước (Pricing) chuẩn.

2. **Cơn ác mộng rác định dạng (Data Chaos)**
   - Môn Lý của thầy đang làm rất tốt vì thầy là người rành kiểm soát file Word.
   - Khi các GV bộ môn khác (Văn, Sử, Sinh) up file lên, họ dùng mọi thể loại font chữ (VNI-Times, .VnTime), chia cột, đánh tab sai, bullet lỗi, chèn ảnh copy từ Paint... AI OCR sẽ trả về 1 nùi rác tốn lượng lớn thời gian xử lý sanitize.

3. **Bản quyền dữ liệu (Silos)**
   - Bán B2B nghĩa là trường A không cho trường B thấy dữ liệu câu hỏi của họ. Thầy phải đảm bảo Firebase Rules bảo mật tuyệt đối, nếu không sẽ rò rỉ đề thi giữa các đối tác.

4. **Nút thắt kỹ thuật Firebase**
   - Firebase Firestore rất mạnh cho realtime (như thi trực tuyến), nhưng cực kỳ YẾU (và chi phí read đắt) cho việc "Trích xuất báo cáo thống kê phức tạp".
   - Ví dụ: *"Cho tôi xem báo cáo tỉ lệ đúng/sai theo từng mã YCCĐ Khối 12 của 5 lớp trong 2 năm qua"* → Querry này bằng Firestore có thể ăn đứt vài trăm ngàn lượt Document Read = trả tiền mệt nghỉ. Khi App phình to, thầy sẽ phải xây luồng Data Warehouse riêng để làm báo cáo tính điểm.

---
**Tổng kết:** Tầm nhìn của thầy rất bắt đúng "Trend" chuyển đổi số GDPT 2025. Lõi số hóa AI thầy đang có là "vũ khí sắc bén". Bước tiếp theo là tập trung giải quyết bài toán Kiến trúc Đa môn và Xây Backend chuất LTI 1.3 cho Canvas.
