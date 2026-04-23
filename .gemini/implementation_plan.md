# Kế hoạch nâng cấp giao diện Khối 10 & 11 bám sát Yêu Cầu Cần Đạt (YCCĐ)

Vấn đề hiện tại: Giao diện `StudentDashboard` khi HS lớp 10/11 đăng nhập, mặc dù có render `<Grade10Dashboard />` hoặc `<Grade11Dashboard />` ở trên cùng, nhưng bên dưới vẫn bị hiển thị chung các bài phân tích và các `TopicCard` cứng của lớp 12 (Vật lí nhiệt, Khí lí tưởng, v.v.). Hơn nữa, `Grade10Dashboard` hiện tại chỉ chứa data ảo (mockData) chưa bắt vào dữ liệu kết quả thi thật.

Kế hoạch này sẽ tách biệt hoàn toàn trải nghiệm của học sinh khối 10, khối 11 ngay từ khi đăng nhập, bốc dữ liệu trực tiếp từ `yccdData` để tạo lộ trình học tập "chuẩn GDPT 2018".

## User Review Required

> [!IMPORTANT]
> Thầy vui lòng xem xét và duyệt kiến trúc dưới đây. Thay vì để chung các thẻ bài tập ở `StudentDashboard`, ta sẽ chuyển quyền điều khiển cấu trúc hoàn toàn về cho từng màn hình Dashboard để học sinh lớp nào chỉ nhìn thấy bài tập lớp đó.

## Proposed Changes

### Thay đổi ở vỏ bọc chính (StudentDashboard)
- **Tái cấu trúc**: Gỡ bỏ section cứng chứa các `TopicCard` Lớp 12 hiện tại nằm ngoài `Grade12Dashboard`.
- **Truyền Props**: Truyền dải props `(user, attempts, onStartPrescription, onStartExam)` xuống cho cả 3 Component `Grade10Dashboard`, `Grade11Dashboard`, `Grade12Dashboard`.
- **Dashboard Độc lập**: `StudentDashboard` nay chỉ đóng vai trò chứa thông tin chung (Avatar, Streak, XP) và là Router chuyển hướng xuống đúng Dashboard khối.

### Xây dựng `Grade10Dashboard.tsx`
- **Tích hợp Real Data**: Tính toán `MasteryRadarChart` dựa trên `attempts` thật theo đúng các chủ đề lớp 10: *Động học, Động lực học, Công - năng lượng - công suất, Động lượng, Chuyển động tròn, Biến dạng lò xo*.
- **Hiển thị lộ trình YCCĐ (Điểm nhấn)**: Xây dựng một danh sách "Bản Đồ YCCĐ Lớp 10" nhóm theo từng `topic` (Ví dụ: Động học). Trong mỗi `TopicCard`, hiển thị rõ các ô mục (sub-sections) của YCCĐ.
- **Tính năng luyện tập YCCĐ**: Thêm nút `Luyện tập chuyên đề` gọi hàm `onStartPrescription(topic)` để bốc câu hỏi từ ngân hàng theo chuẩn YCCĐ lớp 10 đó.
- Cập nhật số đếm ngày thi học kỳ hoặc thông báo động lực phù hợp với lớp 10.
- **Hệ thống Bài tập & Khảo thí Độc lập**: Tích hợp danh sách bài kiểm tra (ExamsList) được cấu hình **chỉ hiển thị các đề thi có `targetGrade: 10`** được tạo từ ma trận do thầy upload hoặc khởi tạo, cách ly hoàn toàn với dữ liệu khối 11, 12 nhằm đảm bảo tính cá nhân hóa 100%.

### Xây dựng `Grade11Dashboard.tsx`
- **Tích hợp Real Data**: Giống như mẫu lớp 10, liên kết số liệu Radar với thông tin lớp 11 (*Dao động, Sóng, Trường điện, Dòng điện*).
- **Trải nghiệm riêng biệt**: Giao diện màu đỏ/tím, hiển thị danh sách "Bản Đồ YCCĐ Lớp 11" lấy mã "11" từ `yccdData.ts`. Học sinh sẽ click vào từng topic (VD: Sóng) để thấy YCCĐ truyền năng lượng, bước sóng và trực tiếp luyện tập theo mức độ.
- **Hệ thống Bài tập & Khảo thí Độc lập**: Tích hợp danh sách bài kiểm tra đặc thù khối 11 (**chỉ hiển thị `targetGrade: 11`**), đảm bảo tuyệt đối không có sự giao thoa hay liên quan tới hệ thống bài tập của khối 10 hay 12. Hỗ trợ hiển thị các đề dựa trên ma trận do thầy xây dựng riêng cho khối 11.

### Tái cấu trúc thành phần dùng chung và chuyên biệt
Dựa trên phân tích mã nguồn `StudentDashboard.tsx`, hiện tại có một lượng lớn tính năng đang được áp dụng đại trà cho mọi khối. Cụ thể:

1. **Giữ nguyên ở màn hình dùng chung (`StudentDashboard`)**: 
   - Thông tin cá nhân (Avatar, Rank, Danh hiệu, Streak).
   - Thanh tiến trình Quyền lợi VIP / Cảnh báo số lượt dùng free.
   - Bảng Phong Thần (GradeLeaderboard), Thống kê GPA.
   - Phân tích Hành vi (Behavioral Analysis: Lỗi ẩu, hổng gốc).
   - Kho ôn tập (Knowledge Gap Bucket) và Lịch sử kê đơn.

2. **Chuyển giao về màn hình độc lập (`Grade12Dashboard` vs `Grade11Dashboard` vs `Grade10Dashboard`)**:
   - Khối Radar Chart (Bản đồ năng lực): Dữ liệu của từng lớp sẽ khác nhau hoàn toàn.
   - Khối `TopicCards` (Bài Tập & Kiểm Tra): Tách hẳn các thẻ "Vật lí nhiệt", "Khí lí tưởng"... đưa vào `Grade12Dashboard`.
   - Khối `ExamsList` (Danh sách Đề kiểm tra): Hiện đang có bộ lọc tab (12, 11, 10). Tương lai, mỗi khối sẽ tàng trữ bảng danh sách hiển thị chỉ riêng khối đó.

### Phân tích hệ quả đối với giao diện Lớp 12 hiện tại
Việc thực hiện bóc tách khối 10 và khối 11 sẽ gây ra **các thay đổi TÍCH CỰC đến trải nghiệm của học sinh lớp 12**:

1. **Bảo toàn 100% Giao diện (UX/UI)**: Học sinh lớp 12 sẽ KHÔNG hề thấy sự xáo trộn nào trên biểu đồ của các em. Đồng hồ đếm ngược ngày thi THPTQG, Bảng lệnh triệu tập và Khu vực luyện tập "Vật lý Nhiệt", "Khí lí tưởng" vẫn đứng đúng vị trí.
2. **Loại bỏ bộ lọc phiền phức**: Ở danh sách bài kiểm tra (ExamsList), học sinh lớp 12 sẽ không còn thấy danh sách các tab "Khối 10", "Khối 11" hay "Tất cả" nữa. Giao diện lúc này chỉ load đúng đề thi của Khối 12 do thầy thiết lập, tránh tình trạng load dư thừa data hoặc học sinh làm nhầm đề của khối dưới.
3. **Mở khóa dữ liệu thực trên Radar Chart**: Hiện tại `Grade12Dashboard.tsx` đang dùng `mockData` (dữ liệu giả lập 90%, 85%...) cho "Bản đồ năng lực" và "Cảnh báo đỏ". Việc nâng cấp sẽ là cơ hội để team bơm dữ liệu (attempts, history) thật của lớp 12 vào để đồ thị Radar co giãn chính xác dựa trên năng lực của học sinh.

Tóm lại, Lớp 12 không bị mất bất cứ dòng tính năng nào, trải nghiệm học được làm "sạch" hơn, cá nhân hóa 100% như các khối dưới, và hệ thống sẽ loại bỏ được rác dữ liệu ảo đang hiển thị trên bản đồ năng lực của các em.
Học sinh sẽ thấy tỷ lệ hoành thành (Mastery) trên từng Topic này, và khi điểm yếu xuất hiện, hệ thống đánh cờ đỏ ngay tại Topic đó.

## Open Questions

> [!WARNING]
> Mức độ hiển thị YCCĐ chi tiết có thể rất dài. Nếu hiển thị toàn bộ nội dung từng YCCĐ dưới mỗi phần sẽ làm giao diện cuộn nhiều. Phương án tối ưu là sử dụng List dạng đóng/mở (Collapse), thầy đồng ý với phương án này chứ ạ?

## Verification Plan

### Manual Verification
- Đăng nhập (hoặc dùng chế độ Simulator trong tài khoản admin) vào học sinh lớp 10, đảm bảo toàn bộ thẻ bài tập Vật lí Nhiệt, Khí lí tưởng hoàn toàn **biến mất**. Thay vào đó là Bài tập Động lực học, Công - Năng lượng - Động lượng.
- Phân tích Radar biểu diễn chuẩn các mảng học tập khối 10 / 11 thay vì số liệu fix cứng.
- Nút "Thực thi nhiệm vụ" trên bảng cảnh báo cần hoạt động (tạo đề và chuyển trang thi).
