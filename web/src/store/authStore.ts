import { create } from 'zustand';
import type { UserProfile } from '../types';

interface AuthState {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;

  login: (user: UserProfile, token: string) => void;
  logout: () => void;
  updateUserName: (userName: string) => void;
}

const getStoredToken = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('rethink_auth_token');
};

const getStoredUser = (): UserProfile | null => {
  if (typeof window === 'undefined') return null;
  const u = localStorage.getItem('rethink_auth_user');
  try {
    return u ? JSON.parse(u) : null;
  } catch {
    return null;
  }
};

export const useAuthStore = create<AuthState>((set) => {
  const initialToken = getStoredToken();
  const initialUser = getStoredUser();

  return {
    user: initialUser,
    token: initialToken,
    isAuthenticated: !!initialToken,

    login: (user, token) => {
      localStorage.setItem('rethink_auth_token', token);
      localStorage.setItem('rethink_auth_user', JSON.stringify(user));
      set({ user, token, isAuthenticated: true });
    },

    logout: () => {
      localStorage.removeItem('rethink_auth_token');
      localStorage.removeItem('rethink_auth_user');
      set({ user: null, token: null, isAuthenticated: false });
    },

    updateUserName: (userName: string) => {
      set((state) => {
        if (!state.user) return state;
        const updated = { ...state.user, userName };
        localStorage.setItem('rethink_auth_user', JSON.stringify(updated));
        return { user: updated };
      });
    },
  };
});
