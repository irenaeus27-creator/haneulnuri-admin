import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { buildId, nowIso, text } from "@/lib/supabase/route-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type JsonRecord = Record<string, unknown>;

function normalizeEmail(value: unknown) {
  return text(value).toLowerCase();
}

function phoneDigits(value: unknown) {
  return text(value).replace(/\D/g, "");
}

function formatPhone(value: unknown) {
  const digits = phoneDigits(value);
  if (!digits) return "";
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10 && digits.startsWith("02")) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return digits;
}

function normalizeRole(value: unknown) {
  const raw = text(value).replace(/\s/g, "");
  if (raw.includes("렌탈") || raw.toLowerCase().includes("rental")) return "렌탈회원";
  if (raw.includes("교육") || raw.includes("학생") || raw.toLowerCase().includes("student")) return "교육생";
  if (raw === "admin" || raw === "관리자") return "관리자";
  if (raw === "instructor" || raw === "교관") return "교관";
  return text(value, "회원");
}

function cleanRow(row: JsonRecord) {
  const result: JsonRecord = {};
  Object.entries(row).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    result[key] = value;
  });
  return result;
}

function randomPassword() {
  const random = Math.random().toString(36).slice(2);
  const time = Date.now().toString(36);
  return `Skynuri-${random}-${time}!`;
}

async function findUser(email: string, phone: string) {
  const supabase = getSupabaseServerClient();

  if (email) {
    const { data, error } = await supabase.from("users").select("*").ilike("email", email).limit(1).maybeSingle();
    if (error) throw new Error(`회원 이메일 확인 실패: ${error.message}`);
    if (data) return data as JsonRecord;
  }

  if (phone) {
    const candidates = Array.from(new Set([phone, formatPhone(phone), phoneDigits(phone)].filter(Boolean)));
    for (const value of candidates) {
      const { data, error } = await supabase.from("users").select("*").eq("phone", value).limit(1).maybeSingle();
      if (error) throw new Error(`회원 연락처 확인 실패: ${error.message}`);
      if (data) return data as JsonRecord;
    }
  }

  return null;
}

async function findAuthUserByEmail(email: string) {
  const supabase = getSupabaseServerClient();

  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Auth 회원 조회 실패: ${error.message}`);

    const users = data?.users || [];
    const found = users.find((user) => normalizeEmail(user.email) === email);
    if (found) return found;
    if (users.length < 1000) break;
  }

  return null;
}

async function updateUserAuthIdIfColumnExists(userId: string, authUserId: string) {
  if (!userId || !authUserId) return;

  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("users")
    .update({ auth_user_id: authUserId, updated_at: nowIso() })
    .eq("user_id", userId);

  if (!error) return;

  const message = error.message || "";
  if (message.includes("auth_user_id") || message.includes("schema cache") || message.includes("column")) {
    await supabase.from("users").update({ updated_at: nowIso() }).eq("user_id", userId);
    return;
  }

  throw new Error(`회원 Auth 연결 저장 실패: ${error.message}`);
}

async function ensureAuthUser(user: JsonRecord, email: string) {
  const supabase = getSupabaseServerClient();
  const existing = await findAuthUserByEmail(email);

  if (existing?.id) {
    await updateUserAuthIdIfColumnExists(text(user.user_id), existing.id);
    return existing.id;
  }

  const role = normalizeRole(user.member_type || user.role);
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: randomPassword(),
    email_confirm: true,
    user_metadata: cleanRow({
      name: text(user.name),
      phone: text(user.phone),
      role,
      userId: text(user.user_id),
    }),
  });

  if (error) {
    const message = error.message || "";
    if (!message.toLowerCase().includes("already") && !message.includes("registered")) {
      throw new Error(`앱 로그인 계정 생성 실패: ${error.message}`);
    }

    const fallback = await findAuthUserByEmail(email);
    if (fallback?.id) {
      await updateUserAuthIdIfColumnExists(text(user.user_id), fallback.id);
      return fallback.id;
    }

    throw new Error("이미 등록된 Auth 계정을 찾지 못했습니다.");
  }

  const authUserId = data.user?.id || "";
  await updateUserAuthIdIfColumnExists(text(user.user_id), authUserId);
  return authUserId;
}

function passwordRedirectUrl(request: NextRequest) {
  const configured =
    process.env.NEXT_PUBLIC_PASSWORD_SETUP_REDIRECT_URL ||
    process.env.NEXT_PUBLIC_APP_PASSWORD_REDIRECT_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "";

  if (configured) return configured;

  const url = new URL(request.url);
  return `${url.origin}/auth/set-password`;
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const body = (await request.json().catch(() => ({}))) as JsonRecord;
    const email = normalizeEmail(body.email);
    const phone = formatPhone(body.phone);

    if (!email) {
      return NextResponse.json(
        { ok: false, success: false, message: "비밀번호 설정 링크를 받을 이메일을 입력해주세요." },
        { status: 400 },
      );
    }

    const user = await findUser(email, phone);

    if (!user) {
      return NextResponse.json(
        { ok: false, success: false, message: "해당 이메일로 등록된 회원을 찾지 못했습니다. 관리자에게 먼저 회원 등록을 요청해주세요." },
        { status: 404 },
      );
    }

    const userEmail = normalizeEmail(user.email || email);
    if (!userEmail) {
      return NextResponse.json(
        { ok: false, success: false, message: "회원 정보에 이메일이 없어 비밀번호 설정 링크를 보낼 수 없습니다." },
        { status: 400 },
      );
    }

    const authUserId = await ensureAuthUser(user, userEmail);
    const supabase = getSupabaseServerClient();
    const redirectTo = passwordRedirectUrl(request);

    const { error } = await supabase.auth.resetPasswordForEmail(userEmail, { redirectTo });
    if (error) throw new Error(`비밀번호 설정 메일 발송 실패: ${error.message}`);

    return NextResponse.json({
      ok: true,
      success: true,
      service: "skynuri-password-setup",
      message: "비밀번호 설정 링크를 이메일로 보냈습니다.",
      email: userEmail,
      userId: text(user.user_id),
      authUserId,
      redirectTo,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "비밀번호 설정 링크 발송에 실패했습니다.";
    return NextResponse.json(
      {
        ok: false,
        success: false,
        service: "skynuri-password-setup",
        message,
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}
