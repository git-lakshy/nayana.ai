"use client";

// Auth context: resolves the caller identity on mount, exposes login /
// register / logout / guest helpers plus plan-based feature gating.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, setAccessToken } from "./api";
import type {
  AuthResponse,
  AuthUser,
  GuestStatus,
  Identity,
} from "./types";

interface AuthState {
  loading: boolean;
  identity: Identity | null;
  user: AuthUser | null;
  orgSlug: string | null;
  orgPlan: string | null;
  isGuest: boolean;
  isAuthenticated: boolean;
  features: Set<string>;
  hasFeature: (feature: string) => boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    name?: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshIdentity: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [orgPlan, setOrgPlan] = useState<string | null>(null);

  const refreshIdentity = useCallback(async () => {
    try {
      const me = await api.get<Identity>("/api/auth/me");
      setIdentity(me);
    } catch {
      setIdentity(null);
    }
  }, []);

  // On mount: try to restore a session from the refresh cookie, then load identity.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.post<{
          access_token: string;
          refresh_token: string;
        }>("/api/auth/refresh", {});
        if (!cancelled && data.access_token) {
          setAccessToken(data.access_token);
        }
      } catch {
        // No active session — visitor continues as guest.
      }
      if (!cancelled) {
        await refreshIdentity();
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshIdentity]);

  const applyAuthResponse = useCallback(
    async (data: AuthResponse) => {
      setAccessToken(data.access_token);
      setUser(data.user);
      setOrgSlug(data.org?.slug ?? null);
      setOrgPlan(data.org?.plan ?? null);
      await refreshIdentity();
    },
    [refreshIdentity]
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await api.post<AuthResponse>("/api/auth/login", {
        email,
        password,
      });
      await applyAuthResponse(data);
    },
    [applyAuthResponse]
  );

  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      // Claim the current guest session so prior scans become the user's.
      const guestToken = readCookie("nayana_guest");
      const data = await api.post<AuthResponse>("/api/auth/register", {
        email,
        password,
        name: name || undefined,
        guest_token: guestToken || undefined,
      });
      await applyAuthResponse(data);
    },
    [applyAuthResponse]
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout", {});
    } finally {
      setAccessToken(null);
      setUser(null);
      setOrgSlug(null);
      setOrgPlan(null);
      await refreshIdentity();
    }
  }, [refreshIdentity]);

  const features = useMemo<Set<string>>(
    () => new Set(identity?.features ?? []),
    [identity]
  );

  const hasFeature = useCallback(
    (feature: string) => features.has(feature),
    [features]
  );

  const value: AuthState = {
    loading,
    identity,
    user,
    orgSlug,
    orgPlan,
    isGuest: identity?.is_guest ?? true,
    isAuthenticated:
      !!identity && (identity.kind === "user" || identity.kind === "api_key"),
    features,
    hasFeature,
    login,
    register,
    logout,
    refreshIdentity,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

// Guest quota helper used by the scan counter UI.
export async function fetchGuestStatus(): Promise<GuestStatus> {
  return api.get<GuestStatus>("/api/guest/status");
}
