"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { AuthProvider } from "@/components/AuthContext";
import type { AuthProfile } from "@/components/AuthContext";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type UserRow = {
  user_id?: string;
  userId?: string;
  auth_user_id?: string;
  authUserId?: string;
  name?: string;
  userName?: string;
  email?: string;
  role?: string;
  member_type?: string;
  memberType?: string;
  status?: string;
};

const PUBLIC_PATH_PREFIXES = ["/login", "/experience-consent"];

function text(value: unknown, fallback = "") {
  const raw = String(value ?? "").trim();
  return raw || fallback;
}

function isPublicPath(pathname: string) {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isDevBypassEnabled() {
  return process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true";
}

function normalizeRole(value: unknown) {
  const raw = text(value).replace(/\s/g, "").toLowerCase();
  if (raw === "관리자" || raw === "admin" || raw === "administrator" || raw === "master") return "admin";
  if (raw === "교관" || raw === "교관회원" || raw === "instructor" || raw.includes("instructor")) return "instructor";
  if (raw === "교육생" || raw === "학생" || raw === "학생회원" || raw === "student" || raw.includes("교육")) return "student";
  if (raw === "렌탈기장" || raw === "렌탈회원" || raw === "rental" || raw === "rental_pilot" || raw === "rental-pilot" || raw.includes("렌탈")) return "rental_pilot";
  return raw;
}

function isApprovedStatus(value: unknown) {
  const raw = text(value);
  const lower = raw.toLowerCase();
  if (!raw) return true;
  return (
    raw === "활성" ||
    raw === "정상" ||
    raw === "승인완료" ||
    raw === "승인" ||
    raw === "근무중" ||
    raw === "사용" ||
    raw === "활동" ||
    raw === "활동중" ||
    lower === "active" ||
    lower === "approved" ||
    lower === "enabled" ||
    lower === "working"
  );
}

function buildDevProfile(): AuthProfile {
  return {
    name: text(process.env.NEXT_PUBLIC_DEV_USER_NAME, "개발관리자"),
    email: "dev-admin@skynuri.local",
    role: text(process.env.NEXT_PUBLIC_DEV_ROLE, "admin"),
    status: "개발모드",
    isDevBypass: true,
  };
}

function profileFromAuthUser(user: User): AuthProfile {
  const metadata = user.user_metadata || {};
  return {
    name: text(metadata.name || metadata.full_name || user.email, "사용자"),
    email: text(user.email),
    role: text(metadata.role),
    status: "로그인",
    userId: text(user.id),
  };
}

function profileFromUserRow(row: UserRow, fallback: AuthProfile): AuthProfile {
  return {
    name: text(row.name || row.userName, fallback.name),
    email: text(row.email, fallback.email),
    role: text(row.role || row.member_type || row.memberType, fallback.role),
    status: text(row.status, fallback.status),
    userId: text(row.user_id || row.userId, fallback.userId),
  };
}

async function loadProfileByAuthUser(user: User, fallback: AuthProfile): Promise<AuthProfile> {
  try {
    const response = await fetch("/api/users", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    const rows = Array.isArray(data.users) ? data.users : Array.isArray(data?.data?.users) ? data.data.users : [];
    const authUserId = text(user.id);
    const email = text(user.email).toLowerCase();
    const matched = rows.find((row: UserRow) => text(row.auth_user_id || row.authUserId) === authUserId) ||
      rows.find((row: UserRow) => text(row.email).toLowerCase() === email);
    if (!matched) return fallback;
    return profileFromUserRow(matched, fallback);
  } catch {
    return fallback;
  }
}

export default function AuthFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const publicPath = isPublicPath(pathname);
  const devBypass = isDevBypassEnabled();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const supabase = useMemo(() => (devBypass ? null : getSupabaseBrowserClient()), [devBypass]);

  const resolveUser = useCallback(async (user: User | null) => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const fallback = profileFromAuthUser(user);
    const resolved = await loadProfileByAuthUser(user, fallback);
    setProfile(resolved);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (devBypass) {
      setProfile(buildDevProfile());
      setLoading(false);
      return;
    }

    if (publicPath) {
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);

    supabase?.auth.getSession().then(async ({ data }) => {
      if (!alive) return;

      let session = data.session;
      for (let attempt = 0; !session && attempt < 8; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        if (!alive) return;
        const retry = await supabase.auth.getSession();
        session = retry.data.session;
      }

      if (!alive) return;
      await resolveUser(session?.user ?? null);
    });

    const { data: listener } = supabase?.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      void resolveUser(session?.user ?? null);
    }) ?? { data: null };

    return () => {
      alive = false;
      listener?.subscription?.unsubscribe();
    };
  }, [devBypass, publicPath, resolveUser, supabase]);

  useEffect(() => {
    if (publicPath || loading || profile) return;
    router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, pathname, profile, publicPath, router]);

  const signOut = useCallback(async () => {
    if (!devBypass) {
      await supabase?.auth.signOut();
    }
    setProfile(null);
    router.replace("/login");
  }, [devBypass, router, supabase]);

  const role = normalizeRole(profile?.role);
  const isApproved = Boolean(profile) && isApprovedStatus(profile?.status);
  const isAdmin = Boolean(profile) && role === "admin" && isApproved;
  const isInstructor = Boolean(profile) && role === "instructor" && isApproved;
  const canAccessApp = isAdmin || isInstructor;
  const contextValue = useMemo(() => ({
    profile,
    loading,
    isAuthenticated: Boolean(profile),
    isAdmin,
    signOut,
  }), [isAdmin, loading, profile, signOut]);

  if (publicPath) {
    return (
      <AuthProvider value={contextValue}>
        <main className="min-h-screen bg-[#f6f8fb]">{children}</main>
      </AuthProvider>
    );
  }

  if (loading || (!profile && !devBypass)) {
    return (
      <AuthProvider value={contextValue}>
        <main className="flex min-h-screen items-center justify-center bg-[#f6f8fb] px-6">
          <div className="rounded-3xl border border-blue-100 bg-white px-8 py-7 text-center shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
            <p className="text-[13px] font-semibold tracking-[0.16em] text-blue-400">SKYNURI</p>
            <p className="mt-3 text-[15px] font-medium text-slate-700">로그인 상태를 확인하고 있습니다.</p>
          </div>
        </main>
      </AuthProvider>
    );
  }

  if (!canAccessApp) {
    return (
      <AuthProvider value={contextValue}>
        <main className="flex min-h-screen items-center justify-center bg-[#f6f8fb] px-6">
          <section className="w-full max-w-md rounded-[32px] border border-rose-100 bg-white p-8 text-center shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
            <p className="text-[13px] font-semibold tracking-[0.16em] text-rose-400">ACCESS DENIED</p>
            <h1 className="mt-3 text-[24px] font-semibold tracking-[-0.04em] text-slate-950">관리자 또는 교관 권한이 필요합니다</h1>
            <p className="mt-3 text-[14px] leading-6 text-slate-500">
              현재 로그인 계정은 관리자 프로그램에 접근할 수 없습니다. 회원관리에서 해당 이메일의 역할을 관리자 또는 교관으로 설정해주세요.
            </p>
            <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-left text-[13px] text-slate-600">
              <p>이름: {profile?.name || "-"}</p>
              <p>이메일: {profile?.email || "-"}</p>
              <p>역할: {profile?.role || "미지정"}</p>
              <p>상태: {profile?.status || "미지정"}</p>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="mt-6 w-full rounded-2xl bg-slate-900 px-4 py-3 text-[15px] font-semibold text-white transition hover:bg-slate-800"
            >
              로그아웃
            </button>
          </section>
        </main>
      </AuthProvider>
    );
  }

  return (
    <AuthProvider value={contextValue}>
      <div className="flex min-h-screen bg-transparent">
        <Sidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </AuthProvider>
  );
}
