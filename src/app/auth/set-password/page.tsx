"use client";

import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [message, setMessage] = useState("비밀번호 설정 링크를 확인하는 중입니다...");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function prepareSession() {
      try {
        const supabase = getSupabaseBrowserClient();
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
          const accessToken = hash.get("access_token") || "";
          const refreshToken = hash.get("refresh_token") || "";

          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (error) throw error;
          } else {
            const { data } = await supabase.auth.getSession();
            if (!data.session) {
              throw new Error("비밀번호 설정 링크가 만료되었거나 올바르지 않습니다. 앱에서 링크를 다시 요청해주세요.");
            }
          }
        }

        if (cancelled) return;
        setReady(true);
        setMessage("새 비밀번호를 입력해주세요.");
      } catch (error) {
        if (cancelled) return;
        setReady(false);
        setMessage(error instanceof Error ? error.message : "비밀번호 설정 링크를 확인하지 못했습니다.");
      } finally {
        if (!cancelled) setInitializing(false);
      }
    }

    void prepareSession();

    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || loading) return;

    if (password.trim().length < 6) {
      setMessage("비밀번호는 6자 이상으로 입력해주세요.");
      return;
    }

    if (password !== passwordConfirm) {
      setMessage("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setLoading(true);
    setMessage("비밀번호를 설정하는 중입니다...");

    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut();
      setSuccess(true);
      setReady(false);
      setPassword("");
      setPasswordConfirm("");
      setMessage("비밀번호가 설정되었습니다. 이제 하늘누리 앱에서 로그인하세요.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "비밀번호 설정에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f8fd] px-5 py-10 text-[#10213f]">
      <section className="mx-auto max-w-[460px] rounded-[28px] border border-[#dfe8f4] bg-white p-7 shadow-[0_18px_42px_rgba(15,40,80,0.08)]">
        <div className="mb-6">
          <div className="mb-3 inline-flex rounded-full bg-[#eef5ff] px-3 py-1 text-[13px] font-medium text-[#1264f4] ring-1 ring-[#d4e5ff]">
            Skynuri App Account
          </div>
          <h1 className="text-[24px] font-semibold tracking-[-0.03em]">앱 비밀번호 설정</h1>
          <p className="mt-2 text-[14px] leading-6 text-[#6f8199]">
            관리자에게 등록된 회원이 앱을 사용하기 위한 비밀번호를 설정합니다.
          </p>
        </div>

        <div className={`mb-5 rounded-2xl px-4 py-3 text-[14px] leading-6 ${success ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : ready ? "border border-blue-100 bg-blue-50 text-blue-700" : "border border-amber-200 bg-amber-50 text-amber-700"}`}>
          {message}
        </div>

        {initializing ? (
          <div className="h-11 rounded-xl bg-[#eef3f9]" />
        ) : ready ? (
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-[13px] font-medium text-[#425a78]">새 비밀번호</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-12 w-full rounded-2xl border border-[#d5e0ee] bg-[#f8fbff] px-4 text-[15px] outline-none transition focus:border-[#1264f4]"
                placeholder="6자 이상"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-[13px] font-medium text-[#425a78]">비밀번호 확인</span>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                className="h-12 w-full rounded-2xl border border-[#d5e0ee] bg-[#f8fbff] px-4 text-[15px] outline-none transition focus:border-[#1264f4]"
                placeholder="한 번 더 입력"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-2xl bg-[#1264f4] text-[15px] font-medium text-white transition hover:bg-[#0f55d4] disabled:bg-[#9ab9ef]"
            >
              {loading ? "설정 중..." : "비밀번호 설정"}
            </button>
          </form>
        ) : (
          <p className="text-[13px] leading-6 text-[#6f8199]">
            링크가 만료된 경우 앱 로그인 화면에서 비밀번호 설정 링크를 다시 요청하세요.
          </p>
        )}
      </section>
    </main>
  );
}
