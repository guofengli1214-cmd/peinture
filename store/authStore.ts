import { create } from "zustand";
import { PublicUser } from "../types";
import { login as loginApi, logout as logoutApi, fetchMe } from "../services/authService";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

export interface AuthState {
  user: PublicUser | null;
  /**
   * "loading"  — initial session check in flight (show a spinner)
   * "authenticated" — a valid session exists
   * "anonymous" — no session; show the login screen
   */
  status: AuthStatus;

  /** Resolve the current session on app boot. */
  checkSession: () => Promise<void>;
  /** Log in; rethrows on failure so the caller can surface the error. */
  login: (username: string, password: string) => Promise<void>;
  /** Log out and return to the anonymous state. */
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  status: "loading",

  checkSession: async () => {
    const user = await fetchMe();
    set(user ? { user, status: "authenticated" } : { user: null, status: "anonymous" });
  },

  login: async (username, password) => {
    const user = await loginApi(username, password);
    set({ user, status: "authenticated" });
  },

  logout: async () => {
    try {
      await logoutApi();
    } finally {
      set({ user: null, status: "anonymous" });
    }
  },
}));
