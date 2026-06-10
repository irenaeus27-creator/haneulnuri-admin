"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

declare global {
  // Next.js 개발 모드의 Fast Refresh/HMR 과정에서도 브라우저 Supabase client를 1개만 유지합니다.
  // eslint-disable-next-line no-var
  var __skynuriSupabaseBrowserClient: SupabaseClient | undefined;
}

export function getSupabaseBrowserClient() {
  if (!SUPABASE_URL) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL 환경변수가 설정되어 있지 않습니다.");
  }

  if (!SUPABASE_ANON_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY 환경변수가 설정되어 있지 않습니다.");
  }

  if (globalThis.__skynuriSupabaseBrowserClient) {
    return globalThis.__skynuriSupabaseBrowserClient;
  }

  globalThis.__skynuriSupabaseBrowserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "sb-sky-nuri-admin-auth-token",
    },
  });

  return globalThis.__skynuriSupabaseBrowserClient;
}
