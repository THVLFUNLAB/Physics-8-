// Topic mở rộng: AI tự nhận diện và gán chủ đề phù hợp
// Các topic gợi ý (không giới hạn): 'Vật lí nhiệt', 'Khí lí tưởng', 'Từ trường', 'Vật lí hạt nhân',
// 'Dao động cơ', 'Sóng cơ', 'Điện xoay chiều', 'Sóng điện từ', 'Quang học', 'Lượng tử ánh sáng', ...
export type Topic = string;
export type QuestionLevel = 'Nhận biết' | 'Thông hiểu' | 'Vận dụng' | 'Vận dụng cao';
export type Part = 1 | 2 | 3;
export type Role = 'student' | 'admin' | 'assistant';
export type TargetGroup = 'Chống Sai Ngu' | 'Master Physics';

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
  maxAttempts?: number;            // Giới hạn lượt thi (Free: 30)
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

export interface Exam {
  id?: string;
  title: string;
  targetGrade?: number;
  questions: Question[];
  questionIds?: string[];
  createdAt: any;
  createdBy: string;
  type: 'Matrix' | 'AI_Diagnosis' | 'Custom' | 'Digitized';
  targetStudentId?: string;
  published?: boolean;       // false = nháp (ẩn với HS), true = phát hành
  sourceFile?: string;       // Tên file gốc (nếu có)
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
