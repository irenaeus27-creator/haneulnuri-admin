import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { nowIso, text } from "@/lib/supabase/route-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type JsonRecord = Record<string, unknown>;

function normalizeEmail(value: unknown) {
  return text(value).trim().toLowerCase();
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

function randomSixDigitCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function findUser(body: JsonRecord) {
  const supabase = getSupabaseServerClient();
  const userId = text(body.userId || body.user_id);
  const email = normalizeEmail(body.email);
  const phone = formatPhone(body.phone);
  const phoneOnlyDigits = phoneDigits(body.phone);

  if (userId) {
    const { data, error } = await supabase.from("users").select("*").eq("user_id", userId).limit(1).maybeSingle();
    if (error) throw new Error(`회원 조회 실패: ${error.message}`);
    if (data) return data as JsonRecord;
  }

  if (email) {
    const { data, error } = await supabase.from("users").select("*").ilike("email", email).limit(1).maybeSingle();
    if (error) throw new Error(`회원 이메일 조회 실패: ${error.message}`);
    if (data) return data as JsonRecord;
  }

  if (phone || phoneOnlyDigits) {
    const candidates = Array.from(new Set([phone, phoneOnlyDigits].filter(Boolean)));
    for (const value of candidates) {
      const { data, error } = await supabase.from("users").select("*").eq("phone", value).limit(1).maybeSingle();
      if (error) throw new Error(`회원 연락처 조회 실패: ${error.message}`);
      if (data) return data as JsonRecord;
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const body = (await request.json().catch(() => ({}))) as JsonRecord;
    const user = await findUser(body);

    if (!user) {
      return NextResponse.json(
        { ok: false, success: false, message: "설정코드를 발급할 회원을 찾지 못했습니다." },
        { status: 404 },
      );
    }

    const userId = text(user.user_id);
    const email = normalizeEmail(user.email);
    const phone = formatPhone(user.phone);

    if (!userId) {
      return NextResponse.json(
        { ok: false, success: false, message: "회원 ID가 없어 설정코드를 발급할 수 없습니다." },
        { status: 400 },
      );
    }

    if (!email || !phone) {
      return NextResponse.json(
        { ok: false, success: false, message: "앱 비밀번호 설정에는 회원 이메일과 전화번호가 모두 필요합니다." },
        { status: 400 },
      );
    }

    const code = randomSixDigitCode();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const supabase = getSupabaseServerClient();

    const { error } = await supabase
      .from("users")
      .update({
        password_setup_code: code,
        password_setup_code_expires_at: expiresAt,
        password_setup_code_used_at: null,
        updated_at: nowIso(),
      })
      .eq("user_id", userId);

    if (error) throw new Error(`설정코드 저장 실패: ${error.message}`);

    return NextResponse.json({
      ok: true,
      success: true,
      service: "skynuri-password-code",
      message: "앱 비밀번호 설정코드를 발급했습니다.",
      code,
      expiresAt,
      expiresInMinutes: 30,
      userId,
      name: text(user.name),
      email,
      phone,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "앱 비밀번호 설정코드 발급에 실패했습니다.";
    return NextResponse.json(
      {
        ok: false,
        success: false,
        service: "skynuri-password-code",
        message,
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}
