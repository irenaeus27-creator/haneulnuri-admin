import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { JsonRecord, buildId, nowIso, pickAllowed, selectRows, text, updateRow } from "@/lib/supabase/route-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const USER_COLUMNS = [
  "user_id",
  "auth_user_id",
  "name",
  "phone",
  "email",
  "role",
  "status",
  "member_type",
  "created_at",
  "requested_at",
  "approved_at",
  "rejected_at",
  "updated_at",
  "memo",
];

const APPROVED_STATUS = "승인완료";
const PENDING_STATUS = "승인대기";

function normalizeTimestamp(value: unknown) {
  const raw = text(value);
  if (!raw) return undefined;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function nullableText(value: unknown) {
  const raw = text(value);
  return raw || null;
}

function normalizeMemberType(value: unknown) {
  const raw = text(value).replace(/\s/g, "");
  if (["student", "학생", "학생회원", "교육생", "교육생회원"].includes(raw) || raw.includes("교육")) return "교육생";
  if (["rental", "rental_pilot", "rentalPilot", "렌탈", "렌탈기장", "렌탈회원"].includes(raw) || raw.includes("렌탈")) return "렌탈회원";
  if (["admin", "관리자"].includes(raw)) return "관리자";
  if (["instructor", "교관"].includes(raw)) return "교관";
  return raw || "일반회원";
}

function roleForMemberType(value: unknown) {
  const normalized = normalizeMemberType(value);
  if (normalized === "교육생") return "교육생";
  if (normalized === "렌탈회원") return "렌탈회원";
  return normalized;
}

function normalizeUser(input: JsonRecord, isCreate = false) {
  const now = nowIso();
  const userId = text(input.userId || input.user_id) || buildId("U");
  const memberType = normalizeMemberType(input.memberType || input.member_type || input.role);

  return pickAllowed(
    {
      user_id: userId,
      auth_user_id: nullableText(input.authUserId || input.auth_user_id),
      name: text(input.name || input.userName || input.user_name),
      phone: text(input.phone),
      email: text(input.email),
      role: roleForMemberType(input.role || memberType),
      status: text(input.status || (isCreate ? PENDING_STATUS : "")),
      member_type: memberType,
      memo: text(input.memo),
      created_at: normalizeTimestamp(input.createdAt || input.created_at) || (isCreate ? now : undefined),
      requested_at: normalizeTimestamp(input.requestedAt || input.requested_at) || (isCreate ? now : undefined),
      approved_at: normalizeTimestamp(input.approvedAt || input.approved_at),
      rejected_at: normalizeTimestamp(input.rejectedAt || input.rejected_at),
      updated_at: now,
    },
    USER_COLUMNS,
  );
}

function toCamelKey(key: string) {
  return key.replace(/_([a-z0-9])/g, (_: string, char: string) => char.toUpperCase());
}

function toCamelObject(row: JsonRecord | null | undefined) {
  const result: JsonRecord = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    result[toCamelKey(key)] = value ?? "";
  });
  return result;
}

function mapRows(rows: JsonRecord[] | null | undefined) {
  return (rows || []).map((row) => toCamelObject(row));
}

function cleanRow(row: JsonRecord) {
  const result: JsonRecord = {};
  Object.entries(row).forEach(([key, value]) => {
    if (value === undefined || value === "") return;
    result[key] = value;
  });
  return result;
}

async function selectOptionalRows(table: string, orderColumn?: string) {
  const supabase = getSupabaseServerClient();
  let query = supabase.from(table).select("*");
  if (orderColumn) query = query.order(orderColumn, { ascending: true });
  const { data, error } = await query.limit(3000);
  if (error) {
    const message = error.message || "";
    if (message.includes("does not exist") || message.includes("Could not find") || message.includes("schema cache") || message.includes("42P01")) return [];
    throw new Error(`${table} 조회 실패: ${error.message}`);
  }
  return mapRows(data as JsonRecord[]);
}

async function getUserById(userId: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("users").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`회원 조회 실패: ${error.message}`);
  if (!data) throw new Error("승인할 회원을 찾지 못했습니다.");
  return data as JsonRecord;
}

async function findExistingStudentByUserOrEmail(user: JsonRecord) {
  const supabase = getSupabaseServerClient();
  const userId = text(user.user_id);
  const email = text(user.email);
  const phone = text(user.phone);

  let query = supabase.from("students").select("*").limit(1);
  if (userId) query = query.eq("user_id", userId);
  const byUser = await query.maybeSingle();
  if (byUser.error) throw new Error(`교육생 조회 실패: ${byUser.error.message}`);
  if (byUser.data) return byUser.data as JsonRecord;

  if (email) {
    const { data, error } = await supabase.from("students").select("*").eq("email", email).limit(1).maybeSingle();
    if (error) throw new Error(`교육생 이메일 조회 실패: ${error.message}`);
    if (data) return data as JsonRecord;
  }

  if (phone) {
    const { data, error } = await supabase.from("students").select("*").eq("phone", phone).limit(1).maybeSingle();
    if (error) throw new Error(`교육생 연락처 조회 실패: ${error.message}`);
    if (data) return data as JsonRecord;
  }

  return null;
}

async function findExistingRentalByUserOrEmail(user: JsonRecord) {
  const supabase = getSupabaseServerClient();
  const userId = text(user.user_id);
  const email = text(user.email);
  const phone = text(user.phone);

  if (userId) {
    const { data, error } = await supabase.from("rental_pilots").select("*").eq("user_id", userId).limit(1).maybeSingle();
    if (error) throw new Error(`렌탈회원 조회 실패: ${error.message}`);
    if (data) return data as JsonRecord;
  }

  if (email) {
    const { data, error } = await supabase.from("rental_pilots").select("*").eq("email", email).limit(1).maybeSingle();
    if (error) throw new Error(`렌탈회원 이메일 조회 실패: ${error.message}`);
    if (data) return data as JsonRecord;
  }

  if (phone) {
    const { data, error } = await supabase.from("rental_pilots").select("*").eq("phone", phone).limit(1).maybeSingle();
    if (error) throw new Error(`렌탈회원 연락처 조회 실패: ${error.message}`);
    if (data) return data as JsonRecord;
  }

  return null;
}

async function linkOrCreateStudent(user: JsonRecord, input: JsonRecord) {
  const supabase = getSupabaseServerClient();
  const now = nowIso();
  const userId = text(user.user_id);
  const mode = text(input.profileMode || input.linkMode || input.mode, "create");
  const existingStudentId = text(input.studentId || input.student_id || input.existingStudentId || input.existing_student_id);
  const assignedInstructorId = text(input.assignedInstructorId || input.assigned_instructor_id);
  const assignedInstructorName = text(input.assignedInstructorName || input.assigned_instructor_name);
  const assignedAircraftIds = text(input.assignedAircraftIds || input.assigned_aircraft_ids);

  if (mode === "existing" || existingStudentId) {
    const studentId = existingStudentId;
    if (!studentId) throw new Error("연결할 기존 교육생을 선택해주세요.");

    const row = cleanRow({
      user_id: userId,
      name: text(input.name || user.name),
      phone: text(input.phone || user.phone),
      email: text(input.email || user.email),
      course: text(input.course),
      license_type: text(input.licenseType || input.license_type),
      training_status: text(input.trainingStatus || input.training_status),
      assigned_instructor_id: assignedInstructorId,
      assigned_instructor_name: assignedInstructorName,
      assigned_aircraft_ids: assignedAircraftIds,
      memo: text(input.profileMemo || input.memo),
      updated_at: now,
    });

    const { data, error } = await supabase.from("students").update(row).eq("student_id", studentId).select("*").single();
    if (error) throw new Error(`기존 교육생 연결 실패: ${error.message}`);
    return toCamelObject(data as JsonRecord);
  }

  const existing = await findExistingStudentByUserOrEmail(user);
  if (existing) {
    const row = cleanRow({
      user_id: userId,
      name: text(input.name || user.name || existing.name),
      phone: text(input.phone || user.phone || existing.phone),
      email: text(input.email || user.email || existing.email),
      course: text(input.course || existing.course),
      license_type: text(input.licenseType || input.license_type || existing.license_type),
      training_status: text(input.trainingStatus || input.training_status || existing.training_status),
      assigned_instructor_id: assignedInstructorId || existing.assigned_instructor_id,
      assigned_instructor_name: assignedInstructorName || existing.assigned_instructor_name,
      assigned_aircraft_ids: assignedAircraftIds || existing.assigned_aircraft_ids,
      memo: text(input.profileMemo || input.memo || existing.memo),
      updated_at: now,
    });

    const { data, error } = await supabase.from("students").update(row).eq("student_id", text(existing.student_id)).select("*").single();
    if (error) throw new Error(`교육생 자동 연결 실패: ${error.message}`);
    return toCamelObject(data as JsonRecord);
  }

  const row = cleanRow({
    student_id: buildId("STU"),
    user_id: userId,
    name: text(input.name || user.name) || "교육생",
    phone: text(input.phone || user.phone),
    email: text(input.email || user.email),
    course: text(input.course, "교육"),
    license_type: text(input.licenseType || input.license_type),
    training_start_date: text(input.trainingStartDate || input.training_start_date) || new Date().toISOString().slice(0, 10),
    training_status: text(input.trainingStatus || input.training_status, "교육중"),
    assigned_instructor_id: assignedInstructorId,
    assigned_instructor_name: assignedInstructorName,
    assigned_aircraft_ids: assignedAircraftIds,
    memo: text(input.profileMemo || input.memo),
    created_at: now,
    updated_at: now,
  });

  const { data, error } = await supabase.from("students").insert(row).select("*").single();
  if (error) throw new Error(`신규 교육생 생성 실패: ${error.message}`);
  return toCamelObject(data as JsonRecord);
}

async function linkOrCreateRentalPilot(user: JsonRecord, input: JsonRecord) {
  const supabase = getSupabaseServerClient();
  const now = nowIso();
  const userId = text(user.user_id);
  const mode = text(input.profileMode || input.linkMode || input.mode, "create");
  const existingPilotId = text(input.pilotId || input.pilot_id || input.existingPilotId || input.existing_pilot_id);
  const assignedAircraftIds = text(input.assignedAircraftIds || input.assigned_aircraft_ids);

  if (mode === "existing" || existingPilotId) {
    const pilotId = existingPilotId;
    if (!pilotId) throw new Error("연결할 기존 렌탈회원을 선택해주세요.");

    const row = cleanRow({
      user_id: userId,
      name: text(input.name || user.name),
      phone: text(input.phone || user.phone),
      email: text(input.email || user.email),
      license_type: text(input.licenseType || input.license_type),
      license_no: text(input.licenseNo || input.license_no),
      assigned_aircraft_ids: assignedAircraftIds,
      status: "활성",
      memo: text(input.profileMemo || input.memo),
      updated_at: now,
    });

    const { data, error } = await supabase.from("rental_pilots").update(row).eq("pilot_id", pilotId).select("*").single();
    if (error) throw new Error(`기존 렌탈회원 연결 실패: ${error.message}`);
    return toCamelObject(data as JsonRecord);
  }

  const existing = await findExistingRentalByUserOrEmail(user);
  if (existing) {
    const row = cleanRow({
      user_id: userId,
      name: text(input.name || user.name || existing.name),
      phone: text(input.phone || user.phone || existing.phone),
      email: text(input.email || user.email || existing.email),
      license_type: text(input.licenseType || input.license_type || existing.license_type),
      license_no: text(input.licenseNo || input.license_no || existing.license_no),
      assigned_aircraft_ids: assignedAircraftIds || existing.assigned_aircraft_ids,
      status: "활성",
      memo: text(input.profileMemo || input.memo || existing.memo),
      updated_at: now,
    });

    const { data, error } = await supabase.from("rental_pilots").update(row).eq("pilot_id", text(existing.pilot_id)).select("*").single();
    if (error) throw new Error(`렌탈회원 자동 연결 실패: ${error.message}`);
    return toCamelObject(data as JsonRecord);
  }

  const row = cleanRow({
    pilot_id: buildId("RP"),
    user_id: userId,
    name: text(input.name || user.name) || "렌탈회원",
    phone: text(input.phone || user.phone),
    email: text(input.email || user.email),
    license_type: text(input.licenseType || input.license_type),
    license_no: text(input.licenseNo || input.license_no),
    assigned_aircraft_ids: assignedAircraftIds,
    total_flight_minutes: Number(input.totalFlightMinutes || input.total_flight_minutes || 0),
    pic_flight_minutes: Number(input.picFlightMinutes || input.pic_flight_minutes || 0),
    status: "활성",
    memo: text(input.profileMemo || input.memo),
    created_at: now,
    updated_at: now,
  });

  const { data, error } = await supabase.from("rental_pilots").upsert(row, { onConflict: "pilot_id" }).select("*").single();
  if (error) throw new Error(`신규 렌탈회원 생성 실패: ${error.message}`);
  return toCamelObject(data as JsonRecord);
}

async function approveUserWithProfile(data: JsonRecord) {
  const userId = text(data.userId || data.user_id);
  if (!userId) throw new Error("userId가 필요합니다.");

  const now = nowIso();
  const user = await getUserById(userId);
  const memberType = normalizeMemberType(data.memberType || data.member_type || data.profileType || user.member_type || user.role);

  if (!data.skipProfile) {
    if (memberType === "교육생") {
      await linkOrCreateStudent(user, { ...data, memberType });
    } else if (memberType === "렌탈회원") {
      await linkOrCreateRentalPilot(user, { ...data, memberType });
    }
  }

  const updatePayload = cleanRow({
    name: text(data.name || user.name),
    phone: text(data.phone || user.phone),
    email: text(data.email || user.email),
    role: roleForMemberType(memberType),
    member_type: memberType,
    status: APPROVED_STATUS,
    approved_at: now,
    rejected_at: null,
    updated_at: now,
    memo: text(data.memo || user.memo),
  });

  const saved = await updateRow("users", "user_id", userId, updatePayload);
  return { message: "회원 연결/생성 후 승인했습니다.", user: saved, data: saved };
}

async function handlePost(body: JsonRecord) {
  const action = text(body.action);
  const data = (body.data || body) as JsonRecord;

  if (action === "addUser" || action === "addRow") {
    const supabase = getSupabaseServerClient();
    const row = normalizeUser(data, true);
    const { data: saved, error } = await supabase.from("users").upsert(row, { onConflict: "user_id" }).select("*").single();
    if (error) throw new Error(error.message);
    return { message: "회원을 등록했습니다.", user: toCamelObject(saved as JsonRecord), data: toCamelObject(saved as JsonRecord) };
  }

  if (action === "updateUser" || action === "updateRow") {
    const row = normalizeUser(data, false);
    const userId = text(data.userId || data.user_id || row.user_id);
    delete row.user_id;
    const saved = await updateRow("users", "user_id", userId, row);
    return { message: "회원 정보를 수정했습니다.", user: saved, data: saved };
  }

  if (action === "approveUserWithProfile") {
    return approveUserWithProfile(data);
  }

  if (action === "approveUser") {
    const userId = text(data.userId || data.user_id);
    if (!userId) throw new Error("userId가 필요합니다.");
    const now = nowIso();
    const saved = await updateRow("users", "user_id", userId, { status: APPROVED_STATUS, approved_at: now, rejected_at: null, updated_at: now });
    return { message: "회원을 승인했습니다.", user: saved, data: saved };
  }

  if (action === "rejectUser" || action === "denyUser") {
    const userId = text(data.userId || data.user_id);
    if (!userId) throw new Error("userId가 필요합니다.");
    const now = nowIso();
    const saved = await updateRow("users", "user_id", userId, { status: "반려", rejected_at: now, updated_at: now });
    return { message: "회원을 반려했습니다.", user: saved, data: saved };
  }

  throw new Error(`지원하지 않는 회원 action입니다: ${action}`);
}

export async function GET() {
  const startedAt = Date.now();
  try {
    const [users, students, rentalPilots, aircraft, instructors] = await Promise.all([
      selectRows("users", { orderColumn: "created_at", ascending: false }),
      selectOptionalRows("students", "name"),
      selectOptionalRows("rental_pilots", "name"),
      selectOptionalRows("aircraft", "aircraft_id"),
      selectOptionalRows("instructors", "name"),
    ]);

    return NextResponse.json({
      ok: true,
      success: true,
      source: "supabase",
      service: "skynuri-supabase-users",
      users,
      students,
      rentalPilots,
      aircraft,
      instructors,
      data: { users, students, rentalPilots, aircraft, instructors },
      counts: { users: users.length, students: students.length, rentalPilots: rentalPilots.length, aircraft: aircraft.length, instructors: instructors.length },
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, success: false, source: "supabase", message: error instanceof Error ? error.message : "회원 조회에 실패했습니다.", elapsedMs: Date.now() - startedAt }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = (await request.json()) as JsonRecord;
    const result = await handlePost(body);
    return NextResponse.json({ ok: true, success: true, source: "supabase", service: "skynuri-supabase-users", elapsedMs: Date.now() - startedAt, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, success: false, source: "supabase", message: error instanceof Error ? error.message : "회원 처리에 실패했습니다.", elapsedMs: Date.now() - startedAt }, { status: 500 });
  }
}
