import { create } from 'zustand';
import { UserProfile, Attempt, AppNotification } from '../types';

interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  authError: string | null;
  attempts: Attempt[];

  setUser: (user: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setAuthError: (error: string | null) => void;
  setAttempts: (attempts: Attempt[]) => void;

  // ── Khởi động listener Firebase Auth — gọi 1 lần duy nhất ở App.tsx ──
  initializeAuth: () => () => void;
}

// Giữ unsubscribe refs ngoài store để tránh lưu functions vào Zustand state
let _uSub: (() => void) | null = null;
let _aSub: (() => void) | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  authError: null,
  attempts: [],

  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  setAuthError: (authError) => set({ authError }),
  setAttempts: (attempts) => set({ attempts }),

  initializeAuth: () => {
    // Dynamic import để tránh vòng dependency cycle
    const runListener = async () => {
      const {
        auth, db, collection, doc, addDoc, getDoc, getDocFromCache,
        setDoc, onSnapshot, query, where, Timestamp, onAuthStateChanged,
      } = await import('../firebase');

      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        try {
          if (firebaseUser) {
            const ADMIN_EMAILS = ['haunn.vietanhschool@gmail.com', 'thayhauvatly@gmail.com'];
            const isAdmin = ADMIN_EMAILS.includes(firebaseUser.email ?? '');

            // Lấy user doc (thử server → cache → tạo ảo)
            let userDoc: any;
            try {
              userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
            } catch (fetchErr: any) {
              console.warn('[Auth] Lỗi lấy user từ server, thử cache...', fetchErr);
              try {
                userDoc = await getDocFromCache(doc(db, 'users', firebaseUser.uid));
              } catch (cacheErr) {
                console.warn('[Auth] Cache rỗng, tạo dữ liệu tạm:', cacheErr);
                userDoc = { exists: () => false, data: () => undefined };
              }
            }

            const today = new Date().toISOString().slice(0, 10);

            const calcStreak = (prevStreak?: number, lastDate?: string): { streak: number; lastStreakDate: string } => {
              if (!lastDate) return { streak: 1, lastStreakDate: today };
              if (lastDate === today) return { streak: prevStreak || 1, lastStreakDate: today };
              const yesterday = new Date();
              yesterday.setDate(yesterday.getDate() - 1);
              const yesterdayStr = yesterday.toISOString().slice(0, 10);
              if (lastDate === yesterdayStr) return { streak: (prevStreak || 0) + 1, lastStreakDate: today };
              return { streak: 1, lastStreakDate: today };
            };

            let currentUserData: UserProfile;

            if (userDoc.exists()) {
              currentUserData = userDoc.data() as UserProfile;
              if (firebaseUser.photoURL && currentUserData.photoURL !== firebaseUser.photoURL) {
                currentUserData.photoURL = firebaseUser.photoURL;
              }
              if (isAdmin && currentUserData.role !== 'admin') {
                currentUserData.role = 'admin';
              }
              const { streak, lastStreakDate } = calcStreak(currentUserData.streak, currentUserData.lastStreakDate);
              currentUserData.streak = streak;
              currentUserData.lastStreakDate = lastStreakDate;
              currentUserData.lastActive = Timestamp.now();
              try {
                await setDoc(doc(db, 'users', firebaseUser.uid), {
                  role: currentUserData.role,
                  photoURL: currentUserData.photoURL || null,
                  streak,
                  lastStreakDate,
                  lastActive: Timestamp.now(),
                }, { merge: true });
              } catch (writeErr) {
                console.warn('[Auth] Không thể cập nhật streak:', writeErr);
              }
            } else {
              currentUserData = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                displayName: firebaseUser.displayName || 'Học sinh',
                photoURL: firebaseUser.photoURL || undefined,
                role: isAdmin ? 'admin' : 'student',
                targetGroup: 'Chống Sai Ngu',
                redZones: [],
                createdAt: Timestamp.now(),
                lastActive: Timestamp.now(),
                streak: 1,
                lastStreakDate: today,
                usedAttempts: 0,
                maxAttempts: 30,
                learningPath: {
                  completedTopics: [],
                  topicProgress: {},
                  overallProgress: 0,
                  weaknesses: [],
                },
              };
              try {
                await setDoc(doc(db, 'users', firebaseUser.uid), currentUserData);
              } catch (writeErr) {
                console.warn('[Auth] Không thể tạo user mới:', writeErr);
              }
            }

            // ── Ghi LoginLog ──
            try {
              await addDoc(collection(db, 'loginLogs'), {
                userId: firebaseUser.uid,
                email: firebaseUser.email || '',
                displayName: firebaseUser.displayName || '',
                timestamp: Timestamp.now(),
                userAgent: navigator.userAgent,
                action: 'login',
              });
            } catch (e) {
              console.warn('[Auth] Không ghi được login log:', e);
            }

            // ✅ ĐÂY là điểm then chốt: cập nhật useAuthStore — ProExam sẽ thấy ngay
            set({ user: currentUserData, loading: false });

            // ── Session restore (dùng examStore để không circular) ──
            try {
              const { useExamStore } = await import('./useExamStore');
              const examState = useExamStore.getState();
              if (!examState.activeTest) {
                examState.restoreExamSession();
              }
            } catch (e) { /* bỏ qua nếu lỗi */ }

            // Real-time user profile snapshot
            if (_uSub) _uSub();
            _uSub = onSnapshot(doc(db, 'users', firebaseUser.uid), (snap) => {
              if (snap.exists()) {
                set({ user: snap.data() as UserProfile });
              }
            });

            // Real-time attempts snapshot + daily reminder
            if (_aSub) _aSub();
            const aQuery = query(collection(db, 'attempts'), where('userId', '==', firebaseUser.uid));
            _aSub = onSnapshot(aQuery, async (snap) => {
              const sortedAttempts = snap.docs
                .map(d => ({ id: d.id, ...d.data() } as Attempt))
                .sort((a, b) => (b.timestamp?.seconds ?? 0) - (a.timestamp?.seconds ?? 0));
              set({ attempts: sortedAttempts });

              // Daily reminder
              const todayStr = new Date().toDateString();
              const lastAttemptDate = sortedAttempts[0]?.timestamp?.toDate().toDateString();
              try {
                const userSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
                const latestUser = userSnap.data() as UserProfile;
                if (
                  lastAttemptDate !== todayStr &&
                  !latestUser.notifications?.find(
                    (n) => n.title === 'Nhắc nhở hàng ngày' && n.timestamp.toDate().toDateString() === todayStr
                  )
                ) {
                  const reminder: AppNotification = {
                    id: 'daily_' + Date.now(),
                    title: 'Nhắc nhở hàng ngày',
                    message: 'Hôm nay em chưa uống thuốc Vật lý đâu nhé! Hãy làm một đề để duy trì phong độ.',
                    type: 'warning',
                    read: false,
                    timestamp: Timestamp.now(),
                  };
                  const updatedNotifications = [reminder, ...(latestUser.notifications || [])].slice(0, 20);
                  await setDoc(doc(db, 'users', firebaseUser.uid), { notifications: updatedNotifications }, { merge: true });
                }
              } catch (err) {
                console.warn('[Auth] Không thể gửi daily reminder:', err);
              }
            });

          } else {
            // Đăng xuất
            set({ user: null, attempts: [], loading: false });
            if (_uSub) { _uSub(); _uSub = null; }
            if (_aSub) { _aSub(); _aSub = null; }
          }
        } catch (err: any) {
          console.error('[Auth] Auth State Error:', err);
          if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota')) {
            set({ authError: 'Server đang quá tải tạm thời. Bạn đang xem chế độ Offline từ bộ nhớ đệm.', loading: false });
          } else {
            set({ authError: `Lỗi đồng bộ dữ liệu: ${err?.message || 'Không xác định'}`, user: null, loading: false });
          }
        }
      });

      return unsubscribe;
    };

    // Chạy async, trả về cleanup function đồng bộ
    let cleanupFn: (() => void) | null = null;
    runListener().then((unsub) => { cleanupFn = unsub; });

    return () => {
      if (cleanupFn) cleanupFn();
      if (_uSub) { _uSub(); _uSub = null; }
      if (_aSub) { _aSub(); _aSub = null; }
    };
  },
}));
