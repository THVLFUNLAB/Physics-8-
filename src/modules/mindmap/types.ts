// ═══════════════════════════════════════════════════════════════════
//  MINDMAP MODULE — TYPE DEFINITIONS
//  Interactive Physics Mindmap Viewer (LOCAL ONLY — Độc quyền Thầy Hậu)
// ═══════════════════════════════════════════════════════════════════

/** Loại node trong sơ đồ tư duy */
export type MindmapNodeType = 'root' | 'theory' | 'formula' | 'image' | 'note';

/** Dữ liệu một node trong JSON input */
export interface MindmapNodeData {
  id: string;
  parent?: string;          // ID node cha (root không có parent)
  type: MindmapNodeType;
  label: string;            // Tiêu đề / nội dung chính
  math?: string;            // LaTeX công thức: "$pV = nRT$"
  img_id?: string;          // ID ảnh placeholder (admin upload sau)
  img_url?: string;         // URL ảnh sau khi upload lên Firebase Storage
  description?: string;     // Mô tả thêm (tooltip hoặc expand)
}

/** Cấu trúc một chương (chapter) mindmap */
export interface MindmapChapter {
  grade: string;            // "10" | "11" | "12"
  chapter: string;          // "Khí lí tưởng"
  nodes: MindmapNodeData[];
  createdAt?: any;          // Firestore Timestamp
  updatedAt?: any;
  createdBy?: string;       // UID admin
}

/** Mẫu JSON chuẩn cho Admin dán vào textarea */
export const SAMPLE_MINDMAP_JSON: MindmapChapter = {
  grade: "12",
  chapter: "Vật lí nhiệt",
  nodes: [
    {
      id: "root",
      type: "root",
      label: "VẬT LÍ NHIỆT",
      description: "Nghiên cứu về cấu trúc vật chất, sự chuyển thể, các đại lượng nhiệt học và định luật nhiệt động lực học."
    },
    {
      id: "n1",
      parent: "root",
      type: "theory",
      label: "Cấu trúc vật chất",
      description: "Mô hình động lực học phân tử và cấu tạo 3 thể Rắn - Lỏng - Khí."
    },
    {
      id: "n1_1",
      parent: "n1",
      type: "theory",
      label: "Mô hình động học phân tử",
      description: "Vật chất cấu tạo từ các phân tử. Chuyển động nhiệt hỗn độn không ngừng. Giữa chúng có lực tương tác (hút/đẩy)."
    },
    {
      id: "n1_warn",
      parent: "n1_1",
      type: "note",
      label: "⚠️ Bẫy sai lầm",
      description: "Nhiều học sinh cho rằng phân tử chuyển động đều. Sai! Phân tử chuyển động HỖN ĐỘN, không có quỹ đạo xác định. Nhiệt độ càng cao, chuyển động nhiệt càng nhanh."
    },
    {
      id: "n1_2",
      parent: "n1",
      type: "theory",
      label: "Đặc điểm 3 thể Rắn - Lỏng - Khí",
      description: "Dựa trên khoảng cách phân tử, lực liên kết và mức độ chuyển động để phân biệt hình dạng và thể tích của 3 thể."
    },
    {
      id: "n1_2_warn",
      parent: "n1_2",
      type: "note",
      label: "⚠️ Lưu ý ngoại lệ",
      description: "Đặc biệt với Nước: Khoảng cách trung bình giữa các phân tử ở thể Lỏng lại NHỎ HƠN ở thể Rắn (nước đá). Do đó khối lượng riêng của nước đá nhỏ hơn, khiến nó nổi trên mặt nước."
    },
    {
      id: "n2",
      parent: "root",
      type: "theory",
      label: "Sự chuyển thể của các chất",
      description: "Quá trình biến đổi qua lại giữa các trạng thái rắn, lỏng, khí."
    },
    {
      id: "n2_img",
      parent: "n2",
      type: "image",
      label: "Sơ đồ chuyển thể",
      description: "Sơ đồ minh họa quá trình: Nóng chảy - Đông đặc - Hóa hơi - Ngưng tụ - Thăng hoa - Ngưng kết.",
      img_id: "IMG_P1_S1"
    },
    {
      id: "n2_1",
      parent: "n2",
      type: "theory",
      label: "Sự nóng chảy",
      description: "Quá trình chuyển từ Rắn sang Lỏng. Chất rắn kết tinh có nhiệt độ nóng chảy xác định, chất vô định hình thì không."
    },
    {
      id: "n2_1_warn",
      parent: "n2_1",
      type: "note",
      label: "⚠️ Bẫy sai lầm",
      description: "Nhầm tưởng thủy tinh, nhựa, sáp, kẹo có nhiệt độ nóng chảy xác định. Chúng là Rắn Vô Định Hình, khi nung nóng chỉ mềm dần ra."
    },
    {
      id: "n2_2",
      parent: "n2",
      type: "theory",
      label: "Sự hóa hơi",
      description: "Chuyển từ Lỏng sang Khí. Gồm 2 hình thức: Bay hơi và Sôi."
    },
    {
      id: "n2_2_warn",
      parent: "n2_2",
      type: "note",
      label: "⚠️ Bẫy sai lầm",
      description: "Sự bay hơi chỉ xảy ra trên bề mặt và ở MỌI nhiệt độ. Sự sôi xảy ra CẢ trên bề mặt và trong lòng chất lỏng, ở 1 nhiệt độ XÁC ĐỊNH (nhiệt độ sôi)."
    },
    {
      id: "n3",
      parent: "root",
      type: "theory",
      label: "Nhiệt lượng - Nhiệt dung riêng",
      description: "Các đại lượng năng lượng đặc trưng cho quá trình trao đổi nhiệt và chuyển thể."
    },
    {
      id: "n3_1",
      parent: "n3",
      type: "formula",
      label: "Công thức Nhiệt lượng",
      description: "Nhiệt lượng vật thu vào hoặc tỏa ra khi thay đổi nhiệt độ.",
      math: "$Q = m.c.\\Delta T$"
    },
    {
      id: "n3_1_warn",
      parent: "n3_1",
      type: "note",
      label: "⚠️ Bẫy sai lầm",
      description: "Độ biến thiên nhiệt độ (ΔT) tính theo độ K và độ C là CÓ GIÁ TRỊ NHƯ NHAU (Δt = ΔT). Không cần mất công đổi từng nhiệt độ t1, t2 ra Kelvin rồi mới trừ đi."
    },
    {
      id: "n3_2",
      parent: "n3",
      type: "formula",
      label: "Nhiệt nóng chảy riêng",
      description: "Nhiệt lượng cần cung cấp cho 1kg chất chuyển hoàn toàn từ rắn sang lỏng tại nhiệt độ nóng chảy.",
      math: "\\lambda = \\frac{Q}{m}"
    },
    {
      id: "n3_3",
      parent: "n3",
      type: "formula",
      label: "Nhiệt hóa hơi riêng",
      description: "Nhiệt lượng cần để 1kg chất lỏng hóa hơi hoàn toàn ở nhiệt độ sôi.",
      math: "L = \\frac{Q}{m}"
    },
    {
      id: "n4",
      parent: "root",
      type: "theory",
      label: "Thang nhiệt độ",
      description: "Các thang đo: Celsius (°C), Kelvin (K), Fahrenheit (°F)."
    },
    {
      id: "n4_1",
      parent: "n4",
      type: "theory",
      label: "Độ 0 Tuyệt đối (0 K)",
      description: "Nhiệt độ thấp nhất (0 K = -273,15 °C). Tại đây động năng chuyển động nhiệt của phân tử bằng 0, thế năng tương tác tối thiểu."
    },
    {
      id: "n4_1_warn",
      parent: "n4_1",
      type: "note",
      label: "⚠️ Bẫy sai lầm",
      description: "Hay nhầm Độ không tuyệt đối là 0 °C (nước đóng băng). 0 K ứng với -273,15 °C. Thang Kelvin không có giá trị âm."
    },
    {
      id: "n4_2",
      parent: "n4",
      type: "formula",
      label: "Đổi Celsius sang Kelvin",
      description: "Liên hệ giữa độ C và độ K",
      math: "$T = t + 273,15$"
    },
    {
      id: "n4_3",
      parent: "n4",
      type: "formula",
      label: "Đổi Celsius sang Fahrenheit",
      description: "Liên hệ giữa độ C và độ F",
      math: "$T(^{o}F) = 1,8.t(^{o}C) + 32$"
    },
    {
      id: "n5",
      parent: "root",
      type: "theory",
      label: "Nội năng & Định luật 1 NĐLH",
      description: "Các cách thay đổi nội năng (thực hiện công, truyền nhiệt) và định luật bảo toàn năng lượng."
    },
    {
      id: "n5_1",
      parent: "n5",
      type: "theory",
      label: "Định nghĩa Nội năng (U)",
      description: "Tổng động năng và thế năng tương tác của các phân tử."
    },
    {
      id: "n5_1_warn",
      parent: "n5_1",
      type: "note",
      label: "⚠️ Bẫy sai lầm",
      description: "Cho rằng nội năng của MỌI khí chỉ phụ thuộc vào nhiệt độ. Sai! Khí thực U phụ thuộc vào (T, V). Chỉ với KHÍ LÍ TƯỞNG thì U mới chỉ phụ thuộc vào T."
    },
    {
      id: "n5_2",
      parent: "n5",
      type: "formula",
      label: "Định luật 1 NĐLH",
      description: "Độ biến thiên nội năng bằng tổng công và nhiệt lượng mà vật nhận được.",
      math: "$\\Delta U = A + Q$"
    },
    {
      id: "n5_3",
      parent: "n5_2",
      type: "theory",
      label: "Quy ước dấu",
      description: "Q > 0: Nhận nhiệt, Q < 0: Tỏa nhiệt. A > 0: Nhận công, A < 0: Thực hiện công."
    },
    {
      id: "n5_3_warn",
      parent: "n5_3",
      type: "note",
      label: "⚠️ Bẫy sai lầm",
      description: "Học sinh hay lúng túng khi xác định dấu. MẸO: Hệ CÓ LỜI (Nhận vào) thì DƯƠNG (+). Hệ BỊ MẤT ĐI (Tỏa ra / Bị bắt thực hiện sinh công ra ngoài) thì ÂM (-)."
    },
    {
      id: "n5_img",
      parent: "n5",
      type: "image",
      label: "Minh họa hệ Khí dãn nở/nén",
      description: "Hình ảnh piston thể hiện các quá trình dãn nở sinh công và nhận công",
      img_id: "IMG_P8_S1"
    }
  ]
};

/** Color scheme cho mỗi loại node — PREMIUM MODERN THEME */
export const NODE_COLORS: Record<MindmapNodeType, {
  bg: string;
  border: string;
  text: string;
  glow: string;
  icon: string;
}> = {
  root: {
    bg: 'linear-gradient(135deg, #4f46e5 0%, #9333ea 100%)',
    border: '#a855f7',
    text: '#ffffff',
    glow: 'rgba(147, 51, 234, 0.4)',
    icon: '🧠',
  },
  theory: {
    bg: '#ffffff',
    border: '#3b82f6',
    text: '#0f172a',
    glow: 'rgba(59, 130, 246, 0.15)',
    icon: '💡',
  },
  formula: {
    bg: '#ffffff',
    border: '#f59e0b',
    text: '#0f172a',
    glow: 'rgba(245, 158, 11, 0.15)',
    icon: '📐',
  },
  image: {
    bg: '#ffffff',
    border: '#10b981',
    text: '#0f172a',
    glow: 'rgba(16, 185, 129, 0.15)',
    icon: '🖼️',
  },
  note: {
    bg: '#ffffff',
    border: '#ef4444',
    text: '#0f172a',
    glow: 'rgba(239, 68, 68, 0.15)',
    icon: '⚠️',
  },
};
