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

export function normalizeMemberType(value: unknown, fallback = "") {
  const raw = text(value || fallback);
  const normalized = raw.toLowerCase().replace(/[\s_-]/g, "");

  if (
    normalized === "rental" ||
    normalized === "rentalpilot" ||
    raw === "렌탈" ||
    raw === "렌탈기장" ||
    raw === "렌탈회원"
  ) {
    return "렌탈회원";
  }

  if (normalized === "student" || raw === "학생" || raw === "교육생" || raw === "교육회원") {
    return "교육생";
  }

  if (normalized === "admin" || raw === "관리자") return "관리자";
  if (normalized === "instructor" || raw === "교관") return "교관";
  if (raw === "체험회원") return "체험회원";

  return raw;
}

export function splitAssignedAircraftIds(value: unknown) {
  const raw = text(value);
  if (!raw) return [];

  const jsonLike = raw.trim();
  if ((jsonLike.startsWith("[") && jsonLike.endsWith("]")) || (jsonLike.startsWith("{") && jsonLike.endsWith("}"))) {
    try {
      const parsed = JSON.parse(jsonLike);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => text(item)).filter(Boolean);
      }
      if (parsed && typeof parsed === "object") {
        return Object.values(parsed as Record<string, unknown>).map((item) => text(item)).filter(Boolean);
      }
    } catch {
      // 일반 구분자 문자열로 계속 처리합니다.
    }
  }

  return raw
    .split(/[,\n\/|;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getAssignedAircraftIds(context: MobileAuthContext) {
  const fromStudent = splitAssignedAircraftIds(context.student?.assignedAircraftIds || context.student?.assigned_aircraft_ids);
  const fromRentalPilot = splitAssignedAircraftIds(context.rentalPilot?.assignedAircraftIds || context.rentalPilot?.assigned_aircraft_ids);
  return Array.from(new Set([...fromStudent, ...fromRentalPilot]));
}

function normalizeAircraftText(value: unknown) {
  return text(value).toLowerCase().replace(/[\s_\-()]/g, "");
}

export function isAircraftAssignedToContext(context: MobileAuthContext, aircraft: JsonRecord) {
  const assignedIds = getAssignedAircraftIds(context);
  if (assignedIds.length === 0) return false;

  const candidates = [
    aircraft.aircraftId,
    aircraft.aircraft_id,
    aircraft.registrationNo,
    aircraft.registration_no,
    aircraft.aircraftName,
    aircraft.aircraft_name,
  ].map(normalizeAircraftText).filter(Boolean);

  return assignedIds.some((assigned) => {
    const normalizedAssigned = normalizeAircraftText(assigned);
    return candidates.some((candidate) => candidate === normalizedAssigned || candidate.includes(normalizedAssigned) || normalizedAssigned.includes(candidate));
  });
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

function normalizedStatus(value: unknown) {
  return text(value).toLowerCase().replace(/[\s_-]/g, "");
}

function isApprovedStatus(value: unknown, row?: JsonRecord | null) {
  const status = normalizedStatus(value);
  const rejectedAt = text(row?.rejected_at || row?.rejectedAt);
  const approvedAt = text(row?.approved_at || row?.approvedAt);

  if (rejectedAt) return false;
  if (approvedAt) return true;

  return [
    "approved",
    "approve",
    "active",
    "enabled",
    "normal",
    "ok",
    "승인",
    "승인완료",
    "승인됨",
    "확정",
    "활성",
    "정상",
    "사용",
    "사용가능",
  ].includes(status);
}

function isRejectedStatus(value: unknown, row?: JsonRecord | null) {
  const status = normalizedStatus(value);
  const rejectedAt = text(row?.rejected_at || row?.rejectedAt);
  if (rejectedAt) return true;

  return status.includes("reject") ||
    status.includes("rejected") ||
    status.includes("반려") ||
    status.includes("거절") ||
    status.includes("차단") ||
    status.includes("중지") ||
    status.includes("탈퇴");
}

function rowTime(row: JsonRecord) {
  const raw = text(row.updated_at || row.updatedAt || row.approved_at || row.approvedAt || row.requested_at || row.requestedAt || row.created_at || row.createdAt);
  const time = raw ? Date.parse(raw) : 0;
  return Number.isFinite(time) ? time : 0;
}

function rankUserCandidate(row: JsonRecord, authUserId: string) {
  const hasAuthUserId = text(row.auth_user_id || row.authUserId) === authUserId;
  const approved = isApprovedStatus(row.status, row);
  const rejected = isRejectedStatus(row.status, row);

  if (approved && hasAuthUserId) return 5000000000000 + rowTime(row);
  if (approved) return 4000000000000 + rowTime(row);
  if (!rejected && hasAuthUserId) return 3000000000000 + rowTime(row);
  if (!rejected) return 2000000000000 + rowTime(row);
  if (hasAuthUserId) return 1000000000000 + rowTime(row);
  return rowTime(row);
}

async function selectUserRowByAuthUser(authUser: User | null) {
  if (!authUser) return null;

  const supabase = mobileSupabase();
  const authUserId = text(authUser.id);
  const email = text(authUser.email).toLowerCase();
  const candidates: JsonRecord[] = [];

  if (authUserId) {
    const byAuthId = await supabase
      .from("users")
      .select("*")
      .eq("auth_user_id", authUserId);

    if (byAuthId.error && !byAuthId.error.message.includes("auth_user_id")) {
      throw new Error(`회원 조회 실패: ${byAuthId.error.message}`);
    }

    candidates.push(...((byAuthId.data || []) as JsonRecord[]));
  }

  if (email) {
    const byEmail = await supabase
      .from("users")
      .select("*")
      .ilike("email", email);

    if (byEmail.error) throw new Error(`회원 조회 실패: ${byEmail.error.message}`);
    candidates.push(...((byEmail.data || []) as JsonRecord[]));
  }

  const uniqueCandidates = Array.from(
    new Map(candidates.map((row) => [text(row.user_id || row.userId || row.id), row])).values()
  ).filter((row) => text(row.user_id || row.userId));

  if (uniqueCandidates.length === 0) return null;

  uniqueCandidates.sort((a, b) => rankUserCandidate(b, authUserId) - rankUserCandidate(a, authUserId));
  const selected = uniqueCandidates[0];
  const selectedUserId = text(selected.user_id || selected.userId);

  if (authUserId && selectedUserId) {
    const now = nowIso();

    // 같은 Auth 계정으로 생성된 승인대기 중복 row가 있으면, 승인된 row를 우선 연결할 수 있도록 분리합니다.
    await supabase
      .from("users")
      .update({ auth_user_id: null, updated_at: now })
      .eq("auth_user_id", authUserId)
      .neq("user_id", selectedUserId);

    if (text(selected.auth_user_id || selected.authUserId) !== authUserId) {
      const updateResult = await supabase
        .from("users")
        .update({
          auth_user_id: authUserId,
          role: normalizeMemberType(selected.role || selected.member_type),
          member_type: normalizeMemberType(selected.member_type || selected.role),
          updated_at: now,
        })
        .eq("user_id", selectedUserId)
        .select("*")
        .maybeSingle();

      if (updateResult.error) throw new Error(`회원 Auth 연결 실패: ${updateResult.error.message}`);
      if (updateResult.data) return updateResult.data as JsonRecord;

      selected.auth_user_id = authUserId;
    }
  }

  return selected;
}

async function createPendingUserFromAuth(authUser: User) {
  const supabase = mobileSupabase();
  const now = nowIso();
  const metadata = (authUser.user_metadata || {}) as JsonRecord;
  const role = normalizeMemberType(metadata.role || metadata.memberType || metadata.member_type || "일반회원");
  const row = {
    user_id: buildId("U"),
    auth_user_id: authUser.id,
    name: text(metadata.name),
    phone: text(metadata.phone),
    email: text(authUser.email).toLowerCase(),
    role,
    member_type: role,
    status: "승인대기",
    requested_at: now,
    created_at: now,
    updated_at: now,
    memo: "Supabase Auth 로그인 후 자동 생성된 앱 가입 요청",
  };

  const { data, error } = await supabase.from("users").insert(row).select("*").single();
  if (error) throw new Error(`회원 가입 요청 생성 실패: ${error.message}`);
  return data as JsonRecord;
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
  if (rentalPilotResult.error) throw new Error(`렌탈회원 조회 실패: ${rentalPilotResult.error.message}`);

  const user = userResult.data ? toCamelObject(userResult.data as JsonRecord) : null;
  if (user) {
    user.role = normalizeMemberType(user.role);
    user.memberType = normalizeMemberType(user.memberType || user.role);
  }

  return {
    user,
    student: studentResult.data ? toCamelObject(studentResult.data as JsonRecord) : null,
    rentalPilot: rentalPilotResult.data ? toCamelObject(rentalPilotResult.data as JsonRecord) : null,
  };
}

export async function getMobileAuthContext(request: NextRequest, fallbackUserId?: unknown): Promise<MobileAuthContext> {
  const authUser = await getAuthUserFromRequest(request);
  let authUserRow = await selectUserRowByAuthUser(authUser);

  if (!authUserRow && authUser) {
    authUserRow = await createPendingUserFromAuth(authUser);
  }

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
