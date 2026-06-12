"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

async function waitForAuthSession(supabase: ReturnType<typeof getSupabaseBrowserClient>) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  return null;
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";
  const devBypass = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setMessage("이메일과 비밀번호를 입력해주세요.");
      return;
    }

    setSubmitting(true);
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      setSubmitting(false);
      setMessage("로그인에 실패했습니다. 이메일과 비밀번호를 확인해주세요.");
      return;
    }

    const session = data.session || await waitForAuthSession(supabase);
    if (!session) {
      setSubmitting(false);
      setMessage("로그인 세션을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    router.replace(nextPath);
    router.refresh();
  }

  function moveDevMode() {
    router.replace(nextPath);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,#dbeafe_0%,transparent_32%),linear-gradient(180deg,#f8fbff_0%,#eef4fb_100%)] px-5 py-10">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-[36px] border border-white/70 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.12)] md:grid-cols-[1.05fr_0.95fr]">
        <div className="relative hidden min-h-[560px] overflow-hidden bg-[linear-gradient(135deg,#0f2d5c_0%,#1d65c1_55%,#7dd3fc_100%)] p-10 text-white md:block">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/15 blur-2xl" />
          <div className="absolute -bottom-28 -left-16 h-72 w-72 rounded-full bg-sky-200/20 blur-2xl" />
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div>
              <p className="text-[13px] font-semibold tracking-[0.32em] text-sky-100">SKYNURI</p>
              <h1 className="mt-5 text-[34px] font-semibold leading-tight tracking-[-0.05em]">
                하늘누리 비행교육원<br />운영 관리 시스템
              </h1>
              <p className="mt-5 max-w-sm text-[15px] leading-7 text-blue-50/90">
                예약, 교육생, 비행기록, 항공기, 교관 관리를 하나의 관리자 계정으로 안전하게 운영합니다.
              </p>
            </div>

            <div className="rounded-[28px] border border-white/20 bg-white/12 p-5 backdrop-blur">
              <p className="text-[14px] font-semibold">로그인 후 역할별 화면으로 확장됩니다.</p>
              <p className="mt-2 text-[13px] leading-6 text-blue-50/80">
                1차 구현은 관리자 접근 보호이며, 이후 교관 모바일웹과 교육생 모바일웹을 같은 계정 체계로 연결할 수 있습니다.
              </p>
            </div>
          </div>
        </div>

        <div className="p-7 sm:p-10">
          <div className="mb-8">
            <p className="text-[13px] font-semibold tracking-[0.18em] text-blue-500">LOGIN</p>
            <h2 className="mt-3 text-[30px] font-semibold tracking-[-0.05em] text-slate-950">관리자 로그인</h2>
            <p className="mt-2 text-[14px] leading-6 text-slate-500">
              Supabase Auth에 등록된 관리자 이메일과 비밀번호로 로그인하세요.
            </p>
          </div>

          {devBypass ? (
            <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-6 text-amber-800">
              현재 로컬 개발 우회 모드가 켜져 있습니다. 운영 배포 환경에는 이 설정을 넣지 마세요.
              <button
                type="button"
                onClick={moveDevMode}
                className="mt-3 w-full rounded-xl bg-amber-500 px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-amber-600"
              >
                개발관리자로 바로 들어가기
              </button>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-slate-600">이메일</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@skynuri.co.kr"
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                autoComplete="email"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-slate-600">비밀번호</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="비밀번호"
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                autoComplete="current-password"
              />
            </label>

            {message ? (
              <p className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">{message}</p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="h-12 w-full rounded-2xl bg-slate-950 px-4 text-[15px] font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {submitting ? "로그인 중..." : "로그인"}
            </button>
          </form>

          <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-3 text-[13px] leading-6 text-slate-500">
            <p className="font-semibold text-slate-700">초기 관리자 계정 안내</p>
            <p className="mt-1">
              Supabase Authentication에 이메일 계정을 만든 뒤, 회원관리 users 테이블에서 같은 이메일의 역할을 관리자, 상태를 승인완료로 설정하면 됩니다.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-[#f6f8fb] text-slate-500">로그인 화면을 불러오고 있습니다.</main>}>
      <LoginContent />
    </Suspense>
  );
}
