import { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type JsonRecord = Record<string, unknown>;

export type MobileAuthContext = {
  authUser: User | null;
  authUserId: string;
  userId: string;
  user: JsonRecord | null;
  student: JsonRecord | null;
  rentalPilot: JsonRecord | null;
};

export function text(value: unknown, fallback = "") {
  const result = String(value ?? "").trim();
  return result || fallback;
}

export function nowIso() {
  return new Date().toISOString();
}

export function buildId(prefix: string) {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${stamp}-${random}`;
}

export function todayText() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

export function addDaysText(baseDateText: string, days: number) {
  const [year, month, day] = baseDateText.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function timeText(value: unknown) {
  const raw = text(value);
  const match = raw.match(/(\d{1,2}):(\d{1,2})/);
  if (!match) return raw ? raw.slice(0, 5) : "";
  return `${String(Number(match[1])).padStart(2, "0")}:${String(Number(match[2])).padStart(2, "0")}`;
}

export function toCamelKey(key: string) {
  return key.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

export function toCamelObject(row: JsonRecord | null | undefined) {
  const result: JsonRecord = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    result[toCamelKey(key)] = value ?? "";
  });
  return result;
}

export function mapRows(rows: JsonRecord[] | null | undefined) {
  return (rows || []).map((row) => toCamelObject(row));
}

export function mobileSupabase() {
  return getSupabaseServerClient();
}

function bearerToken(request: NextRequest) {
  const header = text(request.headers.get("authorization"));
  const match = header.match(/^Bearer\s+(.+)$/i);
  return text(match?.[1]);
}

export async function getAuthUserFromRequest(request: NextRequest) {
  const token = bearerToken(request);
  if (!token) return null;

  const supabase = mobileSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error) throw new Error(`로그인 토큰 확인 실패: ${error.message}`);
  return data.user ?? null;
}

async function selectUserRowByAuthUser(authUser: User | null) {
  if (!authUser) return null;

  const supabase = mobileSupabase();
  const authUserId = text(authUser.id);
  const email = text(authUser.email).toLowerCase();

  if (authUserId) {
    const byAuthId = await supabase
      .from("users")
      .select("*")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (byAuthId.error && !byAuthId.error.message.includes("auth_user_id")) {
      throw new Error(`회원 조회 실패: ${byAuthId.error.message}`);
    }

    if (byAuthId.data) return byAuthId.data as JsonRecord;
  }

  if (email) {
    const byEmail = await supabase
      .from("users")
      .select("*")
      .ilike("email", email)
      .maybeSingle();

    if (byEmail.error) throw new Error(`회원 조회 실패: ${byEmail.error.message}`);
    if (byEmail.data) return byEmail.data as JsonRecord;
  }

  return null;
}

export async function getUserBundleByUserId(userId: string) {
  const supabase = mobileSupabase();

  const [userResult, studentResult, rentalPilotResult] = await Promise.all([
    supabase.from("users").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("students").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("rental_pilots").select("*").eq("user_id", userId).maybeSingle(),
  ]);

  if (userResult.error) throw new Error(`회원 조회 실패: ${userResult.error.message}`);
  if (studentResult.error) throw new Error(`교육생 조회 실패: ${studentResult.error.message}`);
  if (rentalPilotResult.error) throw new Error(`렌탈기장 조회 실패: ${rentalPilotResult.error.message}`);

  return {
    user: userResult.data ? toCamelObject(userResult.data as JsonRecord) : null,
    student: studentResult.data ? toCamelObject(studentResult.data as JsonRecord) : null,
    rentalPilot: rentalPilotResult.data ? toCamelObject(rentalPilotResult.data as JsonRecord) : null,
  };
}

export async function getMobileAuthContext(request: NextRequest, fallbackUserId?: unknown): Promise<MobileAuthContext> {
  const authUser = await getAuthUserFromRequest(request);
  const authUserRow = await selectUserRowByAuthUser(authUser);
  const resolvedUserId = text(authUserRow?.user_id || fallbackUserId);

  if (!resolvedUserId) {
    if (authUser) {
      throw new Error("Supabase Auth 계정과 연결된 회원 정보가 없습니다. users.auth_user_id 또는 users.email을 확인해주세요.");
    }
    throw new Error("로그인이 필요합니다. Authorization: Bearer access_token 또는 userId가 필요합니다.");
  }

  const bundle = await getUserBundleByUserId(resolvedUserId);

  return {
    authUser,
    authUserId: text(authUser?.id),
    userId: resolvedUserId,
    user: bundle.user,
    student: bundle.student,
    rentalPilot: bundle.rentalPilot,
  };
}

export function requireUserId(value: unknown) {
  const userId = text(value);
  if (!userId) throw new Error("userId가 필요합니다.");
  return userId;
}
