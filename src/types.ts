// ═══════════════════════════════════════════════════════════════════
//  PHYSICS9+ — TYPE DEFINITIONS (v4.0)
//  Nâng cấp Sprint: Module 1 (Auto-Email) + Module 2 (Dynamic Exam)
//                  + Module 3 (Teacher Portal — Giao diện Giáo viên)
// ═══════════════════════════════════════════════════════════════════

// Topic mở rộng: AI tự nhận diện và gán chủ đề phù hợp
// Các topic gợi ý (không giới hạn): 'Vật lí nhiệt', 'Khí lí tưởng', 'Từ trường', 'Vật lí hạt nhân',
// 'Dao động cơ', 'Sóng cơ', 'Điện xoay chiều', 'Sóng điện từ', 'Quang học', 'Lượng tử ánh sáng', ...
export type Topic = string;
export type QuestionLevel = 'Nhận biết' | 'Thông hiểu' | 'Vận dụng' | 'Vận dụng cao';
export type Part = 1 | 2 | 3;
// ── [MODULE 3] Thêm role 'teacher' — GV có portal riêng, ít quyền hơn admin ──
export type Role = 'student' | 'teacher' | 'admin' | 'assistant';
export type TargetGroup = 'Chống Sai Ngu' | 'Master Physics';

// ── [MODULE 2] Nguồn gốc câu hỏi — dùng để tách Kho đề cố định & Đề sinh tự động ──
export type ExamSource = 'BGD' | 'So' | 'Chuyen' | 'Other';

// ── [MODULE 2] Mức năng lực đích cho đề sinh tự động ──
export type CompetencyTarget = '6+' | '7+' | '8+' | '9+';

export interface Prescription {
  id: string;
  examId: string;
  title: string;
  assignedAt: any;
  status: 'pending' | 'completed';
  completedAt?: any;
  score?: number;
}

export interface Badge {
  id: string;
  title: string;
  icon: string;
  description: string;
  unlockedAt: any;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success';
  read: boolean;
  timestamp: any;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  className?: string;              // Lớp thực tế (VD: 12A1)
  // ── [MODULE 1 - NÂNG CẤP] Khối lớp chuẩn hóa để query email theo phân khúc ──
  // Được tự động extract từ className (VD: "12A1" → grade = 12)
  // Dùng cho Firebase Cloud Function trigger gửi email hàng loạt
  grade?: number;                  // Khối lớp: 10 | 11 | 12
  schoolYear?: string;             // Năm học (VD: 2025-2026)
  photoURL?: string;               // Avatar từ Google
  role: Role;
  targetGroup?: TargetGroup;
  redZones?: Topic[];
  knowledgeGapVault?: string[];
  prescriptions?: Prescription[];
  badges?: Badge[];
  notifications?: AppNotification[];
  behavioralSummary?: {
    careless: number;
    fundamental: number;
  };
  createdAt: any;
  // ── Tracking ──
  lastActive?: any;                // Timestamp lần hoạt động cuối
  streak?: number;                 // Số ngày học liên tục
  lastStreakDate?: string;         // "YYYY-MM-DD" ngày cuối tính streak
  stars?: number;                  // Tổng sao tích lũy (Rank System)
  // ── Monetization ──
  tier?: 'free' | 'vip';           // Hạng tài khoản
  usedAttempts?: number;           // Số lượt thi đã dùng (chỉ tính FREE, có giới hạn)
  totalAttempts?: number;          // Tổng số đề đã làm (cả VIP + FREE, không giới hạn — dùng để phân tích)
  maxAttempts?: number;            // Giới hạn lượt thi (Free: 20)
  isUnlimited?: boolean;           // Cờ VIP không giới hạn
  // ── Learning Path ──
  learningPath?: {
    completedTopics: string[];
    topicProgress: Record<string, {
      totalAttempts: number;
      bestScore: number;
      lastScore: number;
      mastered: boolean;           // bestScore >= 8.0
    }>;
    overallProgress: number;       // 0-100%
    weaknesses: string[];
    weaknessProfile?: WeaknessProfile;
    lastAssessmentDate?: any;
  };
  failedQuestionIds?: string[];    // Bộ nhớ "Sai Ngu" định tuyến 70-30
  // ── Teacher Portal: Lớp học ──────────────────────────────────────────
  classId?: string;                // ID lớp HS đang theo học (joinable class)
  classIds?: string[];             // Danh sách các classId (nếu HS join nhiều lớp)
}

export interface LoginLog {
  id?: string;
  userId: string;
  email: string;
  displayName: string;
  timestamp: any;
  userAgent?: string;
  action: 'login' | 'logout' | 'session_refresh';
}

export interface Question {
  id?: string;
  part: Part;
  targetGrade?: number;
  topic: Topic;
  subTopic?: string;
  level: QuestionLevel;
  yccdCode?: string;             // Mã Yêu cầu cần đạt (GDPT 2018)
  content: string;
  options?: string[]; // For Part I & II
  correctAnswer: any; // Part I: index, Part II: boolean[], Part III: number
  explanation: string;
  status?: 'draft' | 'published'; // Trạng thái nháp/đã duyệt
  isTrap?: boolean;               // Cờ đánh dấu "Câu Lừa/Bẫy"
  tags?: string[];
  // ── [MODULE 2 - NÂNG CẤP] Phân loại nguồn gốc câu hỏi ──
  // Dùng để tách Kho đề: 'BGD'/'So'/'Chuyen' → Đề cố định | undefined → Đề sinh tự động
  examSource?: ExamSource;        // Nguồn: BGD | Sở | Chuyên | Khác
  year?: number;                  // Năm ra đề (VD: 2025)
  // groupId: Đánh dấu câu kép Phần II dùng chung đề bài — cùng groupId = cùng cặp
  groupId?: string;
  // ═══ Cluster support: Câu hỏi chùm dùng chung ngữ cảnh ═══
  clusterId?: string;       // ID của cluster chứa câu này (nếu có)
  clusterOrder?: number;    // Thứ tự trong cluster (0, 1, 2...)
  uploadBatchId?: string;   // ID của đợt upload để lọc hàng loạt
  resources?: {
    title: string;
    url: string;
    type: 'video' | 'document';
  }[];
  simulationUrl?: string;
  createdAt?: any;           // Timestamp lưu vào Firestore
}

// ═══ Cluster Question: Nhóm câu hỏi dùng chung đoạn dữ kiện ═══
export interface ClusterQuestion {
  id?: string;
  sharedContext: string;     // Đoạn dữ kiện dùng chung (HTML/Markdown)
  questionIds: string[];     // Danh sách ID câu con (theo thứ tự)
  topic: Topic;              // Topic chung
  tags?: string[];
  createdAt: any;
}

export interface ExamMatrix {
  topic: Topic;
  part1: { count: number; levels: Record<QuestionLevel, number> };
  part2: { count: number; levels: Record<QuestionLevel, number> };
  part3: { count: number; levels: Record<QuestionLevel, number> };
}

// ── [MODULE 2 - MỚI HOÀN TOÀN] Công thức Ma trận Đề Động ──────────
/**
 * DynamicMatrixFormula — Lưu cấu trúc "Công thức" cho đề sinh tự động.
 * Ví dụ: Đề 8+ Vật lý 12 = 18 câu Nhận biết/Thông hiểu + 10 Vận dụng/VDC
 *
 * Lưu trữ trong Firestore collection: 'dynamicMatrixFormulas'
 * Được dùng bởi examGeneratorService.ts → generateDynamicExam()
 */
export interface DynamicMatrixFormula {
  id?: string;                    // Firestore document ID
  title: string;                  // VD: "Đề 8+ Vật lý 12 - Ma trận 2025"
  description?: string;           // Mô tả ngắn cho Admin

  // ── Phân loại đích ──
  targetGrade: number;            // Khối lớp: 10 | 11 | 12
  targetCompetency: CompetencyTarget; // '6+' | '7+' | '8+' | '9+'

  // ── [MODULE 3] Teacher Ownership (optional — backward compatible) ──
  // undefined/false = Công thức hệ thống do Admin tạo (PRESET_MATRIX_FORMULAS)
  // true = GV tự định nghĩa ma trận riêng
  isTeacherFormula?: boolean;
  ownerTeacherId?: string;        // UID GV tạo (chỉ có khi isTeacherFormula=true)
  // Phân cấp hiển thị của ma trận:
  //   'private' → chỉ GV đó thấy và dùng
  //   'class'   → GV trong trường/phòng ban (future use)
  //   'public'  → Toàn hệ thống thấy (Admin approve)
  matrixVisibility?: 'private' | 'class' | 'public';
  // Topic filter: GV muốn bốc câu từ topic cụ thể (client-side filter)
  // VD: ['Dao động cơ', 'Sóng cơ'] → chỉ lấy câu thuộc 2 topic này
  priorityTopicsByPart?: {
    part1?: string[];             // Topic ưu tiên cho Phần 1
    part2?: string[];             // Topic ưu tiên cho Phần 2
    part3?: string[];             // Topic ưu tiên cho Phần 3
  };

  // ── Cấu trúc 3 phần theo chuẩn THPT 2025 (Bộ GD&ĐT) ──
  structure2025: {
    /** Phần I: Trắc nghiệm nhiều lựa chọn (4 đáp án A/B/C/D) */
    part1: {
      totalCount: number;         // Tổng số câu Part I (VD: 18)
      levels: Record<QuestionLevel, number>; // {Nhận biết: 8, Thông hiểu: 5, Vận dụng: 3, Vận dụng cao: 2}
    };
    /** Phần II: Đúng/Sai 4 ý (mỗi ý đúng/sai độc lập) */
    part2: {
      totalCount: number;         // Tổng số câu Part II (VD: 4)
      levels: Record<QuestionLevel, number>; // {Nhận biết: 0, Thông hiểu: 1, Vận dụng: 2, Vận dụng cao: 1}
    };
    /** Phần III: Trả lời ngắn (điền số, 0.25đ/câu) */
    part3: {
      totalCount: number;         // Tổng số câu Part III (VD: 6)
      levels: Record<QuestionLevel, number>; // {Nhận biết: 0, Thông hiểu: 2, Vận dụng: 2, Vận dụng cao: 2}
    };
  };

  // ── Bộ lọc nguồn câu hỏi (tùy chọn) ──
  // Nếu để trống → lấy tất cả (bao gồm cả câu không có examSource)
  allowedSources?: ExamSource[];  // VD: ['BGD', 'So'] — chỉ bốc từ đề Sở/BGD

  // ── Giới hạn năm ra đề ──
  // Nếu để trống → lấy tất cả các năm
  yearRange?: {
    from: number;                 // VD: 2022
    to: number;                   // VD: 2025
  };

  // ── Danh sách topic ưu tiên (tùy chọn) ──
  // Nếu để trống → bốc từ tất cả topic trong kho
  priorityTopics?: Topic[];

  // ── Metadata ──
  isActive: boolean;              // false = ẩn, không cho chọn trên UI
  createdBy: string;              // UID admin tạo
  createdAt: any;                 // Firestore Timestamp
  updatedAt?: any;                // Firestore Timestamp
}

export interface Exam {
  id?: string;
  title: string;
  targetGrade?: number;
  questions: Question[];
  questionIds?: string[];
  createdAt: any;
  createdBy: string;
  type: 'Matrix' | 'AI_Diagnosis' | 'Custom' | 'Digitized' | 'Dynamic'; // Thêm 'Dynamic' cho đề sinh tự động
  targetStudentId?: string;
  published?: boolean;       // false = nháp (ẩn với HS), true = phát hành
  sourceFile?: string;       // Tên file gốc (nếu có)
  // ── [MODULE 2] Liên kết với công thức ma trận ──
  matrixFormulaId?: string;  // Ref → dynamicMatrixFormulas collection (nếu là đề Dynamic)
  competencyTarget?: CompetencyTarget; // Mức năng lực đích (6+/7+/8+/9+)
  // ── [MODULE 3] Teacher Portal — Ownership & Visibility ──────────────────
  // Nếu ownerTeacherId = null/undefined → đề do Admin tạo (visible toàn hệ thống)
  ownerTeacherId?: string;   // UID của GV sở hữu đề (undefined = Admin)
  // Phân cấp hiển thị:
  //   'private' → chỉ GV tạo thấy
  //   'class'   → HS trong allowedClassIds thấy
  //   'public'  → toàn hệ thống (Admin approve)
  visibility?: 'private' | 'class' | 'public';
  allowedClassIds?: string[]; // Ref → classes collection (dùng khi visibility='class')
  approvedByAdmin?: boolean;  // Cờ Admin duyệt khi visibility='public'
  durationMinutes?: number;   // Thời gian làm bài (phút) — dùng cho đề GV sinh
}

export interface WeaknessItem {
  topic: string;             // Chủ đề lớn (ví dụ: "Ng động lực học")
  subTopic: string;          // Chủ đề nhỏ (ví dụ: "Ba định luật Newton")
  yccDCode: string;          // Mã YCCĐ GDPT 2018 (ví dụ: "10.DLH.1")
  weakLevel: 'NB' | 'TH' | 'VD' | 'VDC'; // Cấp độ nhận thức yếu nhất
  errorType: 'careless' | 'fundamental' | 'skipped'; // Bản chất lỗi
  wrongCount: number;        // Số câu sai trong topic này
  correctRate: number;       // % đúng (0-1)
  remedialCount: number;     // Số câu cần trong đề chữa
  priority: 'critical' | 'major' | 'minor'; // Mức ưu tiên
}

export interface WeaknessProfile {
  grade: number;                         // Khối lớp (10/11/12)
  overallLevel: 'S' | 'A' | 'B' | 'C'; // Đánh giá tổng quan
  behavioralNote: string;                // Nhận xét hành vi học tập
  items: WeaknessItem[];                 // Danh sách điểm yếu
  strengths: string[];                   // Điểm mạnh (để động viên)
  actionPlan: string[];                  // 3 việc cần làm ngay
  remedialMatrix: { topic: string; subTopic: string; levels: string[]; count: number }[];
  generatedAt?: any;
}

export interface Attempt {
  id: string;
  userId: string;
  testId: string;
  examId?: string; // Link to Exam if applicable
  answers: Record<string, any>;
  score: number;
  weaknessProfile?: WeaknessProfile;  // Chẩn đoán năng lực chi tiết (mới)
  analysis?: {
    errorTracking?: Record<string, string>;
    feedback: string;
    redZones: Topic[];
    remedialMatrix?: { topic: string; count: number }[];
    behavioralAnalysis: {
      carelessCount: number;
      fundamentalCount: number;
    };
  };
  personal_ai_diagnosis?: string;
  topic?: string;
  timeSpent?: number;
  timestamp: any;
}

export interface ErrorAnalysis {
  type: 'Lỗi hiểu sai bản chất' | 'Lỗi kỹ năng' | 'Lỗi kỹ thuật';
  reason: string;
  advice: string;
}

export interface Simulation {
  id?: string;
  title: string;
  description: string;
  category: string;
  /** HTML source code (gzip-compressed or raw). Used for local simulations. */
  html_code: string;
  /** External URL to embed via iframe (e.g. javalab.org, PhET). Takes priority over html_code if set. */
  sourceUrl?: string;
  thumbnail?: string;
  createdAt: any;
}

export interface ReportedQuestion {
  id?: string;
  questionId: string;
  studentId: string;
  studentName?: string;
  reason: 'Sai đáp án' | 'Lỗi đề' | 'Lỗi công thức';
  message?: string; // Text field cho học sinh phản hồi thêm
  status: 'pending' | 'resolved';
  timestamp: any;
  resolvedAt?: any;
}

// ═══ Spaced Repetition (SM-2) ═══

export interface MemoryLog {
  id?: string;
  questionId: string;
  interval: number;            // Khoảng thời gian ôn lại (tính bằng ngày)
  easeFactor: number;          // Hệ số trơn tru của não bộ (mặc định 2.5)
  nextReviewDate: any;         // Timestamp thời điểm cần ôn lại
  consecutiveCorrect: number;  // Số lần trả lời đúng liên tiếp
  lastReviewed: any;           // Timestamp lần review gần nhất
  topic?: string;              // Lưu topic để dễ filter
}

// ═══ Module 4: Phòng Thi Tập Trung (Live Class Exam) ═══

export interface ClassRoom {
  id?: string;
  code: string;          // Mã lớp 6 ký tự (VD: "K12A1X")
  name: string;          // "Lớp 12A1"
  teacherId: string;     // UID admin tạo lớp
  studentIds: string[];  // Danh sách UID học sinh đã join
  grade?: number;        // Khối lớp (VD: 10, 11, 12)
  createdAt: any;
}

export interface ClassExam {
  id?: string;
  classId: string;       // Ref → classes collection
  examId: string;        // Ref → exams collection
  title: string;         // Tên phiên thi
  startTime: any;        // Server Timestamp — mốc bắt đầu
  duration: number;      // phút (VD: 50)
  status: 'scheduled' | 'live' | 'ended';
  autoSubmit: boolean;
  createdAt: any;
  // ── Team Battle Mode ──
  teamMode?: boolean;                     // Bật chế độ thi đấu đội
  teamAssignment?: 'auto' | 'manual';     // Cách chia đội
  teamNames?: { A: string; B: string };   // Tên đội tuỳ chỉnh
}

export interface ClassAttempt {
  id?: string;
  classExamId: string;   // Ref → classExams
  studentId: string;     // UID học sinh
  studentName: string;
  studentEmail: string;  // Để phát hiện duplicate
  answers: Record<string, any>;
  score: number;
  totalAnswered: number; // Số câu đã trả lời (tracking realtime)
  startedAt: any;
  submittedAt?: any;
  status: 'in_progress' | 'submitted';
  deviceId: string;      // fingerprint thiết bị để phát hiện multi-device
  lastPing: any;         // Heartbeat timestamp để đếm online chính xác
  teamId?: 'A' | 'B' | null; // Team Battle: đội của học sinh
}

export type SidebarTab = string;

// ═══ Module 5: Khảo thí Offline & Macro Analytics ═══

export interface OfflineSessionStudentRecord {
  studentId: string;
  studentName?: string;
  classCode?: string;
  answers: Record<string, string>; // e.g. { "q1": "A", "q2": "C" }
  score: number;
}

export interface OfflineSession {
  id?: string;
  examId: string;           // Ref → exams collection
  examTitle: string;        // Tên đề
  assistantId: string;      // UID trợ giảng nhập liệu
  createdAt: any;           // Timestamp thời điểm tạo/lưu
  records: OfflineSessionStudentRecord[]; // Mảng tổng kết quả 1 document
}

export interface ExamReport {
  id?: string; // id = examId
  examId: string;
  totalParticipants: number;
  averageScore: number;
  scoreDistribution: Record<string, number>; // "0-2": 5, "2-4": 15...
  questionStats: Record<string, {
    correct: number;
    wrong: number;
    accuracy: number;
  }>;
  weakTopics: {
    topic: string;
    averagePerformance: string; // e.g. "40%"
  }[];
  ai_treatment_plan?: string;
  computedAt: any;
}

// ═══ Module 7: Chiến dịch Tâm Thư AI (Admin → Student) ═══

export interface CampaignMessage {
  id?: string;
  studentId: string;         // UID học sinh nhận thư
  studentName: string;       // Tên hiển thị
  content: string;           // Nội dung tâm thư (Markdown)
  isRead: boolean;           // false = chưa đọc, true = đã "Quyết tâm"
  campaignId: string;        // ID đợt phát động (group batch)
  createdAt: any;            // Timestamp server
}

// ═══════════════════════════════════════════════════════════════════
//  MODULE 3: TEACHER PORTAL — Types mới (thêm cuối file, không sửa cũ)
// ═══════════════════════════════════════════════════════════════════

/**
 * LearningMaterial — Kho Học Liệu Số của Giáo Viên
 * Firestore path: learningMaterials/{materialId}
 *
 * Quy định kỹ thuật (đã chốt):
 *   - PDF/DOCX: Firebase Storage, tối đa 5MB → dùng storageUrl
 *   - JPG/PNG:  Firebase Storage, tối đa 2MB  → dùng storageUrl
 *   - Video:    BẮT BUỘC external link (YouTube, Drive) → dùng externalUrl
 *   - Lab ảo:   External link (PhET, Javalab, etc.)    → dùng externalUrl
 */
export type MaterialType = 'pdf' | 'image' | 'video_link' | 'lab_link' | 'slide_link' | 'document_link';
export type MaterialVisibility = 'private' | 'class' | 'public';
export type MaterialApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface LearningMaterial {
  id?: string;

  // ── Thông tin cơ bản ──
  title: string;                      // VD: "Bài giảng Dao động cơ - Tuần 3"
  description?: string;               // Mô tả ngắn (hiển thị dưới card)
  type: MaterialType;
  topic?: string;                     // Liên kết Topic system (physicsTopics.ts)
  targetGrade?: number;               // 10 | 11 | 12 | undefined = tất cả khối
  tags?: string[];                    // VD: ['dao-dong-co', 'bai-giang', 'tuan-3']

  // ── Nguồn tài liệu (chỉ dùng 1 trong 2) ──
  storageUrl?: string;                // Firebase Storage URL (pdf, image)
  storagePath?: string;               // Storage path để xóa file (VD: materials/uid/file.pdf)
  externalUrl?: string;               // URL ngoài (YouTube, PhET, Drive, etc.)
  fileSize?: number;                  // bytes — chỉ dùng khi có storageUrl
  thumbnailUrl?: string;              // Ảnh preview (tùy chọn)

  // ── Phân quyền (Data Isolation — 3 tầng) ──
  visibility: MaterialVisibility;
  ownerId: string;                    // UID GV tạo tài liệu
  ownerRole: 'teacher' | 'admin';
  // Danh sách lớp được xem khi visibility='class'
  // Ref → classes collection
  allowedClassIds?: string[];

  // ── Admin Approval (chỉ áp dụng khi visibility='public') ──
  approvalStatus?: MaterialApprovalStatus; // 'pending' khi GV xin public
  approvedBy?: string;                // UID Admin duyệt
  approvedAt?: any;                   // Timestamp duyệt
  rejectionReason?: string;           // Lý do từ chối (nếu rejected)

  // ── Metadata & Tracking ──
  createdAt: any;                     // Firestore Timestamp
  updatedAt?: any;
  viewCount?: number;                 // Lượt xem (tăng dần)
  downloadCount?: number;             // Lượt tải (chỉ pdf/image)
}

/**
 * TeacherExamAssignment — GV Giao Đề Cho Lớp
 * Firestore path: teacherExamAssignments/{assignmentId}
 *
 * Thay thế việc dùng ClassExam cho các bài kiểm tra thông thường.
 * ClassExam vẫn dùng cho Live Class Exam (thi trực tiếp realtime).
 */
export type AssignmentStatus = 'draft' | 'active' | 'closed';

export interface TeacherExamAssignment {
  id?: string;

  // ── Liên kết ──
  teacherId: string;                  // UID GV phát đề
  examId: string;                     // Ref → exams collection
  classId: string;                    // Ref → classes collection
  // Denormalized để hiển thị nhanh, không cần extra read
  examTitle: string;
  className?: string;

  // ── Cấu hình phát đề ──
  status: AssignmentStatus;
  assignedAt: any;                    // Firestore Timestamp
  availableFrom?: any;                // Mở từ lúc nào (null = ngay lập tức)
  deadline?: any;                     // Hạn nộp bài (null = không giới hạn)

  // ── Quyền HS sau khi nộp ──
  allowReview: boolean;               // HS được xem lại bài + đáp án sau khi nộp
  showLeaderboard: boolean;           // Hiển thị bảng điểm cho HS
  randomizeQuestions?: boolean;       // Xáo câu hỏi khác nhau mỗi HS

  // ── Thống kê realtime (denormalized, cập nhật khi HS nộp) ──
  submittedCount?: number;            // Số HS đã nộp
  totalStudents?: number;             // Tổng HS trong lớp tại thời điểm phát
  averageScore?: number;              // Điểm TB của lớp (tính sau khi đủ 50% nộp)
}
