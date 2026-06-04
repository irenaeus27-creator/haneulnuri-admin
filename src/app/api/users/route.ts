import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

type CachedUsersGet = { expiresAt: number; data: ApiObject };
let usersGetCache: CachedUsersGet | undefined;
const USERS_GET_CACHE_TTL_MS = 20_000;

function shouldBypassRouteCache(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return params.get("noCache") === "1" || params.get("refresh") === "1";
}

function clearUsersRouteCache() {
  usersGetCache = undefined;
}


function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeRows(data: unknown, key?: string): ApiObject[] {
  if (Array.isArray(data)) return data as ApiObject[];

  if (data && typeof data === "object") {
    const obj = data as ApiObject;

    if (key && Array.isArray(obj[key])) return obj[key] as ApiObject[];
    if (Array.isArray(obj.users)) return obj.users as ApiObject[];
    if (Array.isArray(obj.data)) return obj.data as ApiObject[];
    if (Array.isArray(obj.rows)) return obj.rows as ApiObject[];
    if (Array.isArray(obj.values)) return obj.values as ApiObject[];
  }

  return [];
}

async function readJsonResponse(response: Response, context: string) {
  const rawText = await response.text();

  if (!rawText.trim()) {
    throw new Error(`${context} 응답이 비어 있습니다.`);
  }

  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    throw new Error(`${context} 응답을 JSON으로 변환하지 못했습니다.`);
  }
}

async function fetchSheet(sheetName: string, optional = false) {
  if (!API_URL) {
    if (optional) return [];
    throw new Error("NEXT_PUBLIC_API_URL 또는 NEXT_PUBLIC_BASE_URL이 설정되어 있지 않습니다.");
  }

  try {
    const url = new URL(API_URL);
    url.searchParams.set("action", "getSheet");
    url.searchParams.set("sheet", sheetName);
    url.searchParams.set("_ts", String(Date.now()));

    const response = await fetchWithApiTimeout(url.toString(), {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      if (optional) return [];
      throw new Error(`${sheetName} 시트 Apps Script API 오류: ${response.status}`);
    }

    const parsedData = await readJsonResponse(response, `${sheetName} 시트`);

    if (
      parsedData &&
      typeof parsedData === "object" &&
      "success" in parsedData &&
      (parsedData as ApiObject).success === false
    ) {
      if (optional) return [];

      throw new Error(
        String((parsedData as ApiObject).message || "") ||
          `${sheetName} 시트를 불러오지 못했습니다.`
      );
    }

    return normalizeRows(parsedData, sheetName);
  } catch (error) {
    if (optional) return [];
    throw error;
  }
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
    body: JSON.stringify({ action, data }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Apps Script API 오류: ${response.status}`);
  }

  const parsedData = await readJsonResponse(response, "Apps Script");

  if (
    parsedData &&
    typeof parsedData === "object" &&
    "success" in parsedData &&
    (parsedData as ApiObject).success === false
  ) {
    throw new Error(
      String((parsedData as ApiObject).message || "") ||
        "Apps Script 처리에 실패했습니다."
    );
  }

  return parsedData;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeStatus(value: unknown) {
  const status = text(value).replace(/\s/g, "");

  if (["승인완료", "승인", "approved", "활성"].includes(status)) return "승인완료";
  if (["승인대기", "요청", "대기", "pending", "가입요청"].includes(status)) return "승인대기";
  if (["반려", "거절", "rejected"].includes(status)) return "반려";

  return status || "";
}

function buildApprovePayload(data: ApiObject) {
  return {
    ...data,
    userId: text(data.userId),
    status: "승인완료",
    approvedAt: text(data.approvedAt) || nowIso(),
  };
}

function buildRejectPayload(data: ApiObject) {
  return {
    ...data,
    userId: text(data.userId),
    status: "반려",
    rejectedAt: text(data.rejectedAt) || nowIso(),
  };
}

function findUser(users: ApiObject[], userId: string, fallback?: ApiObject) {
  const found = users.find((user) => text(user.userId) === userId);
  return found || fallback || { userId };
}

function detectJoinType(user: ApiObject) {
  const candidates = [
    user.joinType,
    user.signupType,
    user.memberType,
    user.userType,
    user.role,
    user.course,
    user.memo,
  ]
    .map((value) => text(value).replace(/\s/g, ""))
    .filter(Boolean);

  const joined = candidates.join(" ");

  if (
    joined.includes("렌탈") ||
    joined.toLowerCase().includes("rental") ||
    joined.includes("기장")
  ) {
    return "rentalPilot";
  }

  if (
    joined.includes("교육") ||
    joined.includes("교육생") ||
    joined.includes("학생") ||
    joined.toLowerCase().includes("student")
  ) {
    return "student";
  }

  return "";
}

function idNumber(value: string, prefix: string) {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = value.match(new RegExp(`^${escapedPrefix}[-_ ]?(\\d+)$`, "i"));
  return match ? Number(match[1]) : 0;
}

function nextId(rows: ApiObject[], field: string, prefix: string) {
  const max = rows.reduce((largest, row) => {
    const current = idNumber(text(row[field]), prefix);
    return Math.max(largest, current);
  }, 0);

  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

function samePerson(row: ApiObject, user: ApiObject) {
  const userId = text(user.userId);
  const phone = text(user.phone);
  const email = text(user.email);
  const name = text(user.name);

  if (userId && text(row.userId) === userId) return true;
  if (phone && text(row.phone) === phone) return true;
  if (email && text(row.email) === email) return true;
  if (name && text(row.name) === name && phone && text(row.phone) === phone) return true;

  return false;
}

function buildStudentData(user: ApiObject, students: ApiObject[]) {
  const existing = students.find((row) => samePerson(row, user));

  if (existing) {
    return { exists: true, data: existing };
  }

  return {
    exists: false,
    data: {
      studentId: nextId(students, "studentId", "S"),
      userId: text(user.userId),
      name: text(user.name),
      phone: text(user.phone),
      course: text(user.course) || "교육",
      trainingStartDate: "",
      trainingStatus: "교육중",
      assignedInstructorId: "",
      assignedInstructorName: "",
      assignedAircraftIds: "",
      memo: "회원 승인 시 자동 등록",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  };
}

function buildRentalPilotData(user: ApiObject, rentalPilots: ApiObject[]) {
  const existing = rentalPilots.find((row) => samePerson(row, user));

  if (existing) {
    return { exists: true, data: existing };
  }

  return {
    exists: false,
    data: {
      pilotId: nextId(rentalPilots, "pilotId", "RP"),
      userId: text(user.userId),
      name: text(user.name),
      phone: text(user.phone),
      email: text(user.email),
      licenseNo: text(user.licenseNo),
      medicalExpireDate: "",
      radioLicense: "",
      status: "활성",
      assignedAircraftIds: "",
      memo: "회원 승인 시 자동 등록",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  };
}

async function autoRegisterByJoinType(user: ApiObject) {
  const joinType = detectJoinType(user);

  if (!joinType) {
    return {
      type: "",
      skipped: true,
      message: "가입유형을 확인할 수 없어 운영 시트 자동 등록은 건너뛰었습니다.",
    };
  }

  if (joinType === "student") {
    const students = await fetchSheet("students", true);
    const built = buildStudentData(user, students);

    if (built.exists) {
      return {
        type: "student",
        skipped: true,
        message: "이미 교육생으로 등록되어 있습니다.",
        data: built.data,
      };
    }

    const result = await postToAppsScript("addStudent", built.data);

    return {
      type: "student",
      skipped: false,
      message: "교육생으로 자동 등록했습니다.",
      data: built.data,
      result,
    };
  }

  if (joinType === "rentalPilot") {
    const rentalPilots = await fetchSheet("rentalPilots", true);
    const built = buildRentalPilotData(user, rentalPilots);

    if (built.exists) {
      return {
        type: "rentalPilot",
        skipped: true,
        message: "이미 렌탈 기장으로 등록되어 있습니다.",
        data: built.data,
      };
    }

    const result = await postToAppsScript("addRentalPilot", built.data);

    return {
      type: "rentalPilot",
      skipped: false,
      message: "렌탈 기장으로 자동 등록했습니다.",
      data: built.data,
      result,
    };
  }

  return {
    type: joinType,
    skipped: true,
    message: "지원하지 않는 가입유형입니다.",
  };
}

export async function GET(request: NextRequest) {
  try {
    if (!shouldBypassRouteCache(request) && usersGetCache && usersGetCache.expiresAt > Date.now()) {
      return NextResponse.json({
        ...usersGetCache.data,
        cached: true,
        cacheTtlSeconds: Math.ceil((usersGetCache.expiresAt - Date.now()) / 1000),
      });
    }
    const users = await fetchSheet("users", true);

    const responseData: ApiObject = {
      ok: true,
      success: true,
      cached: false,
      cacheTtlSeconds: USERS_GET_CACHE_TTL_MS / 1000,
      users,
    };

    usersGetCache = {
      expiresAt: Date.now() + USERS_GET_CACHE_TTL_MS,
      data: responseData,
    };

    return NextResponse.json(responseData);
  } catch (error) {
    console.warn("[users GET warning]", error instanceof Error ? error.message : error);

    return NextResponse.json(
      {
        ok: true,
        warning: true,
        success: true,
        message:
          error instanceof Error
            ? error.message
            : "회원 데이터를 불러오지 못했습니다.",
        users: [],
      },
      { status: 200 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    clearUsersRouteCache();
    const body = (await request.json()) as ApiObject;
    const rawAction = text(body.action);
    const bodyData = ((body.data as ApiObject | undefined) || {}) as ApiObject;
    const userId = text(body.userId || bodyData.userId);

    if (!userId) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          message: "userId 값이 필요합니다.",
        },
        { status: 400 }
      );
    }

    if (rawAction === "approve" || rawAction === "approveUser" || rawAction === "approveUserAndRegister") {
      const approvedPayload = buildApprovePayload({ ...bodyData, userId });

      try {
        const result = await postToAppsScript("approveUserAndRegister", approvedPayload);

        return NextResponse.json({
          ok: true,
          success: true,
          result,
          user: approvedPayload,
          usedFastAction: true,
          message: "회원이 승인되었습니다.",
        });
      } catch (fastError) {
        const message = fastError instanceof Error ? fastError.message : "";

        if (!message.includes("지원하지 않는 action")) {
          throw fastError;
        }
      }

      const approveResult = await postToAppsScript("approveUser", approvedPayload);

      let autoRegistration:
        | {
            type?: string;
            skipped?: boolean;
            message?: string;
            data?: ApiObject;
            result?: unknown;
            error?: string;
          }
        | undefined;

      try {
        autoRegistration = await autoRegisterByJoinType(approvedPayload);
      } catch (autoError) {
        autoRegistration = {
          type: detectJoinType(approvedPayload),
          skipped: false,
          message: "회원 승인은 완료되었지만 운영 시트 자동 등록에 실패했습니다.",
          error: autoError instanceof Error ? autoError.message : "자동 등록 실패",
        };
      }

      return NextResponse.json({
        ok: true,
        success: true,
        result: approveResult,
        user: approvedPayload,
        usedFastAction: false,
        autoRegistration,
        message: autoRegistration?.error
          ? `회원 승인은 완료되었습니다. 다만 ${autoRegistration.error}`
          : autoRegistration?.message || "회원이 승인되었습니다.",
      });
    }

    if (rawAction === "reject" || rawAction === "rejectUser") {
      const rejectedPayload = buildRejectPayload({ ...bodyData, userId });
      const result = await postToAppsScript("rejectUser", rejectedPayload);

      return NextResponse.json({
        ok: true,
        success: true,
        result,
        user: rejectedPayload,
        message: "회원이 반려되었습니다.",
      });
    }

    return NextResponse.json(
      {
        ok: false,
        success: false,
        message: `지원하지 않는 action입니다: ${rawAction}`,
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("[users POST error]", error);

    return NextResponse.json(
      {
        ok: false,
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "회원 승인 처리 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
