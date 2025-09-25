'use client';

import { createContext, useContext, type ReactNode } from 'react';

export interface AuthUser {
  id: string;
  email?: string | null;
  name?: string | null;
  [key: string]: unknown;
}

export type AuthSession = {
  user?: AuthUser | null;
  [key: string]: unknown;
} | null;

export interface AuthEmailSignInInput {
  email: string;
  password: string;
  callbackURL?: string;
  [key: string]: unknown;
}

export interface AuthEmailSignUpInput extends AuthEmailSignInInput {
  name: string;
}

export interface AuthClientLike {
  useSession: () => { data: AuthSession; isPending: boolean };
  signIn: {
    email: (input: AuthEmailSignInInput) => Promise<unknown> | unknown;
  };
  signUp: {
    email: (input: AuthEmailSignUpInput) => Promise<unknown> | unknown;
  };
}

interface AuthContextValue {
  session: AuthSession;
  isLoading: boolean;
  authClient: AuthClientLike;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export interface AuthProviderProps {
  authClient: AuthClientLike;
  children: ReactNode;
}

export function AuthProvider({ authClient, children }: AuthProviderProps) {
  const { data: session, isPending: isLoading } = authClient.useSession();

  const value: AuthContextValue = {
    session,
    isLoading,
    authClient,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function useAuthClient() {
  return useAuth().authClient;
}

export function useAuthSession() {
  const { session, isLoading } = useAuth();
  return { session, isLoading };
}
