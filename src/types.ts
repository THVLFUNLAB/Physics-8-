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
  role: Role;
  targetGroup?: TargetGroup;
  redZones?: Topic[];
  prescriptions?: Prescription[];
  badges?: Badge[];
  notifications?: AppNotification[];
  behavioralSummary?: {
    careless: number; // Lỗi kỹ thuật/kỹ năng
    fundamental: number; // Lỗi bản chất
  };
  createdAt: any;
}

export interface Question {
  id?: string;
  part: Part;
  topic: Topic;
  level: QuestionLevel;
  content: string;
  options?: string[]; // For Part I
  correctAnswer: any; // Part I: index, Part II: boolean[], Part III: number
  explanation: string;
  tags?: string[];
  resources?: {
    title: string;
    url: string;
    type: 'video' | 'document';
  }[];
  simulationUrl?: string;
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
  analysis: {
    errorTracking: Record<string, 'Lỗi hiểu sai bản chất' | 'Lỗi kỹ năng' | 'Lỗi kỹ thuật'>;
    feedback: string;
    redZones: Topic[];
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
