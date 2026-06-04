import { getSupabaseServerClient } from "@/lib/supabase/server";

export type JsonRecord = Record<string, unknown>;

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

export function requireUserId(value: unknown) {
  const userId = text(value);
  if (!userId) throw new Error("userId가 필요합니다.");
  return userId;
}
