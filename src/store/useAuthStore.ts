import { create } from 'zustand';
import { UserProfile, Attempt } from '../types';

interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  authError: string | null;
  attempts: Attempt[];

  setUser: (user: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setAuthError: (error: string | null) => void;
  setAttempts: (attempts: Attempt[]) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  authError: null,
  attempts: [],

  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  setAuthError: (authError) => set({ authError }),
  setAttempts: (attempts) => set({ attempts }),
}));
