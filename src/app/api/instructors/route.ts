import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  JsonRecord,
  buildId,
  nowIso,
  pickAllowed,
  selectRows,
  text,
  toCamelObject,
} from "@/lib/supabase/route-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABLE = "instructors";
const ID_COLUMN = "instructor_id";
const PREFIX = "I";
const RESPONSE_KEY = "instructors";
const SERVICE = "skynuri-supabase-instructors";
const ORDER_COLUMN = "instructor_id";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ALLOWED_COLUMNS = [
  "instructor_id",
  "name",
  "phone",
  "email",
  "status",
  "license_no",
  "photo_url",
  "memo",
  "active",
  "created_at",
  "updated_at",
];

type MonthlyStats = {
  instructorId: string;
  educationCount: number;
  educationMinutes: number;
  experienceCount: number;
  experienceMinutes: number;
  rideCount: number;
  rideMinutes: number;
  rentalCount: number;
  rentalMinutes: number;
  otherCount: number;
  otherMinutes: number;
  totalCount: number;
  totalMinutes: number;
  studentCount: number;
  recentLogDate: string;
};

type MonthlyFlightDetail = {
  id: string;
  bookingId: string;
  instructorId: string;
  flightDate: string;
  startTime: string;
  endTime: string;
  flightType: string;
  targetName: string;
  aircraftName: string;
  courseName: string;
  content: string;
  actualMinutes: number;
  settlementMinutes: number;
  status: string;
};

function normalize(input: JsonRecord, isCreate = false) {
  const now = nowIso();
  const id = text(input.instructorId || input.instructor_id) || buildId(PREFIX);
  const row: JsonRecord = { [ID_COLUMN]: id };

  ALLOWED_COLUMNS.forEach((column) => {
    const camel = column.replace(/_([a-z0-9])/g, (_: string, char: string) => char.toUpperCase());
    const value = input[camel] ?? input[column];
    if (value !== undefined) row[column] = value;
  });

  if (ALLOWED_COLUMNS.includes("created_at") && isCreate && !row.created_at) row.created_at = now;
  if (ALLOWED_COLUMNS.includes("updated_at")) row.updated_at = now;

  return pickAllowed(row, ALLOWED_COLUMNS);
}

function normalizeEmail(value: unknown) {
  return text(value).toLowerCase();
}

function normalizePhone(value: unknown) {
  return text(value);
}

async function findUserByEmail(email: string) {
  if (!email) return null;
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .ilike("email", email)
    .maybeSingle();

  if (error) throw new Error(`회원 계정 확인 실패: ${error.message}`);
  return data as JsonRecord | null;
}

async function findAuthUserByEmail(email: string) {
  if (!email) return null;
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) throw new Error(`인증 계정 확인 실패: ${error.message}`);

  return (data.users || []).find((user) => user.email?.toLowerCase() === email) || null;
}

function missingColumnName(errorMessage: string) {
  const match = errorMessage.match(/'([^']+)' column/);
  return match ? match[1] : "";
}

function removeMissingColumn(row: JsonRecord, errorMessage: string) {
  const column = missingColumnName(errorMessage);
  if (!column || !(column in row)) return false;
  delete row[column];
  return true;
}

function stripEmptyValues(row: JsonRecord) {
  const payload = { ...row };
  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined || payload[key] === "") delete payload[key];
  });
  return payload;
}

function boolForDb(value: unknown) {
  const raw = text(value).toLowerCase();
  if (value === false || raw === "n" || raw === "no" || raw === "false" || raw === "0" || raw === "비활성") return false;
  return true;
}

function normalizeInstructorDbPayload(row: JsonRecord) {
  const payload = stripEmptyValues(row);
  delete payload.user_id;
  delete payload.userId;
  delete payload.password;
  delete payload.tempPassword;
  delete payload.temporaryPassword;

  if ("active" in payload) payload.active = boolForDb(payload.active);
  if (!payload.status) payload.status = boolForDb(payload.active) ? "근무중" : "비활성";
  return payload;
}

async function buildNextInstructorId() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("instructor_id")
    .like("instructor_id", "I-%")
    .order("instructor_id", { ascending: false })
    .limit(1);

  if (error) return buildId("I");

  const latest = text((data?.[0] as JsonRecord | undefined)?.instructor_id);
  const match = latest.match(/^I-(\d+)$/);
  if (!match) return "I-0001";

  const next = Number(match[1]) + 1;
  return `I-${String(next).padStart(4, "0")}`;
}

async function insertUserRowSafely(row: JsonRecord) {
  const supabase = getSupabaseServerClient();
  const payload = stripEmptyValues(row);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { data, error } = await supabase
      .from("users")
      .insert(payload)
      .select("*")
      .single();

    if (!error) return data as JsonRecord;

    const message = error.message || "";
    if (message.includes("duplicate key")) {
      const email = normalizeEmail(payload.email);
      const existing = await findUserByEmail(email);
      if (existing) return existing;
    }

    if (!removeMissingColumn(payload, message)) {
      throw new Error(`교관 회원 계정 생성 실패: ${message}`);
    }
  }

  throw new Error("교관 회원 계정 생성 실패: users 테이블 컬럼 구조를 확인하세요.");
}

async function updateUserRowSafely(userId: string, email: string, row: JsonRecord) {
  const supabase = getSupabaseServerClient();
  const payload = stripEmptyValues(row);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    let query = supabase.from("users").update(payload);
    query = userId ? query.eq("user_id", userId) : query.ilike("email", email);

    const { data, error } = await query.select("*").maybeSingle();

    if (!error) return data as JsonRecord | null;

    const message = error.message || "";
    if (!removeMissingColumn(payload, message)) {
      throw new Error(`교관 회원 계정 연결 실패: ${message}`);
    }
  }

  throw new Error("교관 회원 계정 연결 실패: users 테이블 컬럼 구조를 확인하세요.");
}

async function findInstructorByIdentity(data: JsonRecord) {
  const supabase = getSupabaseServerClient();
  const email = normalizeEmail(data.email);
  const userId = text(data.userId || data.user_id);
  const instructorId = text(data.instructorId || data.instructor_id);

  if (instructorId) {
    const { data: row, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq(ID_COLUMN, instructorId)
      .maybeSingle();
    if (!error && row) return toCamelObject(row as JsonRecord);
  }

  if (email) {
    const { data: row, error } = await supabase
      .from(TABLE)
      .select("*")
      .ilike("email", email)
      .maybeSingle();
    if (!error && row) return toCamelObject(row as JsonRecord);
  }

  if (userId) {
    const { data: row, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (!error && row) return toCamelObject(row as JsonRecord);
  }

  return null;
}

async function insertInstructorRow(row: JsonRecord) {
  const supabase = getSupabaseServerClient();
  const payload = normalizeInstructorDbPayload(row);

  if (!text(payload[ID_COLUMN])) {
    payload[ID_COLUMN] = await buildNextInstructorId();
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (!text(payload[ID_COLUMN])) {
      payload[ID_COLUMN] = await buildNextInstructorId();
    }

    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload)
      .select("*")
      .single();

    if (!error) return toCamelObject(data as JsonRecord);

    const message = error.message || "";

    if (message.includes("duplicate key") || message.includes("violates unique constraint")) {
      const existing = await findInstructorByIdentity(payload);
      if (existing) return existing;

      payload[ID_COLUMN] = await buildNextInstructorId();
      continue;
    }

    if (message.includes("null value in column") && message.includes(ID_COLUMN)) {
      payload[ID_COLUMN] = await buildNextInstructorId();
      continue;
    }

    if (removeMissingColumn(payload, message)) continue;

    throw new Error(message);
  }

  throw new Error("교관 정보 등록 실패: instructors 테이블 컬럼 구조 또는 중복 데이터를 확인하세요.");
}

async function updateInstructorRow(id: string, row: JsonRecord) {
  const supabase = getSupabaseServerClient();
  if (!id) throw new Error("instructor_id 값이 필요합니다.");
  const payload = normalizeInstructorDbPayload(row);
  delete payload[ID_COLUMN];

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { data, error } = await supabase
      .from(TABLE)
      .update(payload)
      .eq(ID_COLUMN, id)
      .select("*")
      .single();

    if (!error) return toCamelObject(data as JsonRecord);

    const message = error.message || "";
    if (removeMissingColumn(payload, message)) continue;

    throw new Error(message);
  }

  throw new Error("교관 정보 수정 실패: instructors 테이블 컬럼 구조를 확인하세요.");
}

async function ensureInstructorUser(data: JsonRecord, isCreate: boolean) {
  const email = normalizeEmail(data.email);
  const name = text(data.name || data.userName || data.user_name);
  const phone = normalizePhone(data.phone);
  const now = nowIso();

  if (!email) {
    if (isCreate) throw new Error("교관 로그인 계정 생성을 위해 이메일을 입력하세요.");
    return text(data.userId || data.user_id);
  }

  if (isCreate) {
    const password = text(data.password || data.tempPassword || data.temporaryPassword);
    if (!password || password.length < 6) {
      throw new Error("신규 교관은 6자 이상의 임시 비밀번호가 필요합니다.");
    }
  }

  const supabase = getSupabaseServerClient();
  let existingUser = await findUserByEmail(email);
  let userId = text(data.userId || data.user_id || existingUser?.user_id) || buildId("U");

  if (isCreate) {
    const existingAuth = await findAuthUserByEmail(email);

    if (!existingAuth) {
      const password = text(data.password || data.tempPassword || data.temporaryPassword);
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name,
          role: "instructor",
        },
      });

      if (authError) throw new Error(`교관 인증 계정 생성 실패: ${authError.message}`);
      // Auth UUID는 로그인 식별용이고, users.user_id에는 화면에서 쓰는 관리 ID를 유지합니다.
    }
  }

  const userPayload: JsonRecord = {
    user_id: userId,
    name,
    phone,
    email,
    role: "교관",
    status: "활성",
    member_type: "교관",
    approved_at: text(existingUser?.approved_at) || now,
    updated_at: now,
  };

  if (!existingUser) {
    userPayload.created_at = now;
    userPayload.requested_at = now;
    const inserted = await insertUserRowSafely(userPayload);
    return text(inserted.user_id || userId);
  }

  const updated = await updateUserRowSafely(text(existingUser.user_id || userId), email, userPayload);
  return text(updated?.user_id || existingUser.user_id || userId);
}

async function syncInstructorUser(data: JsonRecord) {
  const email = normalizeEmail(data.email);
  const userId = text(data.userId || data.user_id || data.instructorId || data.instructor_id);
  if (!email && !userId) return;

  const now = nowIso();
  const payload: JsonRecord = {
    user_id: userId || undefined,
    name: text(data.name || data.userName || data.user_name),
    phone: normalizePhone(data.phone),
    email,
    role: "교관",
    status: text(data.active).toUpperCase() === "N" || text(data.status) === "비활성" ? "비활성" : "활성",
    member_type: "교관",
    approved_at: now,
    updated_at: now,
  };

  const updated = await updateUserRowSafely(userId, email, payload);
  if (!updated && userId) {
    await insertUserRowSafely({
      ...payload,
      created_at: now,
      requested_at: now,
    });
  }
}

function monthRange(monthInput: string) {
  const fallback = new Date();
  const fallbackMonth = `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, "0")}`;
  const month = /^\d{4}-\d{2}$/.test(monthInput) ? monthInput : fallbackMonth;
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);
  const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  return { month, startDate, endDate };
}

function normalizeFlightType(value: unknown) {
  const raw = text(value, "기타");
  if (raw.includes("교육")) return "교육비행";
  if (raw.includes("체험")) return "체험비행";
  if (raw.includes("동승")) return "동승비행";
  if (raw.includes("렌탈")) return "렌탈비행";
  return "기타";
}

function numberValue(value: unknown) {
  const raw = text(value);
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedKey(value: unknown) {
  return text(value).replace(/\s/g, "").toLowerCase();
}

function courseMinutes(row: JsonRecord) {
  return (
    numberValue(row.durationMinutes || row.duration_minutes) ||
    numberValue(row.defaultMinutes || row.default_minutes) ||
    numberValue(row.minutes || row.minute)
  );
}

function catalogCourseLabel(course: JsonRecord | null | undefined) {
  return text(
    course?.course_name ||
      course?.courseName ||
      course?.route_name ||
      course?.routeName ||
      course?.name ||
      course?.title,
  );
}

function findCourseForBooking(booking: JsonRecord | undefined, courseCatalog: JsonRecord[]) {
  if (!booking) return null;

  const courseCandidates = [
    booking.course_id,
    booking.courseId,
    booking.course_name,
    booking.courseName,
    booking.course,
    booking.course_title,
    booking.courseTitle,
    booking.experience_course,
    booking.experienceCourse,
    booking.product_name,
    booking.productName,
  ]
    .map(normalizedKey)
    .filter(Boolean);

  if (courseCandidates.length === 0) return null;

  return (
    courseCatalog.find((course) => {
      const names = [
        course.course_id,
        course.courseId,
        course.course_name,
        course.courseName,
        course.route_name,
        course.routeName,
        course.name,
        course.title,
      ]
        .map(normalizedKey)
        .filter(Boolean);
      return courseCandidates.some((candidate) => names.includes(candidate));
    }) || null
  );
}

function courseNameForLog(row: JsonRecord, booking: JsonRecord | undefined, courseCatalog: JsonRecord[]) {
  const course = findCourseForBooking(booking, courseCatalog);
  const catalogLabel = catalogCourseLabel(course);
  if (catalogLabel) return catalogLabel;

  const bookingCourseName = text(
    booking?.course_name ||
      booking?.courseName ||
      booking?.course ||
      booking?.course_title ||
      booking?.courseTitle ||
      booking?.experience_course ||
      booking?.experienceCourse ||
      booking?.product_name ||
      booking?.productName,
  );
  if (bookingCourseName) return bookingCourseName;

  const directCourseName = text(
    row.course_name ||
      row.courseName ||
      row.course ||
      row.experience_course ||
      row.experienceCourse,
  );
  if (directCourseName) return directCourseName;

  return text(row.lesson_title || row.lessonTitle || row.training_items || row.trainingItems);
}

function flightContentForLog(row: JsonRecord, booking: JsonRecord | undefined, courseName: string) {
  const type = normalizeFlightType(row.training_type || row.trainingType);

  if (type === "체험비행") {
    return courseName || "-";
  }

  const logContent = text(
    row.training_items ||
      row.trainingItems ||
      row.lesson_title ||
      row.lessonTitle ||
      row.instructor_notes ||
      row.instructorNotes ||
      row.student_notes ||
      row.studentNotes ||
      row.memo,
  );

  const bookingContent = text(
    booking?.memo ||
      booking?.request_memo ||
      booking?.requestMemo ||
      booking?.note,
  );

  return logContent || courseName || bookingContent || "-";
}

function settlementMinutesForLog(row: JsonRecord, bookingMap: Map<string, JsonRecord>, courseCatalog: JsonRecord[]) {
  const type = normalizeFlightType(row.training_type || row.trainingType);

  if (type === "체험비행") {
    const bookingId = text(row.booking_id || row.bookingId);
    const course = findCourseForBooking(bookingMap.get(bookingId), courseCatalog);
    const minutes = course ? courseMinutes(course) : 0;
    if (minutes > 0) return minutes;
  }

  return numberValue(row.actual_flight_minutes || row.actualFlightMinutes || row.deducted_minutes || row.deductedMinutes);
}

function emptyStats(instructorId: string): MonthlyStats {
  return {
    instructorId,
    educationCount: 0,
    educationMinutes: 0,
    experienceCount: 0,
    experienceMinutes: 0,
    rideCount: 0,
    rideMinutes: 0,
    rentalCount: 0,
    rentalMinutes: 0,
    otherCount: 0,
    otherMinutes: 0,
    totalCount: 0,
    totalMinutes: 0,
    studentCount: 0,
    recentLogDate: "",
  };
}

async function loadInstructorSchedules() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("instructor_schedules")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) return [] as JsonRecord[];
  return ((data || []) as JsonRecord[]).map((row) => toCamelObject(row));
}

async function loadMonthlyStats(monthInput: string, instructors: JsonRecord[]) {
  const { month, startDate, endDate } = monthRange(monthInput);
  const supabase = getSupabaseServerClient();
  const stats: Record<string, MonthlyStats> = {};
  const details: Record<string, MonthlyFlightDetail[]> = {};
  const studentSet: Record<string, Set<string>> = {};

  instructors.forEach((row) => {
    const instructorId = text(row.instructorId || row.instructor_id);
    if (!instructorId) return;
    stats[instructorId] = emptyStats(instructorId);
    details[instructorId] = [];
    studentSet[instructorId] = new Set<string>();
  });

  const [{ data, error }, { data: bookingsData }, { data: courseData }] = await Promise.all([
    supabase
      .from("training_logs")
      .select("training_log_id,booking_id,student_id,student_name,user_id,instructor_id,instructor_name,aircraft_id,aircraft_name,training_date,scheduled_start_time,scheduled_end_time,actual_start_time,actual_end_time,scheduled_minutes,actual_flight_minutes,deducted_minutes,training_type,lesson_title,training_items,instructor_notes,student_notes,status")
      .gte("training_date", startDate)
      .lte("training_date", endDate),
    supabase
      .from("bookings")
      .select("booking_id,booking_date,course_name,course_id,course,course_title,experience_course,product_name,booking_type,reservation_type,duration_minutes,start_time,end_time,aircraft_name,aircraft_id,user_name,student_name,passenger_name,target_name,memo,request_memo,course_memo")
      .gte("booking_date", startDate)
      .lte("booking_date", endDate),
    supabase.from("course_catalog").select("*"),
  ]);

  if (error) return { month, stats };

  const bookingMap = new Map<string, JsonRecord>();
  ((bookingsData || []) as JsonRecord[]).forEach((booking) => {
    const id = text(booking.booking_id || booking.bookingId);
    if (id) bookingMap.set(id, booking);
  });
  const courseCatalog = (courseData || []) as JsonRecord[];

  ((data || []) as JsonRecord[]).forEach((row) => {
    const instructorId = text(row.instructor_id);
    if (!instructorId) return;

    const status = text(row.status).replace(/\s/g, "");
    if (["취소", "삭제", "반려"].includes(status)) return;

    const type = normalizeFlightType(row.training_type);

    if (!stats[instructorId]) {
      stats[instructorId] = emptyStats(instructorId);
      details[instructorId] = [];
      studentSet[instructorId] = new Set<string>();
    }

    const bookingId = text(row.booking_id || row.bookingId);
    const booking = bookingMap.get(bookingId);
    const minutes = settlementMinutesForLog(row, bookingMap, courseCatalog);
    const target = stats[instructorId];
    const courseName = courseNameForLog(row, booking, courseCatalog);

    if (type === "교육비행") {
      target.educationCount += 1;
      target.educationMinutes += minutes;
    } else if (type === "체험비행") {
      target.experienceCount += 1;
      target.experienceMinutes += minutes;
    } else if (type === "동승비행") {
      target.rideCount += 1;
      target.rideMinutes += minutes;
    } else if (type === "렌탈비행") {
      target.rentalCount += 1;
      target.rentalMinutes += minutes;
    } else {
      target.otherCount += 1;
      target.otherMinutes += minutes;
    }

    target.totalCount += 1;
    target.totalMinutes += minutes;

    const studentKey = text(row.student_id || row.student_name);
    if (studentKey) studentSet[instructorId].add(studentKey);

    const logDate = text(row.training_date);
    if (logDate && (!target.recentLogDate || logDate > target.recentLogDate)) {
      target.recentLogDate = logDate;
    }

    details[instructorId].push({
      id: text(row.training_log_id || row.trainingLogId) || `${bookingId}-${logDate}-${text(row.actual_start_time || row.scheduled_start_time)}`,
      bookingId,
      instructorId,
      flightDate: logDate,
      startTime: text(row.actual_start_time || row.scheduled_start_time || booking?.start_time || booking?.startTime).slice(0, 5),
      endTime: text(row.actual_end_time || row.scheduled_end_time || booking?.end_time || booking?.endTime).slice(0, 5),
      flightType: type,
      targetName: text(row.student_name || booking?.student_name || booking?.user_name || booking?.target_name || booking?.passenger_name),
      aircraftName: text(row.aircraft_name || booking?.aircraft_name || booking?.aircraft_id || row.aircraft_id),
      courseName,
      content: flightContentForLog(row, booking, courseName),
      actualMinutes: numberValue(row.actual_flight_minutes || row.actualFlightMinutes || row.scheduled_minutes || row.scheduledMinutes),
      settlementMinutes: minutes,
      status: text(row.status, "정산대상"),
    });
  });

  Object.keys(stats).forEach((instructorId) => {
    stats[instructorId].studentCount = studentSet[instructorId]?.size || 0;
    details[instructorId] = (details[instructorId] || []).sort((a, b) => {
      const dateCompare = a.flightDate.localeCompare(b.flightDate);
      if (dateCompare !== 0) return dateCompare;
      return a.startTime.localeCompare(b.startTime);
    });
  });

  return { month, stats, details };
}


async function verifyAdminPassword(email: string, password: string) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("비밀번호 확인을 위한 Supabase 공개 환경변수가 설정되어 있지 않습니다.");
  }

  if (!email || !password) {
    throw new Error("관리자 이메일과 비밀번호 확인이 필요합니다.");
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error("관리자 비밀번호가 일치하지 않습니다.");
  }

  const userRow = await findUserByEmail(email);
  const role = text(userRow?.role).toLowerCase();
  const status = text(userRow?.status);

  const isAdmin = role === "관리자" || role === "admin" || role === "administrator" || role === "master";
  const isActive = !status || status === "승인완료" || status === "승인" || status === "활성" || status.toLowerCase() === "approved" || status.toLowerCase() === "active";

  if (!isAdmin || !isActive) {
    throw new Error("관리자 권한이 확인되지 않았습니다.");
  }
}

async function deleteInstructor(data: JsonRecord) {
  const instructorId = text(data.instructorId || data.instructor_id);
  const adminEmail = normalizeEmail(data.adminEmail || data.admin_email);
  const confirmPassword = text(data.confirmPassword || data.confirm_password || data.password);

  if (!instructorId) throw new Error("삭제할 교관 ID가 필요합니다.");

  await verifyAdminPassword(adminEmail, confirmPassword);

  const supabase = getSupabaseServerClient();
  const { data: existing, error: readError } = await supabase
    .from(TABLE)
    .select("*")
    .eq(ID_COLUMN, instructorId)
    .maybeSingle();

  if (readError) throw new Error(`삭제할 교관 확인 실패: ${readError.message}`);
  if (!existing) throw new Error("삭제할 교관을 찾을 수 없습니다.");

  const instructor = existing as JsonRecord;
  const email = normalizeEmail(instructor.email);

  const { data: deleted, error } = await supabase
    .from(TABLE)
    .delete()
    .eq(ID_COLUMN, instructorId)
    .select("*")
    .single();

  if (error) throw new Error(`교관 삭제 실패: ${error.message}`);

  if (email) {
    try {
      await updateUserRowSafely("", email, {
        status: "비활성",
        role: "교관",
        member_type: "교관",
        memo: text((instructor as JsonRecord).memo),
        updated_at: nowIso(),
      });
    } catch {
      // users 테이블 구조 또는 기존 회원 부재 때문에 삭제 자체가 막히면 안 됩니다.
    }
  }

  return toCamelObject(deleted as JsonRecord);
}

async function handlePost(body: JsonRecord) {
  const action = text(body.action);
  const data = (body.data || body) as JsonRecord;

  if (action.startsWith("add") || action === "addRow") {
    const existingInstructor = await findInstructorByIdentity(data);

    if (existingInstructor) {
      const existingId = text(existingInstructor.instructorId || existingInstructor.instructor_id);
      await ensureInstructorUser({ ...data, userId: existingId, user_id: existingId }, true);
      const saved = await updateInstructorRow(existingId, normalize({ ...data, instructorId: existingId }, false));
      return { message: "이미 등록된 교관 계정을 찾아 정보를 연결했습니다.", [RESPONSE_KEY]: saved, data: saved };
    }

    const instructorId = text(data.instructorId || data.instructor_id) || await buildNextInstructorId();
    await ensureInstructorUser({ ...data, userId: instructorId, user_id: instructorId }, true);
    const saved = await insertInstructorRow(normalize({ ...data, instructorId }, true));
    return { message: "교관 계정과 교관 정보를 등록했습니다.", [RESPONSE_KEY]: saved, data: saved };
  }

  if (action.startsWith("update") || action === "updateRow") {
    const row = normalize(data, false);
    const id = text(data.instructorId || data.instructor_id || row[ID_COLUMN]);
    const saved = await updateInstructorRow(id, row);
    await syncInstructorUser({
      ...data,
      ...saved,
      userId: saved.userId || saved.user_id || data.userId || data.user_id || id,
      user_id: saved.userId || saved.user_id || data.userId || data.user_id || id,
      instructorId: id,
      instructor_id: id,
    });
    return { message: "교관 정보와 회원 계정을 수정했습니다.", [RESPONSE_KEY]: saved, data: saved };
  }

  if (action === "deleteInstructor" || action === "deleteRow") {
    const deleted = await deleteInstructor(data);
    return { message: "교관을 삭제했습니다.", deletedInstructor: deleted, data: deleted };
  }

  throw new Error(`지원하지 않는 action입니다: ${action}`);
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const monthParam = request.nextUrl.searchParams.get("month") || "";
    const rows = await selectRows(TABLE, { orderColumn: ORDER_COLUMN, ascending: true });
    const schedules = await loadInstructorSchedules();
    const monthly = await loadMonthlyStats(monthParam, rows);

    return NextResponse.json({
      ok: true,
      success: true,
      source: "supabase",
      service: SERVICE,
      [RESPONSE_KEY]: rows,
      instructorSchedules: schedules,
      monthlyStats: monthly.stats,
      monthlyFlightDetails: monthly.details,
      month: monthly.month,
      data: { [RESPONSE_KEY]: rows, instructorSchedules: schedules, monthlyStats: monthly.stats, monthlyFlightDetails: monthly.details },
      counts: { [RESPONSE_KEY]: rows.length, instructorSchedules: schedules.length },
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, success: false, source: "supabase", message: error instanceof Error ? error.message : "조회에 실패했습니다.", elapsedMs: Date.now() - startedAt }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = (await request.json()) as JsonRecord;
    const result = await handlePost(body);
    return NextResponse.json({ ok: true, success: true, source: "supabase", service: SERVICE, elapsedMs: Date.now() - startedAt, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, success: false, source: "supabase", message: error instanceof Error ? error.message : "처리에 실패했습니다.", elapsedMs: Date.now() - startedAt }, { status: 500 });
  }
}
