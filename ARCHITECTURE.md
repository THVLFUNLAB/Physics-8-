# 🏗️ ARCHITECTURE.md — Physics-8 Project Blueprint
> **Phiên bản:** 1.0 — Khởi tạo ngày 01/05/2026  
> **Mục đích:** Quy hoạch kiến trúc Module hóa để ngăn chặn Side-Effects khi nâng cấp tính năng.

---

## 📐 NGUYÊN TẮC CỐT LÕI (Core Rules)

| # | Quy tắc | Mô tả |
|---|---------|-------|
| 1 | **Isolation First** | Mỗi tính năng sống trong thư mục riêng. Lỗi ở đâu, sửa ở đó. |
| 2 | **No Global Mutation** | TUYỆT ĐỐI không sửa `App.tsx`, `firebase.ts`, `types.ts`, `index.css` trừ khi có yêu cầu và giải thích Impact. |
| 3 | **Impact Analysis Required** | Trước mọi thay đổi, phải khai báo: "File này ảnh hưởng đến Component nào?" |
| 4 | **Shared = Service/Hook** | Logic dùng chung phải đặt trong `services/` hoặc `hooks/`, KHÔNG copy-paste vào nhiều component. |
| 5 | **Stable Zone** | Mọi component đã chạy ổn định được đánh dấu `[STABLE]` và chỉ được đụng vào khi thực sự liên quan. |

---

## 🗂️ CẤU TRÚC THƯ MỤC (Directory Map)

```
Physics-8-/
├── src/
│   ├── App.tsx                   ⚠️ [GLOBAL — HẠN CHẾ CHỈNH SỬA]
│   ├── main.tsx                  ⚠️ [GLOBAL — HẠN CHẾ CHỈNH SỬA]
│   ├── firebase.ts               ⚠️ [GLOBAL — HẠN CHẾ CHỈNH SỬA]
│   ├── types.ts                  ⚠️ [GLOBAL — HẠN CHẾ CHỈNH SỬA]
│   ├── index.css                 ⚠️ [GLOBAL CSS — HẠN CHẾ CHỈNH SỬA]
│   │
│   ├── components/               📦 UI Components (Flat, từng file độc lập)
│   │   ├── common/               🔧 Shared micro-components
│   │   │   ├── index.tsx         (Toast, Modal primitives, v.v.)
│   │   │   └── SearchableYCCDDropdown.tsx
│   │   └── charts/               📊 Chart components
│   │
│   ├── modules/                  🧩 Feature Modules (Tự chứa hoàn toàn)
│   │   └── mindmap/              [STABLE] Mindmap feature
│   │       ├── MindmapContainer.tsx
│   │       ├── MindmapAdminPanel.tsx
│   │       ├── PhysicsNode.tsx
│   │       ├── NodeEditor.tsx
│   │       ├── mindmap.css       ← Scoped CSS riêng
│   │       ├── types.ts          ← Types riêng
│   │       ├── utils.ts          ← Utils riêng
│   │       └── useMindmapStore.ts← Store riêng
│   │
│   ├── services/                 🔌 Business Logic (Stateless, thuần hàm)
│   │   ├── geminiService.ts      [STABLE] AI API calls
│   │   ├── AdaptiveEngine.ts     [STABLE] Thuật toán học thích nghi
│   │   ├── examGeneratorService.ts
│   │   ├── examService.ts
│   │   ├── AzotaParser.ts
│   │   ├── DuplicateDetector.ts
│   │   ├── ExamWordExporter.ts
│   │   ├── RankSystem.ts
│   │   ├── profileUpdater.ts
│   │   └── yccdMatcher.ts
│   │
│   ├── hooks/                    🪝 React Hooks (Tái sử dụng logic có state)
│   │   ├── useAntiCheat.ts       [STABLE]
│   │   ├── useConnectionGuard.ts [STABLE]
│   │   ├── useDashboardStats.ts
│   │   ├── useEnergyBuffer.ts
│   │   ├── useOfflineAnswerVault.ts
│   │   └── useSubmitWithRetry.ts [STABLE]
│   │
│   ├── store/                    🗃️ Global State (Zustand stores)
│   │   ├── useAppStore.ts        [STABLE] App-wide UI state
│   │   ├── useAuthStore.ts       [STABLE] Auth & user profile
│   │   └── useExamStore.ts       [STABLE] Exam session state
│   │
│   ├── utils/                    🛠️ Pure Utility Functions
│   │   ├── clusterUtils.ts       [STABLE] Cluster question helpers
│   │   ├── clusterIntegrity.ts
│   │   ├── physicsTopics.ts      [STABLE] Chủ đề vật lý
│   │   ├── sanitizers.ts
│   │   ├── spacedRepetition.ts   [STABLE]
│   │   └── textUtils.ts
│   │
│   ├── layouts/                  🖼️ Page Layout Shell
│   │   ├── Navbar.tsx            [STABLE]
│   │   └── AppFooter.tsx         [STABLE]
│   │
│   ├── lib/                      📚 Third-party wrappers
│   │   ├── MathRenderer.tsx      [STABLE] KaTeX/MathJax wrapper
│   │   └── userUtils.ts
│   │
│   └── data/                     📋 Static Data
│       └── yccdData.ts           [STABLE] YCCD taxonomy data
```

---

## 🧩 DANH MỤC COMPONENT (Component Catalog)

### 🔐 Auth & Onboarding
| Component | File | Trạng thái | Mô tả |
|-----------|------|-----------|-------|
| AuthErrorBoundary | `AuthErrorBoundary.tsx` | [STABLE] | Bắt lỗi xác thực |
| StudentOnboardingModal | `StudentOnboardingModal.tsx` | [STABLE] | Modal chào mừng học sinh mới |
| InvitePage | `InvitePage.tsx` | [STABLE] | Trang mời người dùng |

### 🎓 Student Features
| Component | File | Trạng thái | Mô tả |
|-----------|------|-----------|-------|
| StudentDashboard | `StudentDashboard.tsx` | [STABLE] | Dashboard chính học sinh |
| ExamsList | `ExamsList.tsx` | [STABLE] | Danh sách đề thi (Accordion) |
| ProExamExperience | `ProExamExperience.tsx` | [STABLE] | Giao diện làm bài thi |
| ReviewExam | `ReviewExam.tsx` | [STABLE] | Xem lại bài thi |
| PersonalizedResultPanel | `PersonalizedResultPanel.tsx` | [STABLE] | Kết quả cá nhân hóa |
| ExamResultsModal | `ExamResultsModal.tsx` | [STABLE] | Modal kết quả thi |
| ExamResultGamification | `ExamResultGamification.tsx` | [STABLE] | Gamification điểm số |
| AdaptiveDashboard | `AdaptiveDashboard.tsx` | [STABLE] | Lộ trình học thích nghi |
| HistoryDashboard | `HistoryDashboard.tsx` | [STABLE] | Lịch sử làm bài |
| KnowledgeGapGallery | `KnowledgeGapGallery.tsx` | [STABLE] | Gallery điểm yếu kiến thức |
| UserRankCard | `UserRankCard.tsx` | [STABLE] | Card xếp hạng |
| GradeLeaderboard | `GradeLeaderboard.tsx` | [STABLE] | Bảng xếp hạng theo khối |

### 🎓 Grade-Specific Dashboards
| Component | File | Trạng thái | Mô tả |
|-----------|------|-----------|-------|
| Grade10Dashboard | `Grade10Dashboard.tsx` | [STABLE] | Dashboard lớp 10 |
| Grade11Dashboard | `Grade11Dashboard.tsx` | [STABLE] | Dashboard lớp 11 |
| Grade12Dashboard | `Grade12Dashboard.tsx` | [STABLE] | Dashboard lớp 12 |

### 👩‍🏫 Teacher / Admin Features
| Component | File | Trạng thái | Mô tả |
|-----------|------|-----------|-------|
| TeacherDashboard | `TeacherDashboard.tsx` | [STABLE] | Dashboard giáo viên |
| ClassManager | `ClassManager.tsx` | [STABLE] | Quản lý lớp học |
| ExamLibrary | `ExamLibrary.tsx` | [STABLE] | Thư viện đề thi (Admin) |
| ExamGenerator | `ExamGenerator.tsx` | [STABLE] | Tạo đề thi tự động |
| ExamMatrixGenerator | `ExamMatrixGenerator.tsx` | [STABLE] | Tạo ma trận đề |
| QuestionBank | `QuestionBank.tsx` | [STABLE] | Ngân hàng câu hỏi |
| QuestionReviewBoard | `QuestionReviewBoard.tsx` | [STABLE] | Duyệt câu hỏi |
| DigitizationDashboard | `DigitizationDashboard.tsx` | [STABLE] | Số hóa đề thi |
| DataSanitizer | `DataSanitizer.tsx` | [STABLE] | Làm sạch dữ liệu |
| DuplicateReviewHub | `DuplicateReviewHub.tsx` | [STABLE] | Phát hiện trùng lặp |
| StudentDirectory | `StudentDirectory.tsx` | [STABLE] | Danh bạ học sinh |
| AdminStudentProfile | `AdminStudentProfile.tsx` | [STABLE] | Hồ sơ học sinh (Admin) |
| StudentMicroProfiler | `StudentMicroProfiler.tsx` | [STABLE] | Phân tích chi tiết học sinh |
| MacroAnalyticsDashboard | `MacroAnalyticsDashboard.tsx` | [STABLE] | Phân tích vĩ mô |
| ReportHub | `ReportHub.tsx` | [STABLE] | Trung tâm báo cáo |
| AICampaignManager | `AICampaignManager.tsx` | [STABLE] | Quản lý chiến dịch AI |
| YCCDAutoTagger | `YCCDAutoTagger.tsx` | [STABLE] | Tự động gán YCCD |
| DatabaseMigrationTool | `DatabaseMigrationTool.tsx` | [STABLE] | Công cụ di chuyển DB |
| ScoreRecalibrationTool | `ScoreRecalibrationTool.tsx` | [STABLE] | Tái hiệu chỉnh điểm |
| OfflineDataEntry | `OfflineDataEntry.tsx` | [STABLE] | Nhập liệu offline |

### 🎮 Live Class & Interactive
| Component | File | Trạng thái | Mô tả |
|-----------|------|-----------|-------|
| LiveClassExam | `LiveClassExam.tsx` | [STABLE] | Thi trực tiếp trong lớp |
| ProjectorLeaderboard | `ProjectorLeaderboard.tsx` | [STABLE] | Bảng điểm máy chiếu |
| SimulationLab | `SimulationLab.tsx` | [STABLE] | Phòng thí nghiệm ảo |
| SimulationModal | `SimulationModal.tsx` | [STABLE] | Modal thí nghiệm |
| LabPlayer | `LabPlayer.tsx` | [STABLE] | Trình phát lab |
| PrintableExamView | `PrintableExamView.tsx` | [STABLE] | In đề thi |

### 🎨 UI / UX Components
| Component | File | Trạng thái | Mô tả |
|-----------|------|-----------|-------|
| Sidebar | `Sidebar.tsx` | [STABLE] | Thanh điều hướng |
| Toast | `Toast.tsx` | [STABLE] | Thông báo nhanh |
| LoadingSpinner | `LoadingSpinner.tsx` | [STABLE] | Vòng tải |
| SkeletonLoader | `SkeletonLoader.tsx` | [STABLE] | Skeleton loading |
| ConfettiCelebration | `ConfettiCelebration.tsx` | [STABLE] | Hiệu ứng ăn mừng |
| BackgroundMusic | `BackgroundMusic.tsx` | [STABLE] | Nhạc nền |
| InteractiveMascot | `InteractiveMascot.tsx` | [STABLE] | Mascot tương tác |
| VideoMascot | `VideoMascot.tsx` | [STABLE] | Mascot video |
| WelcomeMascot | `WelcomeMascot.tsx` | [STABLE] | Màn chào |
| MotivationalQuote | `MotivationalQuote.tsx` | [STABLE] | Câu trích dẫn |
| CountdownTimer | `CountdownTimer.tsx` | [STABLE] | Đồng hồ đếm ngược |
| NotificationCenter | `NotificationCenter.tsx` | [STABLE] | Trung tâm thông báo |
| ConnectionStatusBadge | `ConnectionStatusBadge.tsx` | [STABLE] | Badge kết nối |
| UpgradeModal | `UpgradeModal.tsx` | [STABLE] | Modal nâng cấp |
| ResetNoticeModal | `ResetNoticeModal.tsx` | [STABLE] | Modal thông báo reset |
| TeacherMessageModal | `TeacherMessageModal.tsx` | [STABLE] | Modal tin nhắn giáo viên |
| TopicCard | `TopicCard.tsx` | [STABLE] | Card chủ đề |
| StudentViewSimulator | `StudentViewSimulator.tsx` | [STABLE] | Giả lập góc nhìn học sinh |
| VipLinkGenerator | `VipLinkGenerator.tsx` | [STABLE] | Tạo link VIP |
| VoiceTutorButton | `VoiceTutorButton.tsx` | [STABLE] | Nút gia sư giọng nói |
| CapabilityRadarChart | `CapabilityRadarChart.tsx` | [STABLE] | Biểu đồ năng lực radar |
| CapacitorBar | `CapacitorBar.tsx` | [STABLE] | Thanh tụ điện |
| AIChatLogsDashboard | `AIChatLogsDashboard.tsx` | [STABLE] | Nhật ký chat AI |

### 🧩 Feature Modules (Self-Contained)
| Module | Thư mục | Trạng thái | Mô tả |
|--------|---------|-----------|-------|
| Mindmap | `modules/mindmap/` | [STABLE] | Sơ đồ tư duy vật lý |

---

## 🔄 LUỒNG DỮ LIỆU (Data Flow)

```
┌─────────────────────────────────────────────────────────┐
│                      firebase.ts                        │
│          (Firestore + Auth + Storage wrapper)           │
│                    ⚠️ GLOBAL LAYER                      │
└────────────┬───────────────────────┬────────────────────┘
             │                       │
             ▼                       ▼
    ┌─────────────────┐    ┌──────────────────────┐
    │   store/        │    │   services/           │
    │ useAuthStore    │    │ examService.ts        │
    │ useExamStore    │    │ geminiService.ts      │
    │ useAppStore     │    │ AdaptiveEngine.ts     │
    └────────┬────────┘    └──────────┬───────────┘
             │                        │
             ▼                        ▼
    ┌─────────────────────────────────────────────┐
    │                  hooks/                     │
    │  useSubmitWithRetry / useConnectionGuard    │
    │  useDashboardStats / useEnergyBuffer        │
    └────────────────────┬────────────────────────┘
                         │
                         ▼
    ┌─────────────────────────────────────────────┐
    │              components/                    │
    │  StudentDashboard / TeacherDashboard        │
    │  ProExamExperience / ExamsList / etc.       │
    └─────────────────────────────────────────────┘
```

**Luồng 1: Học sinh làm bài**
```
useAuthStore → ExamsList → ProExamExperience 
  → useSubmitWithRetry → examService → firebase
  → PersonalizedResultPanel ← AdaptiveEngine
```

**Luồng 2: Giáo viên quản lý**
```
useAuthStore → TeacherDashboard → ExamLibrary / QuestionBank
  → examGeneratorService / AzotaParser
  → firebase.ts (write)
```

**Luồng 3: AI Analysis**
```
geminiService ← (ProExamExperience / AdaptiveDashboard)
  → AdaptiveEngine → profileUpdater → firebase (userProfiles)
```

---

## 🌐 FILE CSS & CONFIG DÙNG CHUNG (Shared Resources)

| File | Loại | Mô tả | Quy tắc |
|------|------|-------|---------|
| `src/index.css` | Global CSS | CSS tokens, reset, typography | ⚠️ Chỉ thêm design tokens. KHÔNG thêm component styles. |
| `src/modules/mindmap/mindmap.css` | Scoped CSS | CSS riêng của Mindmap | ✅ Chỉ mindmap dùng |
| `src/firebase.ts` | Config + SDK | Firebase init + wrappers | ⚠️ KHÔNG sửa trừ khi thêm collection mới |
| `src/types.ts` | TypeScript | Shared types/interfaces | ⚠️ Chỉ thêm, KHÔNG sửa type đang dùng |
| `.env` | Config | API keys, project IDs | 🔒 KHÔNG commit |
| `vite.config.ts` | Build Config | Vite setup | ⚠️ Chỉ sửa khi có lý do build |

---

## 🛡️ VÙNG BẢO MẬT (Protected Zones)

Các file/thư mục sau ĐÃ ổn định và **KHÔNG ĐƯỢC đụng tới** nếu không có yêu cầu trực tiếp:

```
🔒 PROTECTED FILES:
  src/App.tsx                       ← Routing & global state orchestration
  src/firebase.ts                   ← Database layer
  src/types.ts                      ← Type contracts
  src/store/useAuthStore.ts         ← Auth state
  src/store/useExamStore.ts         ← Exam session state
  src/hooks/useSubmitWithRetry.ts   ← Submission logic
  src/hooks/useConnectionGuard.ts   ← Connection management
  src/utils/clusterUtils.ts         ← Cluster question logic
  src/utils/spacedRepetition.ts     ← Learning algorithm
  src/data/yccdData.ts              ← YCCD taxonomy
  src/modules/mindmap/              ← Toàn bộ module mindmap
```

---

## 📋 GIAO THỨC SỬA LỖI AN TOÀN (Safe Update Protocol)

### Trước khi sửa bất kỳ file nào, trả lời 3 câu hỏi:

```
1. FILE NÀY THUỘC VÙNG NÀO?
   → Global Layer: Cần justification rõ ràng
   → Component Layer: Ưu tiên sửa trong file đó
   → Module Layer: Sửa trong thư mục module

2. CÓ FILE NÀO IMPORT FILE NÀY KHÔNG?
   → Nếu có: Phải kiểm tra compatibility sau khi sửa
   → Nếu không: Có thể sửa tự do hơn

3. LOGIC CÓ ĐƯỢC DÙNG Ở NHIỀU CHỖ KHÔNG?
   → Nếu có: Phải tách thành service/hook
   → Nếu không: Có thể giữ trong component
```

### Quy trình nâng cấp tính năng mới:

```
[1] Tạo thư mục mới trong modules/ nếu là feature lớn
      ví dụ: src/modules/pdf-export/

[2] Tạo các file con:
      - ComponentName.tsx   (UI)
      - componentName.css   (Scoped CSS)
      - types.ts            (Types riêng)
      - service.ts          (Business logic)
      - useComponentHook.ts (State/side effects)

[3] Chỉ kết nối vào App.tsx/Global khi component hoàn thiện

[4] Báo cáo Impact Analysis trước khi merge
```

---

## 📊 TRẠNG THÁI DỰ ÁN HIỆN TẠI

| Layer | Files | Trạng thái |
|-------|-------|-----------|
| Global | App.tsx (84KB), firebase.ts, types.ts | ⚠️ Cần giảm tải App.tsx |
| Components | 68 components (flat) | ⚠️ Cần nhóm vào modules/ dần dần |
| Modules | mindmap/ (hoàn chỉnh) | ✅ Đây là mẫu chuẩn |
| Services | 14 services | ✅ Tốt |
| Hooks | 6 hooks | ✅ Tốt |
| Store | 3 stores (Zustand) | ✅ Tốt |
| Utils | 8 utils | ✅ Tốt |

### 🎯 Ưu tiên Module hóa tiếp theo:

```
Priority 1 (Cao): Nhóm components thành feature modules
  → modules/exam-experience/   (ProExamExperience, ReviewExam, ExamResultsModal)
  → modules/admin-tools/       (DataSanitizer, DuplicateReviewHub, DatabaseMigrationTool)
  → modules/student-dashboard/ (StudentDashboard, AdaptiveDashboard, HistoryDashboard)

Priority 2 (Trung bình): Giảm tải App.tsx
  → Tách routing logic ra AppRouter.tsx
  → Tách global handlers ra AppHandlers.ts

Priority 3 (Thấp): Scoped CSS
  → Tạo *.module.css cho các component lớn (>20KB)
```

---

*Tài liệu này phải được cập nhật mỗi khi thêm component/module mới.*  
*Người sửa cuối: Antigravity AI — 01/05/2026*
