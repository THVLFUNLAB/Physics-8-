// Topic mở rộng: AI tự nhận diện và gán chủ đề phù hợp
// Các topic gợi ý (không giới hạn): 'Vật lí nhiệt', 'Khí lí tưởng', 'Từ trường', 'Vật lí hạt nhân',
// 'Dao động cơ', 'Sóng cơ', 'Điện xoay chiều', 'Sóng điện từ', 'Quang học', 'Lượng tử ánh sáng', ...
export type Topic = string;
export type QuestionLevel = 'Nhận biết' | 'Thông hiểu' | 'Vận dụng' | 'Vận dụng cao';
export type Part = 1 | 2 | 3;
export type Role = 'student' | 'admin';
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
    lastAssessmentDate?: any;
  };
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
  topic: Topic;
  level: QuestionLevel;
  content: string;
  options?: string[]; // For Part I & II
  correctAnswer: any; // Part I: index, Part II: boolean[], Part III: number
  explanation: string;
  status?: 'draft' | 'published'; // Trạng thái nháp/đã duyệt
  tags?: string[];
  // groupId: Đánh dấu câu kép Phần II dùng chung đề bài — cùng groupId = cùng cặp
  groupId?: string;
  // ═══ Cluster support: Câu hỏi chùm dùng chung ngữ cảnh ═══
  clusterId?: string;       // ID của cluster chứa câu này (nếu có)
  clusterOrder?: number;    // Thứ tự trong cluster (0, 1, 2...)
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
  questions: Question[];
  createdAt: any;
  createdBy: string;
  type: 'Matrix' | 'AI_Diagnosis' | 'Custom';
  targetStudentId?: string;
}

export interface Attempt {
  id: string;
  userId: string;
  testId: string;
  examId?: string; // Link to Exam if applicable
  answers: Record<string, any>;
  score: number;
  analysis?: {
    errorTracking: Record<string, string>;
    feedback: string;
    redZones: Topic[];
    remedialMatrix?: { topic: string; count: number }[];
    behavioralAnalysis: {
      carelessCount: number;
      fundamentalCount: number;
    };
  };
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
  html_code: string;
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
  deviceId: string;      // fingerprint thiết bị → phát hiện multi-device
  lastPing: any;         // Heartbeat timestamp → đếm online chính xác
}
