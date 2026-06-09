"use client";

import { createContext, useContext } from "react";

export type AuthProfile = {
  name: string;
  email: string;
  role: string;
  status: string;
  userId?: string;
  isDevBypass?: boolean;
};

export type AuthContextValue = {
  profile: AuthProfile | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  profile: null,
  loading: true,
  isAuthenticated: false,
  isAdmin: false,
  signOut: async () => {},
});

export function AuthProvider({
  value,
  children,
}: {
  value: AuthContextValue;
  children: React.ReactNode;
}) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useCurrentAuth() {
  return useContext(AuthContext);
}
