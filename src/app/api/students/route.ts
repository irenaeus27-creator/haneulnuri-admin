import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const API_URL = process.env.NEXT_PUBLIC_API_URL;




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

type CachedStudentsGet = { expiresAt: number; data: ApiObject };
let studentsGetCache: CachedStudentsGet | undefined;
const STUDENTS_GET_CACHE_TTL_MS = 20_000;

function shouldBypassRouteCache(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return params.get("noCache") === "1" || params.get("refresh") === "1";
}

function clearStudentsRouteCache() {
  studentsGetCache = undefined;
}


function normalizeRows(data: unknown): ApiObject[] {
  if (Array.isArray(data)) {
    return data as ApiObject[];
  }

  if (data && typeof data === "object") {
    const obj = data as ApiObject;

    if (Array.isArray(obj.data)) {
      return obj.data as ApiObject[];
    }

    if (Array.isArray(obj.rows)) {
      return obj.rows as ApiObject[];
    }

    if (Array.isArray(obj.students)) {
      return obj.students as ApiObject[];
    }
  }

  return [];
}

async function fetchSheet(sheetName: string, options: { optional?: boolean } = {}) {
  if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL이 설정되어 있지 않습니다.");
  }

  const url = new URL(API_URL);
  url.searchParams.set("action", "getSheet");
  url.searchParams.set("sheet", sheetName);

  const response = await fetchWithApiTimeout(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  const rawText = await response.text();

  if (!response.ok) {
    if (options.optional) {
      console.warn(`[students GET optional sheet skipped] ${sheetName}: Apps Script API 오류: ${response.status}`);
      return [];
    }

    throw new Error(`${sheetName} 시트 Apps Script API 오류: ${response.status}`);
  }

  if (!rawText.trim()) {
    if (options.optional) {
      console.warn(`[students GET optional sheet skipped] ${sheetName}: 응답이 비어 있습니다.`);
      return [];
    }

    throw new Error(`${sheetName} 시트 응답이 비어 있습니다.`);
  }

  let parsedData: unknown;

  try {
    parsedData = JSON.parse(rawText);
  } catch {
    if (options.optional) {
      console.warn(`[students GET optional sheet skipped] ${sheetName}: JSON 변환 실패`);
      return [];
    }

    throw new Error(`${sheetName} 시트 응답을 JSON으로 변환하지 못했습니다.`);
  }

  if (
    parsedData &&
    typeof parsedData === "object" &&
    "success" in parsedData &&
    (parsedData as ApiObject).success === false
  ) {
    const message =
      String((parsedData as ApiObject).message || "") ||
      `${sheetName} 시트를 불러오지 못했습니다.`;

    if (options.optional) {
      console.warn(`[students GET optional sheet skipped] ${sheetName}: ${message}`);
      return [];
    }

    throw new Error(message);
  }

  return normalizeRows(parsedData);
}

async function postToAppsScript(action: string, data: ApiObject) {
  if (!API_URL) {
    throw new Error("NEXT_PUBLIC_API_URL이 설정되어 있지 않습니다.");
  }

  const response = await fetchWithApiTimeout(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({
      action,
      data,
    }),
    cache: "no-store",
  });

  const rawText = await response.text();

  if (!response.ok) {
    throw new Error(`Apps Script API 오류: ${response.status}`);
  }

  if (!rawText.trim()) {
    throw new Error("Apps Script 응답이 비어 있습니다.");
  }

  let parsedData: unknown;

  try {
    parsedData = JSON.parse(rawText);
  } catch {
    throw new Error("Apps Script 응답을 JSON으로 변환하지 못했습니다.");
  }

  if (
    parsedData &&
    typeof parsedData === "object" &&
    ((parsedData as ApiObject).ok === false || (parsedData as ApiObject).success === false)
  ) {
    throw new Error(
      String((parsedData as ApiObject).message || (parsedData as ApiObject).error || "") ||
        "Apps Script 처리에 실패했습니다."
    );
  }

  return parsedData;
}

function buildStudentsFromUsers(users: ApiObject[]) {
  return users
    .filter((row) => {
      const role = String(row.role || row.userType || row.memberType || row.course || "");
      const status = String(row.status || "");

      return (
        role.includes("교육") ||
        status.includes("승인") ||
        String(row.trainingStatus || "").includes("교육")
      );
    })
    .map((row, index) => ({
      ...row,
      studentId: row.studentId || "",
      name: row.name || row.userName || "",
      phone: row.phone || row.mobile || "",
      email: row.email || "",
      course: row.course || "교육",
      trainingStatus: row.trainingStatus || "교육중",
      trainingStartDate: row.trainingStartDate || row.approvedAt || row.createdAt || "",
      assignedInstructorId: row.assignedInstructorId || "",
      assignedInstructorName: row.assignedInstructorName || "",
      assignedAircraftIds: row.assignedAircraftIds || "",
      memo: row.memo || "users 시트 기준 임시 표시",
      sourceSheet: "users",
    }));
}

function numericValue(value: unknown) {
  const num = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(num) ? num : 0;
}

function maxNumericValue(...values: unknown[]) {
  return values.reduce<number>((max, value) => Math.max(max, numericValue(value)), 0);
}

function studentIdentityKey(row: ApiObject) {
  const userId = String(row.userId || "").trim();
  const studentId = String(row.studentId || "").trim();
  const phone = String(row.phone || row.mobile || "").replace(/\D/g, "");
  const name = String(row.name || row.studentName || row.userName || "").trim();

  if (userId) return `user:${userId}`;
  if (phone) return `phone:${phone}`;
  if (studentId) return `student:${studentId}`;
  if (name) return `name:${name}`;

  return `row:${Math.random()}`;
}

function studentRowScore(row: ApiObject) {
  const fields = [
    "studentId",
    "userId",
    "name",
    "phone",
    "email",
    "trainingStartDate",
    "assignedInstructorId",
    "assignedInstructorName",
    "assignedAircraftIds",
    "totalChargedMinutes",
    "chargedTrainingMinutes",
    "remainingTrainingMinutes",
    "usedTrainingMinutes",
    "lastTrainingDate",
    "memo",
  ];

  return fields.reduce((sum, key) => sum + (String(row[key] || "").trim() ? 1 : 0), 0);
}

function mergeStudentRows(current: ApiObject, candidate: ApiObject) {
  const currentUpdatedAt = String(current.updatedAt || "");
  const candidateUpdatedAt = String(candidate.updatedAt || "");
  const candidateIsNewer = candidateUpdatedAt.localeCompare(currentUpdatedAt) > 0;
  const merged: ApiObject = { ...current };

  Object.entries(candidate).forEach(([key, value]) => {
    const currentValue = merged[key];
    const candidateText = String(value ?? "").trim();
    const currentText = String(currentValue ?? "").trim();

    if (!candidateText) return;

    if (!currentText) {
      merged[key] = value;
      return;
    }

    if (["totalChargedMinutes", "chargedTrainingMinutes", "initialChargeMinutes", "remainingTrainingMinutes", "usedTrainingMinutes"].includes(key)) {
      if (candidateIsNewer) merged[key] = value;
      return;
    }

    if (key === "updatedAt" && candidateIsNewer) {
      merged[key] = value;
      return;
    }

    if (candidateIsNewer && !["studentId", "userId"].includes(key)) {
      merged[key] = value;
    }
  });

  return merged;
}

function dedupeStudents(rows: ApiObject[]) {
  const map = new Map<string, ApiObject>();

  rows.forEach((row) => {
    const key = studentIdentityKey(row);
    const current = map.get(key);

    if (!current) {
      map.set(key, { ...row });
      return;
    }

    map.set(key, mergeStudentRows(current, row));
  });

  return Array.from(map.values());
}

function logMatchesStudent(log: ApiObject, student: ApiObject) {
  const logStudentId = String(log.studentId || "").trim();
  const logUserId = String(log.userId || "").trim();
  const logName = String(log.studentName || "").trim();
  const studentId = String(student.studentId || "").trim();
  const userId = String(student.userId || "").trim();
  const name = String(student.name || "").trim();

  return Boolean(
    (logStudentId && studentId && logStudentId === studentId) ||
      (logUserId && userId && logUserId === userId) ||
      (!logStudentId && !logUserId && logName && name && logName === name)
  );
}

function isDeductibleTrainingLog(log: ApiObject) {
  const status = String(log.status || "").trim();
  const deducted = String(log.timeDeducted || "").toUpperCase() === "TRUE";

  if (["취소", "비행없음", "작성대기", "수정필요"].includes(status)) return false;
  return deducted || ["작성완료", "차감완료", "학생공개"].includes(status);
}

function mergeTrainingLogUsage(students: ApiObject[], trainingLogs: ApiObject[]) {
  return students.map((student) => {
    const logs = trainingLogs.filter((log) => logMatchesStudent(log, student) && isDeductibleTrainingLog(log));
    const logUsedMinutes = logs.reduce((sum, log) => sum + numericValue(log.actualFlightMinutes || log.deductedMinutes), 0);
    const manualMinutes = numericValue(student.manualTrainingMinutes);
    const totalUsedMinutes = logUsedMinutes + manualMinutes;
    const chargedMinutes =
      numericValue(student.totalChargedMinutes) ||
      numericValue(student.chargedTrainingMinutes) ||
      numericValue(student.initialChargeMinutes) ||
      Math.round(numericValue(student.initialChargeHours) * 60);
    const remainingMinutes = Math.max(chargedMinutes - totalUsedMinutes, 0);
    const overusedMinutes = Math.max(totalUsedMinutes - chargedMinutes, 0);
    const usedHours = Math.round((totalUsedMinutes / 60) * 10) / 10;
    const remainingHours = Math.round((remainingMinutes / 60) * 10) / 10;

    const latestLog = logs
      .slice()
      .sort((a, b) => {
        const bKey = `${String(b.trainingDate || b.updatedAt || "")} ${String(b.actualStartTime || b.scheduledStartTime || "")}`;
        const aKey = `${String(a.trainingDate || a.updatedAt || "")} ${String(a.actualStartTime || a.scheduledStartTime || "")}`;
        return bKey.localeCompare(aKey);
      })[0];

    return {
      ...student,
      usedTrainingMinutes: totalUsedMinutes,
      usedMinutes: totalUsedMinutes,
      usedTrainingHours: usedHours,
      usedHours,
      loggedTrainingMinutes: logUsedMinutes,
      completedTrainingCount: logs.length + numericValue(student.manualTrainingCount),
      totalChargedMinutes: chargedMinutes,
      chargedTrainingMinutes: chargedMinutes,
      remainingTrainingMinutes: remainingMinutes,
      remainingMinutes,
      remainingTrainingHours: remainingHours,
      remainingHours,
      overusedTrainingMinutes: overusedMinutes,
      overusedMinutes,
      overusedTrainingHours: Math.round((overusedMinutes / 60) * 10) / 10,
      lastTrainingLogId: latestLog ? latestLog.trainingLogId || "" : student.lastTrainingLogId || "",
      lastTrainingDate: latestLog ? latestLog.trainingDate || "" : student.lastTrainingDate || student.lastFlightDate || student.recentFlightDate || "",
      lastFlightDate: latestLog ? latestLog.trainingDate || "" : student.lastFlightDate || student.recentFlightDate || student.lastTrainingDate || "",
      recentFlightDate: latestLog ? latestLog.trainingDate || "" : student.recentFlightDate || student.lastFlightDate || student.lastTrainingDate || "",
    };
  });
}

export async function GET(request: NextRequest) {
  try {
    if (!shouldBypassRouteCache(request) && studentsGetCache && studentsGetCache.expiresAt > Date.now()) {
      return NextResponse.json({
        ...studentsGetCache.data,
        cached: true,
        cacheTtlSeconds: Math.ceil((studentsGetCache.expiresAt - Date.now()) / 1000),
      });
    }
    const [studentsSheetRows, instructors, aircraft, users, trainingLogs] = await Promise.all([
      fetchSheet("students", { optional: true }),
      fetchSheet("instructors", { optional: true }),
      fetchSheet("aircraft", { optional: true }),
      fetchSheet("users", { optional: true }),
      fetchSheet("trainingLogs", { optional: true }),
    ]);

    const rawStudents =
      studentsSheetRows.length > 0 ? studentsSheetRows : buildStudentsFromUsers(users);
    const baseStudents = dedupeStudents(rawStudents);
    const students = mergeTrainingLogUsage(baseStudents, trainingLogs);

    const responseData: ApiObject = {
      ok: true,
      cached: false,
      cacheTtlSeconds: STUDENTS_GET_CACHE_TTL_MS / 1000,
      students,
      instructors,
      aircraft,
      trainingLogs,
      trainingLogsLinked: true,
      trainingLogsCount: trainingLogs.length,
      dedupedCount: rawStudents.length - baseStudents.length,
      source: studentsSheetRows.length > 0 ? "students" : "users-fallback",
    };

    studentsGetCache = {
      expiresAt: Date.now() + STUDENTS_GET_CACHE_TTL_MS,
      data: responseData,
    };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("[students GET error]", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "교육생 데이터를 불러오지 못했습니다.",
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
    clearStudentsRouteCache();
    const body = await request.json();

    const mode = String(body.mode || "").trim();
    const data = (body.data || {}) as ApiObject;

    if (!mode) {
      return NextResponse.json(
        {
          ok: false,
          message: "mode 값이 필요합니다.",
        },
        { status: 400 }
      );
    }

    if (mode === "add") {
      const result = await postToAppsScript("addStudent", data);
      clearStudentsRouteCache();

      return NextResponse.json({
        ok: true,
        result,
      });
    }

    if (mode === "update") {
      const result = await postToAppsScript("updateStudent", data);
      clearStudentsRouteCache();

      return NextResponse.json({
        ok: true,
        result,
        action: "updateStudent",
      });
    }

    return NextResponse.json(
      {
        ok: false,
        message: `지원하지 않는 mode입니다: ${mode}`,
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("[students POST error]", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "교육생 저장에 실패했습니다.",
      },
      { status: 500 }
    );
  }
}