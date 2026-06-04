"use server";

import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BASE_URL || "";




const API_NO_STORE_HEADERS = { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" };
const APPS_SCRIPT_TIMEOUT_MS = 12_000;
const APPS_SCRIPT_RETRY_COUNT = 1;

function sleepApiRetry(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithApiTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= APPS_SCRIPT_RETRY_COUNT; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), APPS_SCRIPT_TIMEOUT_MS);

    try {
      const response = await globalThis.fetch(input, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.ok || attempt >= APPS_SCRIPT_RETRY_COUNT) {
        return response;
      }

      lastError = new Error(`Apps Script 응답 오류: ${response.status}`);
    } catch (error) {
      clearTimeout(timer);

      if (error instanceof Error && error.name === "AbortError") {
        lastError = new Error("Apps Script 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.");
      } else {
        lastError = error;
      }

      if (attempt >= APPS_SCRIPT_RETRY_COUNT) {
        throw lastError instanceof Error ? lastError : new Error("Apps Script 요청에 실패했습니다.");
      }
    }

    await sleepApiRetry(450 * (attempt + 1));
  }

  throw lastError instanceof Error ? lastError : new Error("Apps Script 요청에 실패했습니다.");
}

type ApiObject = Record<string, unknown>;

type CachedTrainingLogsGet = { expiresAt: number; data: ApiObject };
let trainingLogsGetCache: CachedTrainingLogsGet | undefined;
const TRAINING_LOGS_GET_CACHE_TTL_MS = 15_000;

function shouldBypassRouteCache(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return params.get("noCache") === "1" || params.get("refresh") === "1";
}

function clearTrainingLogsRouteCache() {
  trainingLogsGetCache = undefined;
}


function text(value: unknown, fallback = "") {
  const result = String(value ?? "").trim();
  return result || fallback;
}

function normalizeRows(data: unknown): ApiObject[] {
  if (Array.isArray(data)) return data as ApiObject[];

  if (data && typeof data === "object") {
    const obj = data as ApiObject;
    if (Array.isArray(obj.data)) return obj.data as ApiObject[];
    if (Array.isArray(obj.rows)) return obj.rows as ApiObject[];
    if (Array.isArray(obj.values)) return obj.values as ApiObject[];
    if (Array.isArray(obj.bookings)) return obj.bookings as ApiObject[];
    if (Array.isArray(obj.trainingLogs)) return obj.trainingLogs as ApiObject[];
  }

  return [];
}

function normalizeDate(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  if (raw.includes("T")) return raw.slice(0, 10);
  return raw.slice(0, 10);
}

function nowKstText() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  const hour = String(kst.getUTCHours()).padStart(2, "0");
  const minute = String(kst.getUTCMinutes()).padStart(2, "0");
  const second = String(kst.getUTCSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

function normalizeTime(value: unknown) {
  const raw = text(value);
  const match = raw.match(/(\d{1,2}):(\d{1,2})/);
  if (!match) return raw.slice(0, 5);
  return `${String(Number(match[1])).padStart(2, "0")}:${String(Number(match[2])).padStart(2, "0")}`;
}

function timeToMinutes(value: unknown) {
  const time = normalizeTime(value);
  const [hour, minute] = time.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function minutesBetween(startTime: unknown, endTime: unknown) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null || end <= start) return 0;
  return end - start;
}

function numberValue(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function boolValue(value: unknown) {
  return text(value).toUpperCase() === "TRUE";
}

function hoursToMinutes(value: unknown) {
  const num = numberValue(value);
  if (!num) return 0;
  return Math.round(num * 60);
}

function minutesToHours(value: number) {
  return Math.round((value / 60) * 10) / 10;
}

function existingTrainingLog(trainingLogs: ApiObject[], trainingLogId: string, bookingId: string) {
  return trainingLogs.find((item) => {
    if (trainingLogId && text(item.trainingLogId) === trainingLogId) return true;
    if (bookingId && text(item.bookingId) === bookingId) return true;
    return false;
  });
}

function findStudent(students: ApiObject[], log: ApiObject) {
  const studentId = text(log.studentId);
  const userId = text(log.userId);
  const studentName = text(log.studentName);

  return students.find((student) => {
    if (studentId && text(student.studentId) === studentId) return true;
    if (userId && text(student.userId) === userId) return true;
    if (studentName && text(student.name) === studentName) return true;
    return false;
  });
}

function chargeStudentKeys(row: ApiObject) {
  return [text(row.studentId), text(row.userId), text(row.studentName || row.name)].filter(Boolean);
}

function isChargeUsable(row: ApiObject) {
  const status = text(row.paymentStatus).replace(/\s/g, "");
  if (["환불", "취소"].includes(status)) return false;
  const remaining = numberValue(row.remainingMinutes) || hoursToMinutes(row.remainingHours);
  return remaining > 0;
}

function nextChargeUsage(charge: ApiObject, deductedMinutes: number, log: ApiObject) {
  const chargedMinutes =
    numberValue(charge.chargedMinutes || charge.chargeMinutes) ||
    hoursToMinutes(charge.chargeHours || charge.hours || charge.creditHours);
  const usedMinutes = numberValue(charge.usedMinutes || charge.usedTrainingMinutes) || hoursToMinutes(charge.usedHours);
  const nextUsedMinutes = usedMinutes + deductedMinutes;
  const nextRemainingMinutes = Math.max(chargedMinutes - nextUsedMinutes, 0);

  return {
    ...charge,
    sheetName: "trainingCharges",
    idHeader: "chargeId",
    chargedMinutes,
    chargeMinutes: chargedMinutes,
    chargeHours: minutesToHours(chargedMinutes),
    hours: minutesToHours(chargedMinutes),
    creditHours: minutesToHours(chargedMinutes),
    usedMinutes: nextUsedMinutes,
    usedTrainingMinutes: nextUsedMinutes,
    usedHours: minutesToHours(nextUsedMinutes),
    remainingMinutes: nextRemainingMinutes,
    remainingTrainingMinutes: nextRemainingMinutes,
    remainingHours: minutesToHours(nextRemainingMinutes),
    lastTrainingLogId: text(log.trainingLogId),
    lastTrainingDate: normalizeDate(log.trainingDate),
    updatedAt: nowKstText(),
  };
}

function findChargeForDeduction(trainingCharges: ApiObject[], log: ApiObject) {
  const logKeys = new Set(chargeStudentKeys(log));

  return trainingCharges
    .filter((charge) => chargeStudentKeys(charge).some((key) => logKeys.has(key)))
    .filter(isChargeUsable)
    .sort((a, b) => `${normalizeDate(a.chargeDate || a.date)} ${text(a.chargeId)}`.localeCompare(`${normalizeDate(b.chargeDate || b.date)} ${text(b.chargeId)}`, "ko"))[0];
}

function nextStudentUsage(student: ApiObject, deductedMinutes: number, log: ApiObject) {
  const usedMinutes =
    numberValue(student.usedTrainingMinutes) ||
    numberValue(student.usedMinutes) ||
    hoursToMinutes(student.usedTrainingHours || student.usedHours || student.totalUsedHours || student.totalFlightHours);

  const remainingMinutes =
    numberValue(student.remainingTrainingMinutes) ||
    numberValue(student.remainingMinutes) ||
    hoursToMinutes(student.remainingTrainingHours || student.remainingHours);

  const completedCount = numberValue(student.completedTrainingCount || student.trainingCount || student.completedFlightCount);
  const nextUsedMinutes = usedMinutes + deductedMinutes;
  const nextRemainingMinutes = remainingMinutes > 0 ? Math.max(0, remainingMinutes - deductedMinutes) : remainingMinutes;

  return {
    ...student,
    sheetName: "students",
    idHeader: "studentId",
    usedTrainingMinutes: nextUsedMinutes,
    usedMinutes: nextUsedMinutes,
    usedTrainingHours: minutesToHours(nextUsedMinutes),
    usedHours: minutesToHours(nextUsedMinutes),
    remainingTrainingMinutes: nextRemainingMinutes,
    remainingMinutes: nextRemainingMinutes,
    remainingTrainingHours: minutesToHours(nextRemainingMinutes),
    remainingHours: minutesToHours(nextRemainingMinutes),
    completedTrainingCount: completedCount + 1,
    lastTrainingLogId: text(log.trainingLogId),
    lastTrainingDate: normalizeDate(log.trainingDate),
    updatedAt: nowKstText(),
  };
}

async function applyStudentTimeDeduction(payload: ApiObject, previousLog: ApiObject | undefined, students: ApiObject[], trainingCharges: ApiObject[]) {
  if (!boolValue(payload.timeDeducted)) {
    return { deducted: false, deductedMinutes: 0, message: "" };
  }

  if (previousLog && boolValue(previousLog.timeDeducted)) {
    return {
      deducted: false,
      deductedMinutes: numberValue(previousLog.deductedMinutes || payload.deductedMinutes),
      message: "이미 차감된 교육일지입니다.",
    };
  }

  const deductedMinutes = Math.max(0, numberValue(payload.actualFlightMinutes || payload.deductedMinutes));

  if (!deductedMinutes) {
    throw new Error("차감할 실제 비행시간이 없습니다.");
  }

  const student = findStudent(students, payload);

  if (!student) {
    throw new Error("교육시간을 차감할 교육생을 찾지 못했습니다.");
  }

  const studentId = text(student.studentId);

  if (!studentId) {
    throw new Error("교육생 studentId가 없어 교육시간을 차감할 수 없습니다.");
  }

  const nextStudent = nextStudentUsage(student, deductedMinutes, payload);
  await postToAppsScript("updateRow", nextStudent);

  return {
    deducted: true,
    deductedMinutes,
    message: "교육생 비행시간/잔여시간 반영 완료",
  };
}

function isEducationBooking(row: ApiObject) {
  return `${text(row.bookingType)} ${text(row.courseName)}`.includes("교육");
}

function isCompletedBooking(row: ApiObject) {
  return text(row.status).replace(/\s/g, "") === "완료";
}

function buildTrainingLogId() {
  return `TL-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

async function readJsonResponse(response: Response, label: string) {
  const raw = await response.text();

  if (!raw.trim()) {
    throw new Error(`${label} 응답이 비어 있습니다.`);
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`${label} 응답을 JSON으로 변환하지 못했습니다.`);
  }
}

async function fetchSheet(sheetName: string, optional = true) {
  if (!API_URL) {
    if (optional) return [];
    throw new Error("NEXT_PUBLIC_API_URL 또는 NEXT_PUBLIC_BASE_URL이 설정되지 않았습니다.");
  }

  const url = new URL(API_URL);
  url.searchParams.set("action", "getTrainingLogsPageData");
  url.searchParams.set("sheet", sheetName);

  const response = await fetchWithApiTimeout(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    if (optional) return [];
    throw new Error(`Apps Script API 오류: ${response.status} (${sheetName})`);
  }

  const data = await readJsonResponse(response, `${sheetName} 시트`);
  return normalizeRows(data);
}

async function postToAppsScript(action: string, data: ApiObject) {
  if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL 또는 NEXT_PUBLIC_BASE_URL이 설정되지 않았습니다.");
  }

  const response = await fetchWithApiTimeout(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, data }),
  });

  const parsedData = await readJsonResponse(response, "Apps Script 처리");

  if (!response.ok) {
    throw new Error(`Apps Script API 오류: ${response.status}`);
  }

  if (
    parsedData &&
    typeof parsedData === "object" &&
    ((parsedData as ApiObject).ok === false || (parsedData as ApiObject).success === false)
  ) {
    const message = text((parsedData as ApiObject).message || (parsedData as ApiObject).error, "Apps Script 처리가 실패했습니다.");
    const targetSheet = text(data.sheetName || data.targetSheet || "unknown");
    throw new Error(`[${action}/${targetSheet}] ${message}`);
  }

  return parsedData;
}

function createPendingLogsFromBookings(bookings: ApiObject[], trainingLogs: ApiObject[]) {
  const existingBookingIds = new Set(trainingLogs.map((item) => text(item.bookingId)).filter(Boolean));

  return bookings
    .filter((booking) => isEducationBooking(booking) && isCompletedBooking(booking))
    .filter((booking) => {
      const bookingId = text(booking.bookingId);
      return bookingId && !existingBookingIds.has(bookingId);
    })
    .map((booking) => {
      const scheduledMinutes = minutesBetween(booking.startTime, booking.endTime);

      return {
        trainingLogId: "",
        bookingId: text(booking.bookingId),
        studentId: text(booking.studentId),
        studentName: text(booking.userName),
        userId: text(booking.userId),
        instructorId: text(booking.instructorId),
        instructorName: text(booking.instructorName),
        aircraftId: text(booking.aircraftId),
        aircraftName: text(booking.aircraftName || booking.aircraft),
        trainingDate: normalizeDate(booking.bookingDate),
        scheduledStartTime: normalizeTime(booking.startTime),
        scheduledEndTime: normalizeTime(booking.endTime),
        actualStartTime: normalizeTime(booking.startTime),
        actualEndTime: normalizeTime(booking.endTime),
        scheduledMinutes,
        actualFlightMinutes: scheduledMinutes,
        groundBriefingMinutes: 0,
        trainingType: text(booking.bookingType, "교육비행"),
        lessonTitle: text(booking.courseName, "교육비행"),
        trainingItems: "",
        instructorNotes: "",
        studentNotes: "",
        homework: "",
        cautionNotes: "",
        nextTrainingPlan: "",
        studentVisible: "FALSE",
        timeDeducted: "FALSE",
        deductedMinutes: 0,
        status: "작성대기",
        createdAt: "",
        updatedAt: "",
      };
    });
}

function validateTrainingLog(data: ApiObject) {
  if (!normalizeDate(data.trainingDate)) return "교육일자를 입력하세요.";
  if (!text(data.studentName)) return "교육생명이 없습니다.";
  if (!text(data.instructorName)) return "교관명이 없습니다.";

  const actualMinutes = Number(data.actualFlightMinutes || 0);
  if (!Number.isFinite(actualMinutes) || actualMinutes < 0) {
    return "실제 비행시간이 올바르지 않습니다.";
  }

  return "";
}

export async function GET(request: NextRequest) {
  try {
    if (!shouldBypassRouteCache(request) && trainingLogsGetCache && trainingLogsGetCache.expiresAt > Date.now()) {
      return NextResponse.json({
      lightweightAction: "getTrainingLogsPageData",
        ...trainingLogsGetCache.data,
        cached: true,
        cacheTtlSeconds: Math.ceil((trainingLogsGetCache.expiresAt - Date.now()) / 1000),
      });
    }
    const [trainingLogs, bookings, students, instructors, aircraft] = await Promise.all([
      fetchSheet("trainingLogs", true),
      fetchSheet("bookings", true),
      fetchSheet("students", true),
      fetchSheet("instructors", true),
      fetchSheet("aircraft", true),
    ]);

    const pendingLogs = createPendingLogsFromBookings(bookings, trainingLogs);

    const responseData: ApiObject = {
      ok: true,
      cached: false,
      cacheTtlSeconds: TRAINING_LOGS_GET_CACHE_TTL_MS / 1000,
      trainingLogs,
      pendingLogs,
      bookings,
      students,
      instructors,
      aircraft,
    };

    trainingLogsGetCache = {
      expiresAt: Date.now() + TRAINING_LOGS_GET_CACHE_TTL_MS,
      data: responseData,
    };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("[training-logs GET error]", error);

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "교육일지 데이터를 불러오지 못했습니다.",
        trainingLogs: [],
        pendingLogs: [],
        bookings: [],
        students: [],
        instructors: [],
        aircraft: [],
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    clearTrainingLogsRouteCache();
    const body = await request.json();
    const action = text(body.action);
    const data = (body.data || {}) as ApiObject;

    if (!["addTrainingLog", "updateTrainingLog"].includes(action)) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          message: `지원하지 않는 action입니다: ${action}`,
        },
        { status: 400 }
      );
    }

    const validationMessage = validateTrainingLog(data);

    if (validationMessage) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          message: validationMessage,
        },
        { status: 400 }
      );
    }

    const [trainingLogs, students, trainingCharges] = await Promise.all([
      fetchSheet("trainingLogs", true),
      fetchSheet("students", true),
      fetchSheet("trainingCharges", true),
    ]);

    const now = nowKstText();
    const payload: ApiObject = {
      ...data,
      trainingLogId: text(data.trainingLogId) || buildTrainingLogId(),
      trainingDate: normalizeDate(data.trainingDate),
      scheduledStartTime: normalizeTime(data.scheduledStartTime),
      scheduledEndTime: normalizeTime(data.scheduledEndTime),
      actualStartTime: normalizeTime(data.actualStartTime),
      actualEndTime: normalizeTime(data.actualEndTime),
      actualFlightMinutes: Number(data.actualFlightMinutes || 0),
      groundBriefingMinutes: Number(data.groundBriefingMinutes || 0),
      payableMinutes: Number(data.payableMinutes || data.actualFlightMinutes || 0),
      payMonth: text(data.payMonth) || normalizeDate(data.trainingDate).slice(0, 7),
      sourceType: text(data.bookingId) ? "booking" : "manual",
      noFlightReason: text(data.noFlightReason),
      studentVisible: text(data.studentVisible, "TRUE").toUpperCase() === "FALSE" ? "FALSE" : "TRUE",
      timeDeducted: text(data.timeDeducted, "TRUE").toUpperCase() === "FALSE" ? "FALSE" : "TRUE",
      deductedMinutes: Number(data.deductedMinutes || data.actualFlightMinutes || 0),
      status: text(data.status, "작성완료"),
      sheetName: "trainingLogs",
      targetSheet: "trainingLogs",
      idHeader: "trainingLogId",
      createdAt: text(data.createdAt) || now,
      updatedAt: now,
    };

    const previousLog = existingTrainingLog(trainingLogs, text(payload.trainingLogId), text(payload.bookingId));

    if (text(payload.status) === "비행없음") {
      payload.timeDeducted = "FALSE";
      payload.deductedMinutes = 0;
      payload.studentVisible = "FALSE";
    } else if (boolValue(payload.timeDeducted)) {
      payload.deductedMinutes = Number(payload.deductedMinutes || payload.actualFlightMinutes || 0);
      payload.status = "차감완료";
    }

    const result = await postToAppsScript(action, payload);
    clearTrainingLogsRouteCache();

    let deduction: ApiObject = {
      deducted: false,
      deductedMinutes: Number(payload.deductedMinutes || 0),
      message: "교육일지는 저장되었고, 교육시간 차감은 처리하지 않았습니다.",
    };

    if (boolValue(payload.timeDeducted)) {
      try {
        deduction = await applyStudentTimeDeduction(payload, previousLog, students, trainingCharges);
      } catch (deductionError) {
        console.warn("[training-logs deduction warning]", deductionError);
        deduction = {
          deducted: false,
          deductedMinutes: Number(payload.deductedMinutes || 0),
          warning: true,
          message: deductionError instanceof Error ? deductionError.message : "교육시간 차감 중 오류가 발생했습니다.",
        };
      }
    }

    return NextResponse.json({
      ok: true,
      success: true,
      trainingLog: payload,
      deduction,
      result,
    });
  } catch (error) {
    console.error("[training-logs POST error]", error);

    return NextResponse.json(
      {
        ok: false,
        success: false,
        message: error instanceof Error ? error.message : "교육일지 저장 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
