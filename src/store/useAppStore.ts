import { create } from 'zustand';
import { SidebarTab, Simulation } from '../types';

interface AppState {
  isSidebarCollapsed: boolean;
  isMobileMenuOpen: boolean;
  soundEnabled: boolean;
  
  // Navigation
  activeView: SidebarTab;
  adminTab: 'Digitize' | 'Bank' | 'Matrix' | 'Generator' | 'SimLab' | 'Duplicates' | 'Sanitizer' | 'Reports' | 'Classroom' | 'Directory' | 'Library' | 'Tracking' | 'Campaign' | 'YCCD' | 'Migration' | 'AIChats' | 'RecalibScore';
  
  // Modals & Overlays
  showUpgradeModal: boolean;
  showVirtualLab: boolean;
  showConfetti: boolean;
  
  // Magic Link token
  inviteToken: string | null;
  
  // Simulations (Global Data)
  simulations: Simulation[];
  activeSimulationViewer: Simulation | null;
  activeSimulation: { title: string; description: string; url: string } | null;

  // Actions
  setIsSidebarCollapsed: (val: boolean) => void;
  setIsMobileMenuOpen: (val: boolean) => void;
  setSoundEnabled: (val: boolean) => void;
  setActiveView: (view: SidebarTab) => void;
  setAdminTab: (tab: any) => void;
  setShowUpgradeModal: (val: boolean) => void;
  setShowVirtualLab: (val: boolean) => void;
  setShowConfetti: (val: boolean) => void;
  setInviteToken: (token: string | null) => void;
  setSimulations: (sims: Simulation[]) => void;
  setActiveSimulationViewer: (sim: Simulation | null) => void;
  setActiveSimulation: (sim: { title: string; description: string; url: string } | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isSidebarCollapsed: false,
  isMobileMenuOpen: false,
  soundEnabled: true,
  
  activeView: 'dashboard',
  adminTab: 'Digitize',
  
  showUpgradeModal: false,
  showVirtualLab: false,
  showConfetti: false,
  
  inviteToken: new URLSearchParams(window.location.search).get('invite') || null,
  
  simulations: [],
  activeSimulationViewer: null,
  activeSimulation: null,

  setIsSidebarCollapsed: (val) => set({ isSidebarCollapsed: val }),
  setIsMobileMenuOpen: (val) => set({ isMobileMenuOpen: val }),
  setSoundEnabled: (val) => set({ soundEnabled: val }),
  setActiveView: (val) => set({ activeView: val }),
  setAdminTab: (val) => set({ adminTab: val }),
  setShowUpgradeModal: (val) => set({ showUpgradeModal: val }),
  setShowVirtualLab: (val) => set({ showVirtualLab: val }),
  setShowConfetti: (val) => set({ showConfetti: val }),
  setInviteToken: (val) => set({ inviteToken: val }),
  setSimulations: (val) => set({ simulations: val }),
  setActiveSimulationViewer: (val) => set({ activeSimulationViewer: val }),
  setActiveSimulation: (val) => set({ activeSimulation: val }),
}));
